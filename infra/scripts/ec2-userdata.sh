#!/bin/bash
# =============================================================================
# EC2 Bootstrap Script — Upstox ORB Trading Bot
# Paste this into the "User data" field when launching the EC2 instance.
# Runs ONCE automatically when the instance first boots.
# =============================================================================
set -euo pipefail
exec > >(tee /var/log/bootstrap.log | logger -t bootstrap) 2>&1

echo "======================================================="
echo " Upstox ORB Bot — EC2 Bootstrap Starting"
echo " $(date '+%Y-%m-%d %H:%M:%S IST')"
echo "======================================================="

# ── 1. System update ──────────────────────────────────────────────────────────
echo "[1/8] Updating system packages..."
yum update -y

# ── 2. Install Docker ─────────────────────────────────────────────────────────
echo "[2/8] Installing Docker..."
yum install -y docker
systemctl start docker
systemctl enable docker
usermod -aG docker ec2-user
newgrp docker

# ── 3. Install Docker Compose plugin ─────────────────────────────────────────
echo "[3/8] Installing Docker Compose..."
COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep '"tag_name"' | cut -d'"' -f4)
curl -L "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-x86_64" \
  -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose
ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose

# ── 4. Install Node.js 20 ─────────────────────────────────────────────────────
echo "[4/8] Installing Node.js 20..."
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
yum install -y nodejs
node --version
npm --version

# ── 5. Install Git and other tools ───────────────────────────────────────────
echo "[5/8] Installing Git, jq, htop..."
yum install -y git jq htop

# ── 6. Create application directory ──────────────────────────────────────────
echo "[6/8] Setting up /opt/upstox-bot..."
mkdir -p /opt/upstox-bot/logs /opt/upstox-bot/data
chown -R ec2-user:ec2-user /opt/upstox-bot

# ── 7. Clone the repository ───────────────────────────────────────────────────
echo "[7/8] Cloning repository..."
sudo -u ec2-user git clone https://github.com/Ragulvl/UpstoxORBTradingBot.git /opt/upstox-bot
cd /opt/upstox-bot
sudo -u ec2-user npm install --omit=dev

# ── 8. Create systemd service ─────────────────────────────────────────────────
echo "[8/8] Creating systemd service..."
cat > /etc/systemd/system/upstox-bot.service << 'EOF'
[Unit]
Description=Upstox ORB Trading Bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/opt/upstox-bot
EnvironmentFile=/opt/upstox-bot/.env
ExecStart=/usr/bin/node src/bot/run-live-bot.js
ExecStop=/bin/kill -SIGTERM $MAINPID
Restart=on-failure
RestartSec=30s
StandardOutput=journal
StandardError=journal
SyslogIdentifier=upstox-bot

# Resource limits
MemoryMax=800M
CPUQuota=80%

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
# DO NOT enable yet — user must populate .env first
# systemctl enable upstox-bot

echo ""
echo "======================================================="
echo " Bootstrap COMPLETE!"
echo ""
echo " NEXT STEPS (SSH in as ec2-user):"
echo ""
echo " 1. Copy your .env file:"
echo "    scp -i upstox-bot-key.pem .env ec2-user@<IP>:/opt/upstox-bot/.env"
echo ""
echo " 2. Start the bot:"
echo "    sudo systemctl enable upstox-bot"
echo "    sudo systemctl start upstox-bot"
echo ""
echo " 3. Check logs:"
echo "    sudo journalctl -u upstox-bot -f"
echo "======================================================="
