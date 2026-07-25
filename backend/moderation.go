package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// moderationMaxBytes caps how large an object this will fetch and moderate —
// large enough for any AR marker photo, small enough to bound R2/OpenAI cost.
const moderationMaxBytes = 20 * 1024 * 1024

// moderateImageKey fetches the given R2 object and runs it through OpenAI's
// omni-moderation-latest model. This is the AUTHORITATIVE, server-side gate
// for PUBLIC AR target uploads — the frontend's own check
// (webar-app/src/utils/contentSafety.js) only runs in one of five upload
// flows and is trivially bypassed by calling the save API directly, so it
// cannot be relied on alone.
//
// Fails CLOSED: any error (missing key, R2 fetch failure, OpenAI outage,
// unexpected response) is treated as "flagged". The alternative — failing
// open on error — is exactly the loophole this function exists to close, so
// an upload that can't be verified must never silently go public.
func moderateImageKey(ctx context.Context, key string) (flagged bool, err error) {
	if key == "" {
		return false, nil
	}
	apiKey := os.Getenv("OPENAI_API_KEY")
	if apiKey == "" {
		return true, fmt.Errorf("OPENAI_API_KEY not configured")
	}
	if s3Client == nil || r2Bucket == "" {
		return true, fmt.Errorf("R2 not configured")
	}

	head, err := s3Client.HeadObject(ctx, &s3.HeadObjectInput{Bucket: aws.String(r2Bucket), Key: aws.String(key)})
	if err != nil {
		return true, fmt.Errorf("head %s: %w", key, err)
	}
	if head.ContentLength != nil && *head.ContentLength > moderationMaxBytes {
		return true, fmt.Errorf("%s too large to moderate (%d bytes)", key, *head.ContentLength)
	}
	contentType := "image/jpeg"
	if head.ContentType != nil && *head.ContentType != "" {
		contentType = *head.ContentType
	}

	obj, err := s3Client.GetObject(ctx, &s3.GetObjectInput{Bucket: aws.String(r2Bucket), Key: aws.String(key)})
	if err != nil {
		return true, fmt.Errorf("get %s: %w", key, err)
	}
	defer obj.Body.Close()
	data, err := io.ReadAll(io.LimitReader(obj.Body, moderationMaxBytes+1))
	if err != nil {
		return true, fmt.Errorf("read %s: %w", key, err)
	}

	dataURL := fmt.Sprintf("data:%s;base64,%s", contentType, base64.StdEncoding.EncodeToString(data))
	reqBody, _ := json.Marshal(map[string]interface{}{
		"model": "omni-moderation-latest",
		"input": []map[string]interface{}{
			{"type": "image_url", "image_url": map[string]string{"url": dataURL}},
		},
	})

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.openai.com/v1/moderations", bytes.NewReader(reqBody))
	if err != nil {
		return true, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+apiKey)
	httpReq.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return true, fmt.Errorf("moderation request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return true, fmt.Errorf("moderation API status %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		Results []struct {
			Flagged bool `json:"flagged"`
		} `json:"results"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return true, fmt.Errorf("decode moderation response: %w", err)
	}
	if len(result.Results) == 0 {
		return true, fmt.Errorf("empty moderation response")
	}
	return result.Results[0].Flagged, nil
}
