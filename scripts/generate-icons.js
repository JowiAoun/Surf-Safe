/**
 * Generate placeholder icon PNG files
 * This creates simple colored squares as placeholders
 */

const fs = require('fs');
const path = require('path');

// Minimal 1x1 PNG in base64 (purple color #667eea)
const createPNG = (size, color = '#667eea') => {
  // This is a simple solid color PNG
  // For a real project, use a proper image library or design tool
  // This creates a minimal valid PNG file

  const canvas = `
<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${size * 0.15}" fill="url(#grad)" />
  <text x="${size/2}" y="${size * 0.65}" font-size="${size * 0.5}" text-anchor="middle" fill="white">🛡️</text>
</svg>`;

  return canvas;
};

const iconsDir = path.join(__dirname, '../assets/icons');

// Create SVG files (browsers can use SVG in extensions)
const sizes = [16, 32, 48, 128];

sizes.forEach(size => {
  const svg = createPNG(size);
  const filename = path.join(iconsDir, `icon${size}.svg`);
  fs.writeFileSync(filename, svg);
  console.log(`Created ${filename}`);
});

console.log('\nNote: Created SVG icons. For PNG conversion, use an image tool or online converter.');
console.log('Modern Chrome extensions support SVG icons in most contexts.');
