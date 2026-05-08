#!/bin/bash
# 🧪 Quick test commands for BDS FFmpeg Server

echo "🎬 BDS FFmpeg Server - Test Suite"
echo "════════════════════════════════"

# Check server health
echo -e "\n🔍 Testing health endpoint..."
curl -s http://localhost:4000/api/ffmpeg/health | jq .

# Get API key from .env (if exists)
if [ -f .env ]; then
  API_KEY=$(grep API_SECRET_KEY .env | cut -d'=' -f2 | tr -d '[:space:]')
  echo -e "\n🔑 API Key found: ${API_KEY:0:10}..."
else
  echo -e "\n⚠️  .env not found - skipping auth tests"
  exit 0
fi

# Test with a small file (if exists)
if [ -f test.mp4 ]; then
  echo -e "\n🎬 Testing file processing..."
  curl -s -X POST http://localhost:4000/api/ffmpeg/process \
    -H "x-api-key: $API_KEY" \
    -F "file=@test.mp4" \
    -F "volume=1.2" \
    -F "fadeIn=0.5" | jq .
else
  echo -e "\n⚠️  test.mp4 not found - skipping processing test"
  echo "💡 Create a small test.mp4 file to test processing"
fi

echo -e "\n✅ Test suite complete"
