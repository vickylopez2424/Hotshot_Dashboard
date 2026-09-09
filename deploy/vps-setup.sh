#!/usr/bin/env bash
# One-shot setup for a fresh Ubuntu 24.04 VPS (2 vCPU, 4 GB RAM is enough).
# Run as root:  bash vps-setup.sh
# Afterwards: edit /etc/hotshot/backend.env, point DNS, `systemctl restart hotshot-api caddy`.
set -euo pipefail
REPO="${REPO:-https://github.com/vickylopez2424/Hotshot_Dashboard.git}"
APP=/opt/hotshot

apt-get update && apt-get install -y ca-certificates curl git gnupg debian-keyring debian-archive-keyring apt-transport-https

# Docker (for the ELMFIRE container)
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi

# Caddy (HTTPS)
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update && apt-get install -y caddy
fi

# App user and code
id hotshot >/dev/null 2>&1 || useradd -r -m -d /home/hotshot -s /bin/bash -G docker hotshot
if [ ! -d "$APP/.git" ]; then git clone "$REPO" "$APP"; else git -C "$APP" pull --ff-only; fi
chown -R hotshot:hotshot "$APP"

# Python 3.12 via uv, venv, deps
sudo -u hotshot bash -c 'curl -LsSf https://astral.sh/uv/install.sh | sh' >/dev/null
sudo -u hotshot bash -c "cd $APP/backend && ~/.local/bin/uv venv --python 3.12 .venv && ~/.local/bin/uv pip install --python .venv/bin/python -r requirements.txt"

# ELMFIRE image (native to the VPS arch; ~2 min)
sudo -u hotshot bash -c "cd $APP/prediction/elmfire-docker && docker build -t elmfire:arm64 ."

# Config, service, HTTPS
mkdir -p /etc/hotshot
[ -f /etc/hotshot/backend.env ] || { cp "$APP/deploy/backend.env.example" /etc/hotshot/backend.env; chmod 600 /etc/hotshot/backend.env; }
cp "$APP/deploy/hotshot-api.service" /etc/systemd/system/
cp "$APP/deploy/Caddyfile" /etc/caddy/Caddyfile
systemctl daemon-reload
systemctl enable --now hotshot-api
systemctl restart caddy
echo "Done. Edit /etc/hotshot/backend.env, then: systemctl restart hotshot-api"
echo "Check: curl -s https://api.hotshot.nbtechai.com/api/health"
