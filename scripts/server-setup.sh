#!/bin/bash
set -e

echo "=== Badminton App Server Setup ==="
SERVER_IP=${1:-"45.76.176.24"}
echo "Target Server IP: $SERVER_IP"

# Update system
echo "[1/6] Updating system..."
apt update && apt upgrade -y

# Install Docker
echo "[2/6] Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
else
    echo "Docker already installed"
fi

# Install Docker Compose
echo "[3/6] Installing Docker Compose plugin..."
apt install -y docker-compose-plugin

# Create app directory structure
echo "[4/6] Creating application directories..."
mkdir -p /opt/badminton/nginx

# Create deploy user (optional but recommended)
echo "[5/6] Creating deploy user..."
if ! id "deploy" &>/dev/null; then
    useradd -m -s /bin/bash deploy
    usermod -aG docker deploy
    echo "Created 'deploy' user and added to docker group"
else
    echo "User 'deploy' already exists"
fi

# Setup firewall
echo "[6/6] Configuring firewall..."
ufw allow 22
ufw allow 80
ufw allow 443
ufw --force enable

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "1. Copy deployment files to /opt/badminton/:"
echo "   - docker-compose.yml"
echo "   - nginx/nginx.conf"
echo "   - .env (from .env.production.example)"
echo ""
echo "2. Create .env file with production values:"
echo "   cd /opt/badminton"
echo "   cp .env.production.example .env"
echo "   nano .env  # Edit with your values"
echo ""
echo "3. Setup SSH key for GitHub Actions:"
echo "   ssh-keygen -t ed25519 -C 'github-actions'"
echo "   cat ~/.ssh/id_ed25519.pub >> ~/.ssh/authorized_keys"
echo "   cat ~/.ssh/id_ed25519  # Copy this to GitHub Secret: SERVER_SSH_KEY"
echo ""
echo "4. Start the application:"
echo "   cd /opt/badminton"
echo "   docker compose up -d"
echo ""
echo "5. View logs:"
echo "   docker compose logs -f"
