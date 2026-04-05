Place your compiled MindAR target file here.

Filename: targets.mind

HOW TO GENERATE targets.mind
─────────────────────────────
1. Go to: https://hiukim.github.io/mind-ar-js-doc/tools/compile
2. Upload your marker images IN ORDER:
     - First image  → targetIndex 0  (matches AR_TARGETS[0] in arTargets.js)
     - Second image → targetIndex 1  (matches AR_TARGETS[1] in arTargets.js)
     - etc.
3. Click "Start" — compilation runs entirely in your browser (no upload to server)
4. Wait 30 seconds to 2 minutes depending on image count
5. Download the resulting targets.mind file
6. Place it in this folder: public/targets/targets.mind

WHAT MAKES A GOOD MARKER IMAGE
────────────────────────────────
✓ High contrast with rich texture (lots of edges and corners)
✓ Asymmetric — avoid patterns that look the same when rotated
✓ Minimum 300×300 pixels resolution
✓ JPEG or PNG format
✓ Matte finish when printed (glossy surfaces cause reflections)

✗ Avoid: solid colors, gradients, plain text on white background
✗ Avoid: very dark or very bright images with little detail
✗ Avoid: rotationally symmetric patterns (circles, regular polygons)

ADDING A NEW TARGET LATER
──────────────────────────
1. Re-upload ALL images to the compiler (existing + new ones)
   Keep the same order for existing images to preserve their targetIndex values
2. Download the new targets.mind and replace this file
3. Add a new entry to src/config/arTargets.js with the next targetIndex
4. Update maxTrack in MINDAR_CONFIG to match AR_TARGETS.length
