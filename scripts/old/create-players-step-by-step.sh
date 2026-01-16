#!/bin/bash

echo "🔍 Testing bulk player creation API..."
echo "======================================"

# Configuration
SESSION_ID="cmeejcmnl000l0q36twqkh3gf"
API_URL="http://localhost:3002"

echo "Session ID: $SESSION_ID"
echo "API URL: $API_URL"
echo ""

# First, let's check if the session exists
echo "1️⃣ Checking if session exists..."
session_check=$(curl -s "${API_URL}/api/sessions/${SESSION_ID}" -w "%{http_code}")
echo "Session check response: $session_check"
echo ""

# Create a single test player first
echo "2️⃣ Creating a single test player..."
test_player='[
  {
    "playerNumber": 1,
    "name": "Test Player",
    "gender": "MALE",
    "level": "TB",
    "levelDescription": "Test level",
    "phone": "0900000000",
    "requireConfirmInfo": false
  }
]'

echo "Test player data:"
echo "$test_player"
echo ""

echo "3️⃣ Sending API request..."
response=$(curl -s -X POST "${API_URL}/api/sessions/${SESSION_ID}/players/bulk" \
  -H "Content-Type: application/json" \
  -d "$test_player" \
  -w "HTTP_STATUS:%{http_code}")

http_status=$(echo "$response" | grep "HTTP_STATUS" | cut -d: -f2)
response_body=$(echo "$response" | sed '/HTTP_STATUS/d')

echo "HTTP Status: $http_status"
echo "Response Body:"
echo "$response_body"

# If successful, create the remaining 11 players
if [ "$http_status" = "200" ]; then
    echo ""
    echo "✅ Test successful! Now creating remaining 11 players..."
    
    remaining_players='[
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
    
    echo "Creating remaining 11 players..."
    final_response=$(curl -s -X POST "${API_URL}/api/sessions/${SESSION_ID}/players/bulk" \
      -H "Content-Type: application/json" \
      -d "$remaining_players" \
      -w "HTTP_STATUS:%{http_code}")
    
    final_http_status=$(echo "$final_response" | grep "HTTP_STATUS" | cut -d: -f2)
    final_response_body=$(echo "$final_response" | sed '/HTTP_STATUS/d')
    
    echo "Final HTTP Status: $final_http_status"
    echo "Final Response:"
    echo "$final_response_body"
    
    if [ "$final_http_status" = "200" ]; then
        echo ""
        echo "🎉 SUCCESS! All 12 players created successfully!"
    else
        echo ""
        echo "❌ Failed to create remaining players"
    fi
else
    echo ""
    echo "❌ Test failed. Check your session ID and server status."
fi
