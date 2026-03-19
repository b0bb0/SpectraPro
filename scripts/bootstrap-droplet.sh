#!/usr/bin/env bash
# ── Spectra Platform — DigitalOcean Droplet Bootstrap ────────────────
# Run as root on a fresh Ubuntu 24.04 Droplet:
#   curl -sL <raw-github-url> | bash -s -- <your-ssh-public-key>
#
# Or copy to the Droplet and run:
#   chmod +x bootstrap-droplet.sh
#   sudo ./bootstrap-droplet.sh "<your-ssh-public-key>"
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Validate ─────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  echo "ERROR: Run this script as root (sudo)." >&2
  exit 1
fi

SSH_PUBKEY="${1:-}"
if [[ -z "$SSH_PUBKEY" ]]; then
  echo "Usage: $0 '<ssh-public-key>'" >&2
  echo "Example: $0 'ssh-ed25519 AAAA... user@host'" >&2
  exit 1
fi

REPO_URL="${2:-https://github.com/b0bb0/Migrate-spectrapro.git}"
DEPLOY_USER="deploy"
APP_DIR="/opt/spectra"

echo "══════════════════════════════════════════════════════════════"
echo "  Spectra Platform — Droplet Bootstrap"
echo "══════════════════════════════════════════════════════════════"

# ── 1. System updates ────────────────────────────────────────────────
echo "[1/13] Updating system packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq

# ── 2. Create deploy user ───────────────────────────────────────────
echo "[2/13] Creating deploy user..."
if ! id "$DEPLOY_USER" &>/dev/null; then
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
  usermod -aG sudo "$DEPLOY_USER"
  echo "$DEPLOY_USER ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/$DEPLOY_USER
  chmod 440 /etc/sudoers.d/$DEPLOY_USER
fi

mkdir -p /home/$DEPLOY_USER/.ssh
echo "$SSH_PUBKEY" > /home/$DEPLOY_USER/.ssh/authorized_keys
chmod 700 /home/$DEPLOY_USER/.ssh
chmod 600 /home/$DEPLOY_USER/.ssh/authorized_keys
chown -R $DEPLOY_USER:$DEPLOY_USER /home/$DEPLOY_USER/.ssh

# ── 3. SSH hardening ────────────────────────────────────────────────
echo "[3/13] Hardening SSH..."
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?ChallengeResponseAuthentication.*/ChallengeResponseAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?PubkeyAuthentication.*/PubkeyAuthentication yes/' /etc/ssh/sshd_config

# ── 4. Enable GatewayPorts for Ollama SSH tunnel ────────────────────
echo "[4/13] Enabling GatewayPorts for Ollama tunnel..."
if ! grep -q "^GatewayPorts yes" /etc/ssh/sshd_config; then
  echo "" >> /etc/ssh/sshd_config
  echo "# Allow autossh reverse tunnels to bind to all interfaces (Ollama)" >> /etc/ssh/sshd_config
  echo "GatewayPorts yes" >> /etc/ssh/sshd_config
fi
systemctl restart sshd

# ── 5. UFW firewall ─────────────────────────────────────────────────
echo "[5/13] Configuring UFW firewall..."
apt-get install -y -qq ufw
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment "SSH"
ufw allow 80/tcp comment "HTTP"
ufw allow 443/tcp comment "HTTPS (future)"
ufw --force enable

# ── 6. Docker/UFW bypass fix ────────────────────────────────────────
echo "[6/13] Fixing Docker/UFW iptables bypass..."
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'DOCKER_CONF'
{
  "iptables": false,
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
DOCKER_CONF

# ── 7. Install Docker Engine ────────────────────────────────────────
echo "[7/13] Installing Docker Engine..."
apt-get install -y -qq ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
apt-get update -qq
apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin

usermod -aG docker $DEPLOY_USER
systemctl enable docker
systemctl restart docker

# ── 8. Fail2ban ──────────────────────────────────────────────────────
echo "[8/13] Installing fail2ban..."
apt-get install -y -qq fail2ban
cat > /etc/fail2ban/jail.local <<'F2B'
[sshd]
enabled = true
port = ssh
maxretry = 5
bantime = 600
findtime = 600
F2B
systemctl enable fail2ban
systemctl restart fail2ban

# ── 9. Unattended upgrades ──────────────────────────────────────────
echo "[9/13] Enabling unattended security upgrades..."
apt-get install -y -qq unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades

# ── 10. Swap (2GB) ──────────────────────────────────────────────────
echo "[10/13] Setting up 2GB swap..."
if [[ ! -f /swapfile ]]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl vm.swappiness=10
  echo 'vm.swappiness=10' >> /etc/sysctl.conf
fi

# ── 11. Clone repo ──────────────────────────────────────────────────
echo "[11/13] Cloning Spectra repository..."
apt-get install -y -qq git
mkdir -p "$APP_DIR"
if [[ ! -d "$APP_DIR/.git" ]]; then
  git clone "$REPO_URL" "$APP_DIR"
fi
chown -R $DEPLOY_USER:$DEPLOY_USER "$APP_DIR"

# ── 12. Create backups directory ─────────────────────────────────────
echo "[12/13] Creating backups directory..."
mkdir -p "$APP_DIR/backups"
chown $DEPLOY_USER:$DEPLOY_USER "$APP_DIR/backups"

# ── 13. Final instructions ──────────────────────────────────────────
DROPLET_IP=$(curl -s http://169.254.169.254/metadata/v1/interfaces/public/0/ipv4/address 2>/dev/null || hostname -I | awk '{print $1}')

echo ""
echo "══════════════════════════════════════════════════════════════"
echo "  Bootstrap complete!"
echo "══════════════════════════════════════════════════════════════"
echo ""
echo "  Droplet IP: $DROPLET_IP"
echo ""
echo "  Next steps (as the deploy user):"
echo ""
echo "  1. SSH in:  ssh $DEPLOY_USER@$DROPLET_IP"
echo ""
echo "  2. Create .env file:"
echo "     cd $APP_DIR"
echo "     cp .env.production .env"
echo "     nano .env"
echo "     # Set POSTGRES_PASSWORD, JWT_SECRET (openssl rand -base64 48)"
echo "     # Set NEXT_PUBLIC_API_URL=http://$DROPLET_IP"
echo "     # Set NEXT_PUBLIC_APP_URL=http://$DROPLET_IP"
echo "     # Set FRONTEND_URL=http://$DROPLET_IP"
echo "     chmod 600 .env"
echo ""
echo "  3. Start the stack:"
echo "     docker compose -f docker-compose.prod.yml up -d --build"
echo "     docker compose -f docker-compose.prod.yml exec -T backend npx prisma migrate deploy"
echo ""
echo "  4. Verify:  curl http://$DROPLET_IP/health"
echo ""
echo "  5. For Ollama AI (from your MacBook):"
echo "     autossh -M 0 -f -N -R 0.0.0.0:11434:localhost:11434 $DEPLOY_USER@$DROPLET_IP"
echo ""
echo "══════════════════════════════════════════════════════════════"
