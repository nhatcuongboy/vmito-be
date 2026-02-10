#!/bin/bash
set -e

# Server Migration Script - Step 3: Generate SSL Certificates
# Run this on the NEW server (45.76.176.24) AFTER DNS has been updated

NEW_SERVER_IP="45.76.176.24"
EMAIL="your-email@example.com"  # Update this with your email

echo "=== Badminton Server Migration - SSL Certificate Generation ==="
echo "New Server: $NEW_SERVER_IP"
echo ""

# Check if DNS is pointing to new server
echo "[1/4] Checking DNS configuration..."
VMITO_IP=$(dig +short vmito.com | tail -n1)
STAGING_IP=$(dig +short staging.vmito.com | tail -n1)

if [ "$VMITO_IP" != "$NEW_SERVER_IP" ]; then
  echo "⚠ Warning: vmito.com is pointing to $VMITO_IP, not $NEW_SERVER_IP"
  echo "Please update DNS before generating SSL certificates"
  read -p "Continue anyway? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

if [ "$STAGING_IP" != "$NEW_SERVER_IP" ]; then
  echo "⚠ Warning: staging.vmito.com is pointing to $STAGING_IP, not $NEW_SERVER_IP"
  echo "Please update DNS before generating SSL certificates"
  read -p "Continue anyway? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

cd /opt/badminton

# Stop nginx temporarily
echo "[2/4] Stopping nginx..."
docker compose stop nginx

# Generate production certificates
echo "[3/4] Generating production SSL certificates..."
docker compose run --rm certbot certonly \
  --standalone \
  -d vmito.com \
  -d www.vmito.com \
  --email $EMAIL \
  --agree-tos \
  --no-eff-email \
  --force-renewal

if [ $? -eq 0 ]; then
  echo "✓ Production certificates generated successfully"
else
  echo "✗ Production certificate generation failed!"
  exit 1
fi

# Generate staging certificate
echo "[4/4] Generating staging SSL certificate..."
docker compose run --rm certbot certonly \
  --standalone \
  -d staging.vmito.com \
  --email $EMAIL \
  --agree-tos \
  --no-eff-email \
  --force-renewal

if [ $? -eq 0 ]; then
  echo "✓ Staging certificate generated successfully"
else
  echo "✗ Staging certificate generation failed!"
  exit 1
fi

# Restart nginx
echo "Restarting nginx..."
docker compose up -d nginx

echo ""
echo "=== SSL Certificate Generation Complete ==="
echo ""
echo "Certificates generated for:"
echo "  - vmito.com"
echo "  - www.vmito.com"
echo "  - staging.vmito.com"
echo ""
echo "Next steps:"
echo "1. Verify HTTPS is working:"
echo "   curl -I https://vmito.com"
echo "   curl -I https://staging.vmito.com"
echo ""
echo "2. Test the applications in browser"
echo "3. Update GitHub Actions secrets (SERVER_HOST)"
