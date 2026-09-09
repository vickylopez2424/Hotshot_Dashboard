# Deploying Hotshot

Two pieces, one HTTPS origin for the user.

| Piece | Where | Why |
|---|---|---|
| Front end (React build, PWA) | Netlify, `hotshot.nbtechai.com` | Free, instant, serves the manifest and service worker over HTTPS so "Add to Home Screen" works |
| API + ELMFIRE | One Linux VPS, `api.hotshot.nbtechai.com` | Needs Docker and a few seconds of CPU per run. 2 vCPU / 4 GB is enough for a pilot |

Netlify proxies `/api/*` to the VPS (see `netlify.toml`), so the browser only
ever talks to `hotshot.nbtechai.com`.

## VPS

1. Ubuntu 24.04 droplet or Hetzner box. Note the IP.
2. DNS: `A api.hotshot.nbtechai.com -> <ip>`.
3. `ssh root@<ip>`, then `curl -fsSL https://raw.githubusercontent.com/vickylopez2424/Hotshot_Dashboard/main/deploy/vps-setup.sh | bash`.
4. `nano /etc/hotshot/backend.env`: set `CORS_ORIGINS`, keys, Supabase values. `DEMO_MODE=false`.
5. `systemctl restart hotshot-api` and `curl https://api.hotshot.nbtechai.com/api/health`.

The image tag stays `elmfire:arm64` even on an x86 VPS; the Dockerfile builds
for whatever the host is. Rename later if it bothers anyone.

## Front end

1. `netlify sites:list`, confirm or create the site with Vicky (standing rule 4).
2. `frontend/deploy.sh` pins the site id. Never bare `netlify deploy`.
3. DNS: Netlify's instructions for `hotshot.nbtechai.com`.

## Before anyone outside NB Tech gets the link

- Supabase project created, `supabase/setup.sql` run, `DEMO_MODE=false`.
  Until then keep the Caddy `basic_auth` block on so the API is not open.
- `/nbtech-preflight` on the front end.
- Disclaimer text reviewed.
