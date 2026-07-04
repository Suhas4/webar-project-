const fs = require('fs');
let c = fs.readFileSync('GalleryScreen.jsx', 'utf8');

// The emoji F0 9F bytes were corrupted into multi-char sequences.
// Replace corrupted JSX string content with clean ASCII labels.
// Match the garbled patterns and fix them.

c = c.replace(/[""]\s*[^\s"]*URL[""]/g, '"Link"');
c = c.replace(/[""]\s*[^\s"]*3D Model[""]/g, '"3D Model"');
c = c.replace(/[""]\s*[^\s"]*Video[""]/g, '"Video"');

// Fix the isPublic badge text
c = c.replace(/[^\w\s>]+ Public/g, ' Public');

// Fix upload date icon prefix
c = c.replace(/[^\w\s{<]+\s*\{uploadDate\}/g, '{uploadDate}');

// Fix back button arrows
c = c.replace(/[^\x00-\x7F]+\s*Back/g, '← Back');

// Fix play button
c = c.replace(/[^\x00-\x7F]+<\/button>\s*\)\s*\}\s*\{t\.targetType === "url"/g,
  '▶</button>\n                )}\n                {t.targetType === "url"');

fs.writeFileSync('GalleryScreen.jsx', c, 'utf8');
console.log('done');
