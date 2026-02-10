#!/bin/bash
set -e

# Deployment script for staging environment

SERVER_IP="45.76.176.24"
DEPLOY_PATH="/opt/badminton"

echo "=== Badminton Staging Deployment Script ==="

# Check if running on server
if [ "$(hostname -I | awk '{print $1}')" != "$SERVER_IP" ]; then
    echo "This script should be run on the server ($SERVER_IP)"
    exit 1
fi

cd $DEPLOY_PATH

echo "[1/4] Pulling latest staging images..."
docker compose -f docker-compose.staging.yml pull

echo "[2/4] Stopping old staging containers..."
docker compose -f docker-compose.staging.yml down

echo "[3/4] Starting new staging containers..."
docker compose -f docker-compose.staging.yml up -d

echo "[4/4] Cleaning up old images..."
docker image prune -f

echo ""
echo "=== Staging Deployment Complete ==="
echo ""
echo "Check status:"
echo "  docker compose -f docker-compose.staging.yml ps"
echo ""
echo "View logs:"
echo "  docker compose -f docker-compose.staging.yml logs -f"
echo "  docker compose -f docker-compose.staging.yml logs -f backend-staging"
echo "  docker compose -f docker-compose.staging.yml logs -f frontend-staging"
echo ""
echo "Staging URL: https://staging.vmito.com (or http://$SERVER_IP:8080)"
