package main

import (
	"bytes"
	"context"
	"fmt"
	"image"
	"image/jpeg"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/google/uuid"

	_ "github.com/oov/psd" // registers "psd" with image.Decode
	"golang.org/x/image/draw"
)

// LibreOffice is slow to start (5-15s) and memory-hungry (~200-400MB per
// instance); only one conversion runs at a time so concurrent CDR uploads
// can't pile up and OOM the small Render instance.
var libreOfficeSem = make(chan struct{}, 1)

const (
	thumbnailMaxBytes = 40 * 1024 * 1024 // skip thumbnailing anything larger than this
	thumbnailMaxDim   = 900
	thumbnailQuality  = 85
)

// generateDocPreview fetches the just-uploaded document from R2, converts it
// to a JPG thumbnail if the format needs one (PSD/CDR have no in-browser
// renderer), uploads the thumbnail back to R2, and returns its key. Returns
// ("", nil) for formats that don't need a thumbnail or on any soft failure —
// thumbnailing is a nice-to-have and must never block saving the target.
func generateDocPreview(ctx context.Context, userID int64, docKey, ext string, targetIdx int) (string, error) {
	if ext != "psd" && ext != "cdr" {
		return "", nil
	}
	if s3Client == nil || s3Bucket == "" {
		return "", nil
	}

	head, err := s3Client.HeadObject(ctx, &s3.HeadObjectInput{Bucket: aws.String(s3Bucket), Key: aws.String(docKey)})
	if err != nil {
		log.Printf("[docPreview] head %s: %v", docKey, err)
		return "", nil
	}
	if head.ContentLength != nil && *head.ContentLength > thumbnailMaxBytes {
		log.Printf("[docPreview] %s too large for thumbnailing (%d bytes)", docKey, *head.ContentLength)
		return "", nil
	}

	obj, err := s3Client.GetObject(ctx, &s3.GetObjectInput{Bucket: aws.String(s3Bucket), Key: aws.String(docKey)})
	if err != nil {
		log.Printf("[docPreview] get %s: %v", docKey, err)
		return "", nil
	}
	defer obj.Body.Close()
	data, err := io.ReadAll(io.LimitReader(obj.Body, thumbnailMaxBytes+1))
	if err != nil {
		log.Printf("[docPreview] read %s: %v", docKey, err)
		return "", nil
	}

	var jpgBytes []byte
	switch ext {
	case "psd":
		jpgBytes, err = thumbnailPSD(data)
	case "cdr":
		jpgBytes, err = thumbnailCDR(ctx, data)
	}
	if err != nil || len(jpgBytes) == 0 {
		log.Printf("[docPreview] convert %s (%s): %v", docKey, ext, err)
		return "", nil
	}

	previewKey := fmt.Sprintf("users/%d/previews/target-%d-%d.jpg", userID, targetIdx, time.Now().UnixMilli())
	contentType := "image/jpeg"
	_, err = s3Client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(s3Bucket),
		Key:         aws.String(previewKey),
		Body:        bytes.NewReader(jpgBytes),
		ContentType: &contentType,
	})
	if err != nil {
		log.Printf("[docPreview] upload thumbnail for %s: %v", docKey, err)
		return "", nil
	}
	return previewKey, nil
}

// thumbnailPSD decodes the PSD's merged/composite image (pure Go, no system
// dependency) and re-encodes a resized JPG.
func thumbnailPSD(data []byte) ([]byte, error) {
	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("psd decode: %w", err)
	}
	return resizeToMaxJPEG(img, thumbnailMaxDim, thumbnailQuality)
}

// thumbnailCDR has no pure-Go decoder available — it shells out to
// LibreOffice headless (installed in the Docker runtime image) to render the
// drawing to PNG, then resizes/re-encodes it as a JPG the same way as PSD.
func thumbnailCDR(ctx context.Context, data []byte) ([]byte, error) {
	select {
	case libreOfficeSem <- struct{}{}:
		defer func() { <-libreOfficeSem }()
	case <-ctx.Done():
		return nil, ctx.Err()
	}

	id := uuid.NewString()
	workDir, err := os.MkdirTemp("", "cdr-"+id)
	if err != nil {
		return nil, fmt.Errorf("tempdir: %w", err)
	}
	defer os.RemoveAll(workDir)

	inPath := filepath.Join(workDir, "input.cdr")
	if err := os.WriteFile(inPath, data, 0o600); err != nil {
		return nil, fmt.Errorf("write input: %w", err)
	}

	profileDir := filepath.Join(workDir, "lo_profile")
	runCtx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()

	cmd := exec.CommandContext(runCtx, "soffice",
		"--headless", "--norestore", "--invisible",
		"-env:UserInstallation=file://"+filepath.ToSlash(profileDir),
		"--convert-to", "png",
		"--outdir", workDir,
		inPath,
	)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("soffice convert: %w (%s)", err, string(out))
	}

	pngPath := filepath.Join(workDir, "input.png")
	pngData, err := os.ReadFile(pngPath)
	if err != nil {
		return nil, fmt.Errorf("read soffice output: %w", err)
	}

	img, _, err := image.Decode(bytes.NewReader(pngData))
	if err != nil {
		return nil, fmt.Errorf("decode soffice png: %w", err)
	}
	return resizeToMaxJPEG(img, thumbnailMaxDim, thumbnailQuality)
}

func resizeToMaxJPEG(img image.Image, maxDim, quality int) ([]byte, error) {
	b := img.Bounds()
	w, h := b.Dx(), b.Dy()
	if w <= 0 || h <= 0 {
		return nil, fmt.Errorf("invalid image dimensions %dx%d", w, h)
	}
	scale := 1.0
	if w > maxDim || h > maxDim {
		if w > h {
			scale = float64(maxDim) / float64(w)
		} else {
			scale = float64(maxDim) / float64(h)
		}
	}
	dstW, dstH := int(float64(w)*scale), int(float64(h)*scale)
	if dstW < 1 {
		dstW = 1
	}
	if dstH < 1 {
		dstH = 1
	}
	dst := image.NewRGBA(image.Rect(0, 0, dstW, dstH))
	draw.CatmullRom.Scale(dst, dst.Bounds(), img, b, draw.Over, nil)

	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, dst, &jpeg.Options{Quality: quality}); err != nil {
		return nil, fmt.Errorf("jpeg encode: %w", err)
	}
	return buf.Bytes(), nil
}
