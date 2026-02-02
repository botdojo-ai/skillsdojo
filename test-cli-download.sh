#!/bin/bash

# Test CLI download functionality
# Usage: ./test-cli-download.sh

export SKILLSDOJO_TOKEN="sk_85014fe46e1c05d1bf3ebbe9f9a08315f1c653b3f67e90d58408195c9cce0a5c"

echo "🧪 Testing CLI Download Command"
echo "================================="
echo ""

# Build CLI first
echo "1️⃣  Building CLI..."
cd packages/cli
npm run build
if [ $? -ne 0 ]; then
  echo "❌ CLI build failed"
  exit 1
fi
echo "✅ CLI built successfully"
cd ../..
echo ""

# Get list of collections
echo "2️⃣  Listing your collections..."
node packages/cli/dist/index.js auth whoami
echo ""

# Test download command
echo "3️⃣  Testing download command..."
echo "Enter collection path (e.g., account/collection):"
read -p "Collection: " COLLECTION_PATH

if [ -z "$COLLECTION_PATH" ]; then
  echo "❌ No collection specified"
  exit 1
fi

OUTPUT_FILE="./cli-test-download.zip"

echo ""
echo "Downloading ${COLLECTION_PATH} to ${OUTPUT_FILE}..."
node packages/cli/dist/index.js download "${COLLECTION_PATH}" --output "${OUTPUT_FILE}"

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Download successful!"
  
  if [ -f "${OUTPUT_FILE}" ]; then
    FILE_SIZE=$(wc -c < "${OUTPUT_FILE}" | tr -d ' ')
    echo "📊 File size: ${FILE_SIZE} bytes"
    
    if command -v unzip &> /dev/null; then
      echo ""
      echo "📋 Zip contents (first 20 files):"
      unzip -l "${OUTPUT_FILE}" | head -20
    fi
  fi
else
  echo "❌ Download failed"
  exit 1
fi

echo ""
echo "================================="
echo "✅ CLI test completed!"
echo ""
echo "📁 Downloaded file: ${OUTPUT_FILE}"
echo ""
echo "💡 Next steps:"
echo "   - Test with specific skills: --skills 'skill1,skill2'"
echo "   - Test with different branch: --branch feature-123"
echo "   - Test from workspace: cd into cloned collection and run 'sdojo download'"
echo ""
echo "🧹 Cleanup: rm ${OUTPUT_FILE}"
