# AWS EC2 Deployment Guide — Upstox ORB Trading Bot

## Step 1 — Configure the EC2 Instance (AWS Console)

You are on the "Launch an instance" page. Fill in these settings **exactly**:

### Name and Tags
| Field | Value |
|-------|-------|
| Name | `upstox-orb-bot` |

### Application and OS Images
| Field | Value |
|-------|-------|
| AMI | **Amazon Linux 2023** (already selected ✅) |
| Architecture | 64-bit (x86) |

### Instance Type
| Field | Value |
|-------|-------|
| Instance type | **t3.small** ← change from t3.micro |

> t3.small = 2 vCPU, 2GB RAM (~$15/month). t3.micro (1GB) can OOM when running WebSocket + candle buffer.

### Key Pair (Login)
1. Click **"Create new key pair"**
2. Set:
   - Name: `upstox-bot-key`
   - Type: RSA
   - Format: `.pem`
3. Click **"Create key pair"** — saves `upstox-bot-key.pem` to your Downloads folder
4. **Keep this file safe — you cannot download it again**

### Network Settings — click "Edit"
| Field | Value |
|-------|-------|
| Security group name | `upstox-bot-sg` |
| Inbound rule 1 | SSH / Port 22 / Source: **My IP** (not 0.0.0.0/0) |
| Inbound rule 2 | Custom TCP / Port 3000 / Source: **My IP** (dashboard) |

> ⚠️ **Delete** the HTTP (80) and HTTPS (443) rules — the bot doesn't need them.

### Configure Storage
| Field | Value |
|-------|-------|
| Root volume | **20 GiB** (change from 8) |
| Volume type | gp3 |

### Advanced Details → User Data
Scroll to the bottom of "Advanced details". Paste this into the **User data** text area:

```bash
#!/bin/bash
set -e
yum update -y
yum install -y docker git nodejs
systemctl start docker
systemctl enable docker
usermod -aG docker ec2-user
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" \
  -o /usr/local/bin/docker-compose && chmod +x /usr/local/bin/docker-compose
mkdir -p /opt/upstox-bot
chown ec2-user:ec2-user /opt/upstox-bot
sudo -u ec2-user git clone https://github.com/Ragulvl/UpstoxORBTradingBot.git /opt/upstox-bot
cd /opt/upstox-bot && sudo -u ec2-user npm install --omit=dev
cat > /etc/systemd/system/upstox-bot.service << 'EOF'
[Unit]
Description=Upstox ORB Trading Bot
After=network-online.target
[Service]
Type=simple
User=ec2-user
WorkingDirectory=/opt/upstox-bot
EnvironmentFile=/opt/upstox-bot/.env
ExecStart=/usr/bin/node src/bot/run-live-bot.js
Restart=on-failure
RestartSec=30s
StandardOutput=journal
StandardError=journal
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
echo "Bootstrap done" > /tmp/bootstrap-complete.txt
```

### Launch
Click the orange **"Launch instance"** button. Note the **Instance ID** on the success screen.

---

## Step 2 — Wait for Instance to Start (~3 minutes)

1. Go to **EC2 → Instances**
2. Find `upstox-orb-bot`
3. Wait until **Instance state = Running** and **Status checks = 2/2 passed**
4. Copy the **Public IPv4 address** (e.g., `13.127.45.210`)

---

## Step 3 — SSH into the Instance

Open PowerShell or terminal:

```bash
# Move key to a safe location
cd ~/Downloads
# Set correct permissions (Mac/Linux)
chmod 400 upstox-bot-key.pem

# Connect
ssh -i upstox-bot-key.pem ec2-user@YOUR_EC2_IP
```

**Windows (PowerShell)**:
```powershell
ssh -i "$env:USERPROFILE\Downloads\upstox-bot-key.pem" ec2-user@YOUR_EC2_IP
```

Verify bootstrap completed:
```bash
cat /tmp/bootstrap-complete.txt    # Should print "Bootstrap done"
ls /opt/upstox-bot/               # Should show the repo files
```

---

## Step 4 — Upload Your .env File

From your **local machine** (in the project directory):

```bash
scp -i ~/Downloads/upstox-bot-key.pem .env ec2-user@YOUR_EC2_IP:/opt/upstox-bot/.env
```

**Windows (PowerShell)**:
```powershell
scp -i "$env:USERPROFILE\Downloads\upstox-bot-key.pem" .env ec2-user@YOUR_EC2_IP:/opt/upstox-bot/.env
```

---

## Step 5 — Start the Bot

SSH into the instance:

```bash
# Enable and start the service
sudo systemctl enable upstox-bot
sudo systemctl start upstox-bot

# Watch live logs
sudo journalctl -u upstox-bot -f
```

You should see the bot connecting to Upstox WebSocket and waiting for market open.

---

## Step 6 — Access the Dashboard

Open in your browser:
```
http://YOUR_EC2_IP:3000
```

---

## Step 7 — Set Up GitHub Actions (Auto-Deploy on Push)

1. Go to your GitHub repo → **Settings → Secrets and variables → Actions**
2. Add these **Repository secrets**:

| Secret Name | Value |
|-------------|-------|
| `EC2_HOST` | Your EC2 Public IP (e.g., `13.127.45.210`) |
| `EC2_SSH_KEY` | Paste the **entire contents** of `upstox-bot-key.pem` |

3. Now every `git push` to `main` will automatically:
   - Run all 38 tests ✅
   - SSH into EC2 and pull latest code
   - Restart the bot service

---

## Useful Commands (On EC2)

```bash
# View live logs
sudo journalctl -u upstox-bot -f

# Stop the bot
sudo systemctl stop upstox-bot

# Restart the bot
sudo systemctl restart upstox-bot

# Check bot status
sudo systemctl status upstox-bot

# View recent errors
sudo journalctl -u upstox-bot --since "1 hour ago" | grep -i error

# Monitor system resources
htop

# Check disk usage
df -h
```

---

## Security Checklist

- [ ] SSH key (`.pem`) stored safely, not in the repo
- [ ] Security group only allows SSH from your IP, not `0.0.0.0/0`
- [ ] `.env` file contains real credentials (never committed to git)
- [ ] Port 3000 (dashboard) only accessible from your IP
- [ ] EC2 instance is in `ap-south-1` (Mumbai) for lowest latency to Upstox
