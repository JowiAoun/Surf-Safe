/**
 * Generate PNG icons from SVG using sharp
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const iconsDir = path.join(__dirname, '../assets/icons');
const sizes = [16, 48, 128];

async function generateIcons() {
  for (const size of sizes) {
    const svgPath = path.join(iconsDir, `icon${size}.svg`);
    const pngPath = path.join(iconsDir, `icon${size}.png`);

    try {
      await sharp(svgPath)
        .resize(size, size)
        .png()
        .toFile(pngPath);

      console.log(`✓ Created ${pngPath}`);
    } catch (error) {
      console.error(`✗ Failed to create ${pngPath}:`, error.message);
    }
  }
}

generateIcons().catch(console.error);
