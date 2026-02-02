#!/bin/bash

# Create a test collection for testing download functionality

API_KEY="sk_85014fe46e1c05d1bf3ebbe9f9a08315f1c653b3f67e90d58408195c9cce0a5c"
BASE_URL="http://localhost:3354"

echo "🏗️  Creating Test Collection"
echo "=============================="
echo ""

# Get current user info
echo "1️⃣  Getting user info..."
USER_INFO=$(curl -s -X GET "${BASE_URL}/api/auth/me" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json")

USER_EMAIL=$(echo "$USER_INFO" | jq -r '.user.email')
ACCOUNT_SLUG=$(echo "$USER_INFO" | jq -r '.accounts[0].slug')

echo "✅ User: ${USER_EMAIL}"
echo "✅ Account: ${ACCOUNT_SLUG}"
echo ""

# Create collection
echo "2️⃣  Creating collection..."
COLLECTION_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/collections" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Skills",
    "slug": "test-skills",
    "description": "Test collection for download functionality",
    "visibility": "private"
  }')

if echo "$COLLECTION_RESPONSE" | grep -q "error"; then
  echo "❌ Failed to create collection:"
  echo "$COLLECTION_RESPONSE" | jq '.'
  
  # Check if collection already exists
  if echo "$COLLECTION_RESPONSE" | grep -q "already exists"; then
    echo ""
    echo "✅ Collection already exists, using existing one"
    
    # Get existing collection
    EXISTING=$(curl -s -X GET "${BASE_URL}/api/collections/by-slug/${ACCOUNT_SLUG}/test-skills" \
      -H "Authorization: Bearer ${API_KEY}")
    
    COLLECTION_ID=$(echo "$EXISTING" | jq -r '.id')
  else
    exit 1
  fi
else
  echo "✅ Collection created!"
  COLLECTION_ID=$(echo "$COLLECTION_RESPONSE" | jq -r '.id')
fi

echo "$COLLECTION_RESPONSE" | jq '{id: .id, slug: .slug, name: .name}'
echo ""

# Create some test skills
echo "3️⃣  Creating test skills..."

# Skill 1: Code Review
echo "Creating code-review skill..."
SKILL1=$(curl -s -X POST "${BASE_URL}/api/collections/${COLLECTION_ID}/skills" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "path": "code-review",
    "name": "Code Review",
    "description": "Assist with code review tasks",
    "content": "# Code Review Skill\n\nThis skill helps review code for:\n- Best practices\n- Bug detection\n- Performance issues\n- Security vulnerabilities\n\n## Usage\n\nAsk me to review code snippets or entire files."
  }')

if echo "$SKILL1" | grep -q "error"; then
  echo "⚠️  code-review: $(echo "$SKILL1" | jq -r '.error')"
else
  echo "✅ code-review created"
fi

# Skill 2: Debugging
echo "Creating debugging skill..."
SKILL2=$(curl -s -X POST "${BASE_URL}/api/collections/${COLLECTION_ID}/skills" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "path": "debugging",
    "name": "Debugging Helper",
    "description": "Help debug code issues",
    "content": "# Debugging Helper\n\nThis skill assists with:\n- Error analysis\n- Stack trace interpretation\n- Root cause identification\n- Fix suggestions\n\n## Debugging Process\n\n1. Analyze error message\n2. Review relevant code\n3. Identify potential causes\n4. Suggest fixes"
  }')

if echo "$SKILL2" | grep -q "error"; then
  echo "⚠️  debugging: $(echo "$SKILL2" | jq -r '.error')"
else
  echo "✅ debugging created"
fi

# Skill 3: Testing
echo "Creating testing skill..."
SKILL3=$(curl -s -X POST "${BASE_URL}/api/collections/${COLLECTION_ID}/skills" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "path": "testing",
    "name": "Test Writer",
    "description": "Generate unit tests",
    "content": "# Test Writer\n\nThis skill helps write:\n- Unit tests\n- Integration tests\n- E2E tests\n- Test fixtures\n\n## Best Practices\n\n- Write clear test names\n- Follow AAA pattern (Arrange, Act, Assert)\n- Test edge cases\n- Mock external dependencies"
  }')

if echo "$SKILL3" | grep -q "error"; then
  echo "⚠️  testing: $(echo "$SKILL3" | jq -r '.error')"
else
  echo "✅ testing created"
fi

echo ""
echo "=============================="
echo "✅ Test collection ready!"
echo ""
echo "Collection: ${ACCOUNT_SLUG}/test-skills"
echo "ID: ${COLLECTION_ID}"
echo ""
echo "💡 Now run: ./test-download.sh"
