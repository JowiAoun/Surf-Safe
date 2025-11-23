# Icon Assets

## Required Icons

The extension requires the following icon sizes:
- `icon16.png` - 16x16 pixels
- `icon48.png` - 48x48 pixels
- `icon128.png` - 128x128 pixels

## Creating Icons

### Option 1: Use the SVG Template
A template SVG file is provided in `icon.svg`. You can:
1. Edit it in any SVG editor (Inkscape, Figma, etc.)
2. Export to PNG at required sizes

### Option 2: Online Tools
Use online tools like:
- https://favicon.io/
- https://realfavicongenerator.net/

### Option 3: Command Line (if tools available)
```bash
# Using ImageMagick
convert icon.svg -resize 16x16 icon16.png
convert icon.svg -resize 48x48 icon48.png
convert icon.svg -resize 128x128 icon128.png

# Using rsvg-convert
rsvg-convert -w 16 -h 16 icon.svg > icon16.png
rsvg-convert -w 48 -h 48 icon.svg > icon48.png
rsvg-convert -w 128 -h 128 icon.svg > icon128.png
```

## Temporary Placeholder

For development, you can use any PNG images with the correct dimensions.
The build will fail if these files are missing.

## Design Guidelines

The icons should represent security/safety:
- Shield icon (🛡️)
- Lock icon (🔒)
- Check mark with shield
- Colors: Purple gradient (#667eea to #764ba2)
