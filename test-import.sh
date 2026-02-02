#!/bin/bash

# Test import functionality
API_KEY="sk_85014fe46e1c05d1bf3ebbe9f9a08315f1c653b3f67e90d58408195c9cce0a5c"
BASE_URL="http://localhost:3354"
COLLECTION_ID="3a3e20ab-3854-4152-b809-05a10286bb82"

echo "🧪 Testing Import Functionality"
echo "================================="
echo ""

# First, download a collection to get a test zip
echo "1️⃣  Downloading test collection..."
./test-download.sh > /dev/null 2>&1

if [ ! -f "test-personal.zip" ]; then
  echo "❌ Failed to create test zip file"
  exit 1
fi

echo "✅ Test zip file ready: test-personal.zip"
echo ""

# Test import
echo "2️⃣  Testing zip import..."
IMPORT_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/collections/${COLLECTION_ID}/import" \
  -H "Authorization: Bearer ${API_KEY}" \
  -F "file=@test-personal.zip" \
  -F "overwrite=true" \
  -F "createPullRequest=true" \
  -F "prTitle=Test import from zip" \
  -F "prDescription=Testing the import functionality")

echo "$IMPORT_RESPONSE" | jq '.'

if echo "$IMPORT_RESPONSE" | grep -q '"success":true'; then
  echo ""
  echo "✅ Import successful!"
  echo ""
  echo "📊 Import stats:"
  echo "$IMPORT_RESPONSE" | jq '.stats'
  
  if echo "$IMPORT_RESPONSE" | grep -q '"imported"'; then
    echo ""
    echo "📝 Imported skills:"
    echo "$IMPORT_RESPONSE" | jq '.imported'
  fi
  
  if echo "$IMPORT_RESPONSE" | grep -q '"updated"'; then
    echo ""
    echo "🔄 Updated skills:"
    echo "$IMPORT_RESPONSE" | jq '.updated'
  fi
  
  if echo "$IMPORT_RESPONSE" | grep -q '"failed"' && [ "$(echo "$IMPORT_RESPONSE" | jq '.failed | length')" -gt 0 ]; then
    echo ""
    echo "❌ Failed:"
    echo "$IMPORT_RESPONSE" | jq '.failed'
  fi
else
  echo ""
  echo "❌ Import failed"
fi

echo ""
echo "================================="
echo "✅ Import test completed!"
echo ""
echo "🧹 Cleanup: rm test-personal.zip test-reimport.zip"
