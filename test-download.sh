#!/bin/bash

# Test script for download functionality
# Usage: ./test-download.sh

API_KEY="sk_85014fe46e1c05d1bf3ebbe9f9a08315f1c653b3f67e90d58408195c9cce0a5c"
BASE_URL="http://localhost:3354"

echo "🧪 Testing Download Functionality"
echo "================================="
echo ""

# Get user info first
echo "1️⃣  Verifying API key..."
USER_INFO=$(curl -s -X GET "${BASE_URL}/api/auth/me" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json")

if echo "$USER_INFO" | grep -q "error"; then
  echo "❌ API key verification failed:"
  echo "$USER_INFO" | jq '.'
  exit 1
fi

echo "✅ API key valid!"
echo "$USER_INFO" | jq '{user: .user, accounts: .accounts}'
echo ""

# List collections
echo "2️⃣  Listing collections..."
COLLECTIONS=$(curl -s -X GET "${BASE_URL}/api/collections" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json")

if echo "$COLLECTIONS" | grep -q "error"; then
  echo "❌ Failed to list collections:"
  echo "$COLLECTIONS" | jq '.'
  exit 1
fi

echo "✅ Found collections:"
echo "$COLLECTIONS" | jq '.items[] | {id: .id, slug: .slug, name: .name, skillCount: .skillCount}'
echo ""

# Get first collection ID
COLLECTION_ID=$(echo "$COLLECTIONS" | jq -r '.items[0].id // empty')

if [ -z "$COLLECTION_ID" ]; then
  echo "⚠️  No collections found. Create a collection first."
  exit 0
fi

COLLECTION_SLUG=$(echo "$COLLECTIONS" | jq -r '.items[0].slug')
echo "📦 Testing with collection: ${COLLECTION_SLUG} (${COLLECTION_ID})"
echo ""

# Test 1: Generate download token
echo "3️⃣  Generating download token..."
TOKEN_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/collections/${COLLECTION_ID}/download" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"branch": "main", "expiresInMinutes": 10}')

if echo "$TOKEN_RESPONSE" | grep -q "error"; then
  echo "❌ Failed to generate token:"
  echo "$TOKEN_RESPONSE" | jq '.'
  exit 1
fi

echo "✅ Download token generated!"
echo "$TOKEN_RESPONSE" | jq '{downloadToken: .downloadToken, expiresAt: .expiresAt, estimatedSizeMB: .estimatedSizeMB}'
echo ""

DOWNLOAD_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.downloadToken')
DOWNLOAD_URL=$(echo "$TOKEN_RESPONSE" | jq -r '.downloadUrl')

echo "🔗 Download URL: ${DOWNLOAD_URL}"
echo ""

# Test 2: Download the zip file
echo "4️⃣  Downloading zip file..."
OUTPUT_FILE="./test-${COLLECTION_SLUG}.zip"

HTTP_CODE=$(curl -s -w "%{http_code}" -o "${OUTPUT_FILE}" \
  "${BASE_URL}/api/collections/${COLLECTION_ID}/download/${DOWNLOAD_TOKEN}")

if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ Download failed with HTTP code: ${HTTP_CODE}"
  cat "${OUTPUT_FILE}"
  rm -f "${OUTPUT_FILE}"
  exit 1
fi

echo "✅ Downloaded successfully!"
echo ""

# Verify zip file
echo "5️⃣  Verifying zip file..."
if [ ! -f "${OUTPUT_FILE}" ]; then
  echo "❌ Output file not found"
  exit 1
fi

FILE_SIZE=$(wc -c < "${OUTPUT_FILE}" | tr -d ' ')
echo "📊 File size: ${FILE_SIZE} bytes ($(echo "scale=2; ${FILE_SIZE}/1024" | bc) KB)"

# Check if it's a valid zip
if command -v unzip &> /dev/null; then
  echo ""
  echo "📋 Zip contents:"
  unzip -l "${OUTPUT_FILE}" | head -20
  echo ""
  
  # Test extraction
  TEST_DIR="./test-extract-${COLLECTION_SLUG}"
  mkdir -p "${TEST_DIR}"
  unzip -q "${OUTPUT_FILE}" -d "${TEST_DIR}"
  
  if [ $? -eq 0 ]; then
    echo "✅ Zip extraction successful!"
    echo ""
    echo "📂 Extracted files:"
    find "${TEST_DIR}" -type f | head -10
    
    # Check for manifest
    if [ -f "${TEST_DIR}/manifest.json" ]; then
      echo ""
      echo "📄 Manifest found:"
      cat "${TEST_DIR}/manifest.json" | jq '.'
    fi
    
    # Cleanup
    rm -rf "${TEST_DIR}"
  else
    echo "❌ Zip extraction failed"
  fi
else
  echo "⚠️  unzip not available, skipping extraction test"
fi

echo ""
echo "6️⃣  Testing token reuse (should fail)..."
HTTP_CODE=$(curl -s -w "%{http_code}" -o /dev/null \
  "${BASE_URL}/api/collections/${COLLECTION_ID}/download/${DOWNLOAD_TOKEN}")

if [ "$HTTP_CODE" == "403" ]; then
  echo "✅ Token correctly rejected (already used)"
else
  echo "⚠️  Expected 403, got ${HTTP_CODE}"
fi

echo ""
echo "================================="
echo "✅ All tests completed!"
echo ""
echo "📁 Downloaded file: ${OUTPUT_FILE}"
echo "💡 You can now test:"
echo "   - CLI: sdojo download <collection>"
echo "   - MCP: Use download_collection tool in Claude"
echo ""
echo "🧹 Cleanup:"
echo "   rm ${OUTPUT_FILE}"
