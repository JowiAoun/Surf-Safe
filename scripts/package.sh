#!/bin/bash

# SurfSafe Distribution Packaging Script
# Creates a .zip file ready for Chrome Web Store submission

set -e

echo "SurfSafe Distribution Packager"
echo "=============================="

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
DIST_DIR="dist"
OUTPUT_DIR="releases"
VERSION=$(node -p "require('./package.json').version")
ZIP_NAME="surfsafe-v${VERSION}.zip"

echo -e "${YELLOW}Version: ${VERSION}${NC}"

# Step 1: Clean previous build
echo ""
echo "📦 Step 1: Cleaning previous build..."
rm -rf "$DIST_DIR"
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

# Step 2: Run tests
echo ""
echo "🧪 Step 2: Running tests..."
npm test -- --run

# Step 3: Type check
echo ""
echo "🔍 Step 3: Type checking..."
npm run type-check

# Step 4: Production build
echo ""
echo "🔨 Step 4: Building production bundle..."
npm run build

# Step 5: Verify build output
echo ""
echo "✅ Step 5: Verifying build output..."

if [ ! -f "$DIST_DIR/manifest.json" ]; then
    echo "❌ Error: manifest.json not found in dist/"
    exit 1
fi

if [ ! -d "$DIST_DIR/src" ]; then
    echo "❌ Error: src directory not found in dist/"
    exit 1
fi

echo "   - manifest.json: ✓"
echo "   - src/popup/: ✓"
echo "   - src/options/: ✓"
echo "   - assets/: ✓"

# Step 6: Create zip
echo ""
echo "📥 Step 6: Creating distribution package..."
cd "$DIST_DIR"
zip -r "../$OUTPUT_DIR/$ZIP_NAME" . -x "*.map" -x ".vite/*"
cd ..

# Step 7: Display results
echo ""
echo -e "${GREEN}✨ Package created successfully!${NC}"
echo ""
echo "📁 Output: $OUTPUT_DIR/$ZIP_NAME"
echo "📊 Size: $(du -h "$OUTPUT_DIR/$ZIP_NAME" | cut -f1)"
echo ""
echo "Contents:"
unzip -l "$OUTPUT_DIR/$ZIP_NAME" | tail -n +4 | head -n -2

echo ""
echo "🚀 Ready for Chrome Web Store submission!"
echo ""
echo "Next steps:"
echo "  1. Go to https://chrome.google.com/webstore/devconsole"
echo "  2. Create new item or upload to existing"
echo "  3. Upload $OUTPUT_DIR/$ZIP_NAME"
echo "  4. Fill in store listing details"
echo "  5. Submit for review"
