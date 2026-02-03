#!/bin/bash

# Test script for Bulk Session Creation API
# Usage: ./test-bulk-sessions.sh <JWT_TOKEN>

if [ -z "$1" ]; then
  echo "Usage: ./test-bulk-sessions.sh <JWT_TOKEN>"
  echo "Example: ./test-bulk-sessions.sh eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  exit 1
fi

JWT_TOKEN="$1"
API_URL="${API_URL:-http://localhost:3000}"

echo "🧪 Testing Bulk Session Creation API"
echo "API URL: $API_URL"
echo "=========================================="
echo ""

# Test 1: Single Mode
echo "📝 Test 1: Single Mode"
echo "Expected: 1 session created"
echo ""
curl -X POST "$API_URL/sessions/bulk" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "single",
    "baseSession": {
      "name": "Test Single Session",
      "hostName": "Test Host",
      "hostPhone": "0123456789",
      "startTime": "2024-02-10T18:00:00Z",
      "endTime": "2024-02-10T20:00:00Z",
      "numberOfCourts": 2,
      "sessionDuration": 120,
      "maxPlayersPerCourt": 8,
      "requirePlayerInfo": true,
      "allowGuestJoin": true,
      "allowNewPlayers": true,
      "courtColor": "#179a3b",
      "venue": {
        "placeId": "test-single-place-id",
        "name": "Test Venue Single",
        "address": "123 Test St",
        "city": "Test City"
      }
    }
  }' | jq '.'

echo ""
echo "=========================================="
echo ""

# Test 2: Specific Dates Mode
echo "📝 Test 2: Specific Dates Mode"
echo "Expected: 4 sessions created (base + 3 clones)"
echo ""
curl -X POST "$API_URL/sessions/bulk" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "specific-dates",
    "baseSession": {
      "name": "Test Specific Dates",
      "hostName": "Test Host",
      "hostPhone": "0123456789",
      "startTime": "2024-02-05T18:00:00Z",
      "endTime": "2024-02-05T20:00:00Z",
      "numberOfCourts": 2,
      "sessionDuration": 120,
      "maxPlayersPerCourt": 8,
      "requirePlayerInfo": true,
      "allowGuestJoin": true,
      "allowNewPlayers": true,
      "courtColor": "#179a3b",
      "venue": {
        "placeId": "test-specific-place-id",
        "name": "Test Venue Specific",
        "address": "123 Test St",
        "city": "Test City"
      }
    },
    "specificDates": {
      "dates": [
        "2024-02-12T00:00:00Z",
        "2024-02-19T00:00:00Z",
        "2024-02-26T00:00:00Z"
      ]
    }
  }' | jq '.'

echo ""
echo "=========================================="
echo ""

# Test 3: Recurring Weekdays Mode
echo "📝 Test 3: Recurring Weekdays Mode (Mon, Wed, Fri for 2 weeks)"
echo "Expected: 6 sessions created"
echo ""
curl -X POST "$API_URL/sessions/bulk" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "recurring-weekdays",
    "baseSession": {
      "name": "Test Recurring MWF",
      "hostName": "Test Host",
      "hostPhone": "0123456789",
      "startTime": "2024-02-05T18:00:00Z",
      "endTime": "2024-02-05T20:00:00Z",
      "numberOfCourts": 2,
      "sessionDuration": 120,
      "maxPlayersPerCourt": 8,
      "requirePlayerInfo": true,
      "allowGuestJoin": true,
      "allowNewPlayers": true,
      "courtColor": "#179a3b",
      "venue": {
        "placeId": "test-recurring-place-id",
        "name": "Test Venue Recurring",
        "address": "123 Test St",
        "city": "Test City"
      }
    },
    "recurringWeekdays": {
      "weekdays": [1, 3, 5],
      "numberOfWeeks": 2
    }
  }' | jq '.'

echo ""
echo "=========================================="
echo ""

# Test 4: With Fee Config
echo "📝 Test 4: Bulk with Fee Configuration"
echo "Expected: Sessions created with fee config"
echo ""
curl -X POST "$API_URL/sessions/bulk" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "specific-dates",
    "baseSession": {
      "name": "Test with Fees",
      "hostName": "Test Host",
      "hostPhone": "0123456789",
      "startTime": "2024-03-01T18:00:00Z",
      "endTime": "2024-03-01T20:00:00Z",
      "numberOfCourts": 2,
      "sessionDuration": 120,
      "maxPlayersPerCourt": 8,
      "requirePlayerInfo": true,
      "allowGuestJoin": true,
      "allowNewPlayers": true,
      "courtColor": "#179a3b",
      "venue": {
        "placeId": "test-fee-place-id",
        "name": "Test Venue Fee",
        "address": "123 Test St",
        "city": "Test City"
      },
      "feeConfig": {
        "feeType": "FIXED",
        "maleFee": 50000,
        "femaleFee": 40000,
        "notes": "Test fee notes"
      }
    },
    "specificDates": {
      "dates": ["2024-03-08T00:00:00Z"]
    }
  }' | jq '.'

echo ""
echo "=========================================="
echo ""

# Test 5: Error Test - Invalid Mode
echo "📝 Test 5: Error Test - Invalid Mode"
echo "Expected: 400 Bad Request"
echo ""
curl -X POST "$API_URL/sessions/bulk" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "invalid-mode",
    "baseSession": {
      "name": "Test Invalid",
      "hostName": "Test Host",
      "hostPhone": "0123456789",
      "startTime": "2024-02-10T18:00:00Z",
      "endTime": "2024-02-10T20:00:00Z",
      "venue": {
        "placeId": "test",
        "name": "Test",
        "address": "Test"
      }
    }
  }' | jq '.'

echo ""
echo "=========================================="
echo ""

# Test 6: Error Test - Missing Required Config
echo "📝 Test 6: Error Test - Missing specificDates config"
echo "Expected: 400 Bad Request"
echo ""
curl -X POST "$API_URL/sessions/bulk" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "specific-dates",
    "baseSession": {
      "name": "Test Missing Config",
      "hostName": "Test Host",
      "hostPhone": "0123456789",
      "startTime": "2024-02-10T18:00:00Z",
      "endTime": "2024-02-10T20:00:00Z",
      "venue": {
        "placeId": "test",
        "name": "Test",
        "address": "Test"
      }
    }
  }' | jq '.'

echo ""
echo "=========================================="
echo ""
echo "✅ All tests completed!"
echo ""
echo "Summary:"
echo "- Test 1: Single mode → 1 session"
echo "- Test 2: Specific dates → 4 sessions"
echo "- Test 3: Recurring weekdays → 6 sessions"
echo "- Test 4: With fee config → 2 sessions"
echo "- Test 5: Invalid mode → Error"
echo "- Test 6: Missing config → Error"
echo ""
echo "Total expected success: 13 sessions created"
