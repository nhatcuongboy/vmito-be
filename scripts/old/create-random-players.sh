#!/bin/bash

# Script to create 12 random players using curl
SESSION_ID="cmeejcmnl000l0q36twqkh3gf"
API_URL="http://localhost:3002"

echo "🚀 Creating 12 random players for session: $SESSION_ID"

# JSON data for 12 diverse players
PLAYERS_JSON='[
  {
    "playerNumber": 1,
    "name": "Nguyễn Văn Minh",
    "gender": "MALE",
    "level": "TB",
    "levelDescription": "Trung bình",
    "phone": "0901234567",
    "requireConfirmInfo": false
  },
  {
    "playerNumber": 2,
    "name": "Trần Thị Hương",
    "gender": "FEMALE",
    "level": "TB_PLUS",
    "levelDescription": "Trung bình mạnh",
    "phone": "0912345678",
    "requireConfirmInfo": true
  },
  {
    "playerNumber": 3,
    "name": "Lê Hoàng Nam",
    "gender": "MALE",
    "level": "Y_PLUS",
    "levelDescription": "Yếu hơn Trung bình - Yếu",
    "phone": "0923456789",
    "requireConfirmInfo": false
  },
  {
    "playerNumber": 4,
    "name": "Phan Thị Linh",
    "gender": "FEMALE",
    "level": "K",
    "levelDescription": "Khá",
    "phone": "0934567890",
    "requireConfirmInfo": true
  },
  {
    "playerNumber": 5,
    "name": "Vũ Minh Tuấn",
    "gender": "MALE",
    "level": "TBY",
    "levelDescription": "Trung bình - Yếu",
    "phone": "0945678901",
    "requireConfirmInfo": false
  },
  {
    "playerNumber": 6,
    "name": "Đặng Thị Hoa",
    "gender": "FEMALE",
    "level": "TB_MINUS",
    "levelDescription": "Trung bình yếu",
    "phone": "0956789012",
    "requireConfirmInfo": false
  },
  {
    "playerNumber": 7,
    "name": "Bùi Thành Đạt",
    "gender": "MALE",
    "level": "Y",
    "levelDescription": "Mức độ Yếu",
    "phone": "0967890123",
    "requireConfirmInfo": true
  },
  {
    "playerNumber": 8,
    "name": "Hoàng Thị Yến",
    "gender": "FEMALE",
    "level": "TB",
    "levelDescription": "Trung bình",
    "phone": "0978901234",
    "requireConfirmInfo": false
  },
  {
    "playerNumber": 9,
    "name": "Đinh Minh Hải",
    "gender": "MALE",
    "level": "TB_PLUS",
    "levelDescription": "Trung bình mạnh",
    "phone": "0989012345",
    "requireConfirmInfo": false
  },
  {
    "playerNumber": 10,
    "name": "Lý Thị Kim",
    "gender": "FEMALE",
    "level": "Y_MINUS",
    "levelDescription": "Yếu hơn mức Y",
    "phone": "0990123456",
    "requireConfirmInfo": true
  },
  {
    "playerNumber": 11,
    "name": "Phạm Thành Vinh",
    "gender": "MALE",
    "level": "K",
    "levelDescription": "Khá",
    "phone": "0991234567",
    "requireConfirmInfo": false
  },
  {
    "playerNumber": 12,
    "name": "Ngô Thị Vân",
    "gender": "FEMALE",
    "level": "TBY",
    "levelDescription": "Trung bình - Yếu",
    "phone": "0992345678",
    "requireConfirmInfo": true
  }
]'

echo "📋 Sending request to API..."

# Make the API request
response=$(curl -s -X POST "${API_URL}/api/sessions/${SESSION_ID}/players/bulk" \
  -H "Content-Type: application/json" \
  -d "$PLAYERS_JSON" \
  -w "\nHTTP_STATUS:%{http_code}")

# Extract HTTP status
http_status=$(echo "$response" | grep "HTTP_STATUS" | cut -d: -f2)
response_body=$(echo "$response" | sed '/HTTP_STATUS/d')

echo "📊 Response Status: $http_status"

if [ "$http_status" = "200" ]; then
    echo "✅ Players created successfully!"
    echo "📄 Response:"
    echo "$response_body" | jq '.' 2>/dev/null || echo "$response_body"
else
    echo "❌ Failed to create players"
    echo "📄 Error Response:"
    echo "$response_body" | jq '.' 2>/dev/null || echo "$response_body"
fi
