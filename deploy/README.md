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

## iOS app (Capacitor, built on GitHub Actions)

`frontend/ios/` is the native shell, generated with `npx cap add ios`. It
bundles the React build; `frontend/capacitor.config.ts` can instead point
`server.url` at the live site once it exists, so fixes ship without a review.

`.github/workflows/ios-testflight.yml` builds and uploads to TestFlight on a
macOS runner. One-time setup after the Apple Developer account is approved:

1. App Store Connect > Users and Access > Integrations > App Store Connect
   API: create a Team key, role App Manager. Note Issuer ID and Key ID,
   download the `.p8` once.
2. developer.apple.com > Certificates: create an Apple Distribution
   certificate (make the CSR in Keychain Access on any Mac), export it from
   Keychain as `.p12` with a password, then `base64 -i cert.p12 | pbcopy`.
3. developer.apple.com > Identifiers: register `com.nbtechai.hotshot`.
   Profiles: create an App Store profile for it.
4. App Store Connect > Apps: New App, bundle id `com.nbtechai.hotshot`,
   name Hotshot (check availability; fall back to "Hotshot Fire Prediction").
5. GitHub repo > Settings > Secrets: the six secrets named at the top of the
   workflow.
6. Actions > iOS TestFlight > Run workflow. First build takes about 15 min.
7. App Store Connect > TestFlight: add the pilot firefighters as external
   testers (Beta App Review is quick, usually under a day).

Not yet verified end to end: the workflow was written without a Mac that has
Xcode. Expect one or two rounds of fixes on the first run.
