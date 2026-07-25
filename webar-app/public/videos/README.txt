Place your video files here.

Expected files for the default config:
  demo1.mp4   → plays when Target 0 is detected
  demo2.mp4   → plays when Target 1 is detected

VIDEO REQUIREMENTS
──────────────────
Format:   H.264 MP4 (most compatible across iOS Safari + Android Chrome)
Audio:    NONE — remove audio track entirely (videos must be muted for autoplay)
Size:     Under 10 MB per video (aim for 3–5 MB for fast mobile loading)
Resolution: Max 1280×720 (720p) — higher resolution wastes bandwidth on mobile

OPTIMIZE WITH FFMPEG
─────────────────────
# Standard optimization command:
ffmpeg -i input.mp4 \
  -vcodec libx264 \
  -crf 28 \
  -preset fast \
  -movflags +faststart \
  -vf "scale='min(1280,iw)':-2" \
  -an \
  output.mp4

Flags explained:
  -crf 28          Quality (18=lossless, 28=good web quality, 35=low quality)
  -preset fast     Encoding speed vs compression tradeoff
  -movflags +faststart  Move MP4 metadata to front (enables streaming start)
  -vf scale        Scale to max 1280px wide, preserve aspect ratio
  -an              Remove audio track entirely

# Check output:
ffprobe -v quiet -show_streams output.mp4

ASPECT RATIOS → planeHeight in arTargets.js
────────────────────────────────────────────
16:9 (landscape, most common) → planeHeight: 0.5625
4:3  (landscape)              → planeHeight: 0.75
1:1  (square)                 → planeHeight: 1.0
9:16 (portrait/vertical)      → planeHeight: 1.7778

SWITCHING TO CDN STORAGE
─────────────────────────
When ready for production, upload videos to AWS S3, Cloudinary, or Supabase Storage.
Then update videoUrl in src/config/arTargets.js:

  Before: videoUrl: '/videos/demo1.mp4'
  After:  videoUrl: 'https://your-cdn.com/videos/demo1.mp4'

That's the only change needed — no code changes required.
Make sure your CDN serves videos with:
  Access-Control-Allow-Origin: *   (or your specific domain)
  Content-Type: video/mp4
