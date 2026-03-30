#!/bin/bash

# Test Quote Sync Webhook
# This tests if the webhook endpoint is working correctly

echo "🧪 Testing Quote Sync Webhook..."
echo ""

TIMESTAMP=$(date +%s)
QUOTE_ID="TEST-$TIMESTAMP"

echo "📤 Sending test quote: $QUOTE_ID"
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST https://nfd-repairs-app.vercel.app/api/quotes/sync \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: TDc4nQug0r09fQN6+kn0Imr8XXFY5J9fMslmGATaqQU=" \
  -d "{
    \"quote_request_id\": \"$QUOTE_ID\",
    \"customer_name\": \"Test Customer $TIMESTAMP\",
    \"customer_phone\": \"+447410123456\",
    \"customer_email\": \"test@example.com\",
    \"device_make\": \"Apple\",
    \"device_model\": \"iPhone 14 Pro\",
    \"issue\": \"Screen Replacement\",
    \"quoted_price\": 89.99,
    \"status\": \"pending\",
    \"created_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
  }")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "📥 Response:"
echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
echo ""
echo "HTTP Status: $HTTP_CODE"
echo ""

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ SUCCESS! Webhook is working."
    echo ""
    echo "Next steps:"
    echo "1. Open the app: https://nfd-repairs-app.vercel.app/app/jobs/create"
    echo "2. Click 'Search Quotes' button"
    echo "3. Search for: Test Customer $TIMESTAMP"
    echo "4. You should see the test quote"
else
    echo "❌ FAILED! Webhook returned error."
    echo ""
    echo "Possible issues:"
    echo "- Environment variable AI_RESPONDER_WEBHOOK_SECRET not set in Vercel"
    echo "- Database connection issue"
    echo "- Quotes table doesn't exist"
fi
