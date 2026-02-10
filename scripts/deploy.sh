#!/bin/bash
set -e

# Deployment script for PRODUCTION environment
# For staging deployment, use deploy-staging.sh instead

SERVER_IP="45.76.176.24"
DEPLOY_PATH="/opt/badminton"

echo "=== Badminton App Deployment Script ==="

# Check if running on server
if [ "$(hostname -I | awk '{print $1}')" != "$SERVER_IP" ]; then
    echo "This script should be run on the server ($SERVER_IP)"
    exit 1
fi

cd $DEPLOY_PATH

echo "[1/4] Pulling latest images..."
docker compose pull

echo "[2/4] Stopping old containers..."
docker compose down

echo "[3/4] Starting new containers..."
docker compose up -d

echo "[4/4] Cleaning up old images..."
docker image prune -f

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "Check status:"
echo "  docker compose ps"
echo ""
echo "View logs:"
echo "  docker compose logs -f"
echo "  docker compose logs -f backend"
echo "  docker compose logs -f frontend"
echo ""
echo "Application URL: http://$SERVER_IP"
