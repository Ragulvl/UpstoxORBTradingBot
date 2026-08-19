#!/bin/bash
# =============================================================================
# deploy.sh — Deploy latest code to EC2
# Run from your LOCAL machine after a git push.
#
# Usage:
#   ./infra/scripts/deploy.sh <EC2_PUBLIC_IP>
#
# Example:
#   ./infra/scripts/deploy.sh 13.127.45.210
# =============================================================================
set -euo pipefail

EC2_IP="${1:-}"
KEY_FILE="${KEY_FILE:-~/Downloads/upstox-bot-key.pem}"
EC2_USER="ec2-user"
APP_DIR="/opt/upstox-bot"

if [ -z "$EC2_IP" ]; then
  echo "Usage: $0 <EC2_PUBLIC_IP>"
  echo "Example: $0 13.127.45.210"
  exit 1
fi

echo "======================================================"
echo " Deploying to EC2: $EC2_IP"
echo "======================================================"

SSH="ssh -i $KEY_FILE -o StrictHostKeyChecking=no $EC2_USER@$EC2_IP"
SCP="scp -i $KEY_FILE -o StrictHostKeyChecking=no"

# 1. Pull latest code
echo "[1/4] Pulling latest code on EC2..."
$SSH "cd $APP_DIR && git pull origin main && npm install --omit=dev"

# 2. Run tests
echo "[2/4] Running tests on EC2..."
$SSH "cd $APP_DIR && npm test"

# 3. Restart the bot service
echo "[3/4] Restarting bot service..."
$SSH "sudo systemctl restart upstox-bot"

# 4. Check status
echo "[4/4] Checking service status..."
sleep 3
$SSH "sudo systemctl status upstox-bot --no-pager -l"

echo ""
echo "======================================================"
echo " Deployment COMPLETE!"
echo " Bot logs: ssh -i $KEY_FILE $EC2_USER@$EC2_IP 'sudo journalctl -u upstox-bot -f'"
echo "======================================================"
