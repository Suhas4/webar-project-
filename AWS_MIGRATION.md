# Memoera AWS Migration — Progress Notes

Migrating off Netlify (frontend) + Render (backend) + Cloudflare R2 (storage) + Neon (Postgres) → AWS.

## Status overview

| Piece | Status |
|---|---|
| S3 bucket for images/videos | ✅ Done |
| RDS Postgres (replaces Neon) | ✅ Done, data migrated + verified |
| EC2 compute for backend | 🔄 In progress (Docker build/deploy) |
| Frontend (S3 + CloudFront, replaces Netlify) | ⏳ Not started |
| DNS cutover | ⏳ Not started |
| Decommission old services | ⏳ Not started |

## 1. S3 (storage, replaces Cloudflare R2) — DONE

- Bucket: `memoera-assets-prod`, region `eu-north-1`
- Public URL via CloudFront: `https://d17np4avfc6bj8.cloudfront.net`
- Credentials in backend `.env`: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION=eu-north-1`, `S3_BUCKET_NAME`, `S3_PUBLIC_URL`

## 2. RDS Postgres (replaces Neon) — DONE

- Instance: `memoera-db.cxa8uy6iavep.eu-north-1.rds.amazonaws.com:5432`, database `memoera`
- Security group `memoera-db-sg`: inbound rules = (1) 5432 from my IP, (2) 5432 from `memoera-backend-sg` (so EC2 can reach it), old broad rule deleted.
- Migration: ran `pg_dump` on Neon, `pg_restore --no-owner --no-privileges` into RDS — **from the EC2 instance itself** (has network access to both endpoints, avoids routing large data through local internet connection).
- Verified row counts match between Neon and RDS across all 15 tables (login_activity=11, nfc_batches=4, nfc_experiences=2, nfc_stickers=11, nfc_taps=10, users=2, rest=0 — both sides).
- New `DATABASE_URL` added to local `backend/.env` (old Neon URL commented out, kept for reference).

## 3. EC2 (compute, replaces Render) — IN PROGRESS

- Instance: `i-00c4e40e2dc660d06`, name `memoera-backend`, public IP `13.48.28.49`, region `eu-north-1`, type t3.micro (1GB RAM).
- Key pair: `memoera-backend-key.pem` — downloaded via AWS Console, ended up in `C:\memoera\.playwright-mcp\`, copied to `~/.ssh/memoera-backend-key.pem` locally, `chmod 600`.
- Docker installed on instance (v29.7.1), `ubuntu` user added to `docker` group.
- Backend source uploaded to `~/app` on the instance (tar + scp): Dockerfile, Makefile, go.mod, go.sum, main.go, moderation.go, render.yaml, thumbnail.go.
- Production `.env` created at `~/app/.env` on EC2 — differs from local dev `.env` only in:
  - `PORT=8080` (vs 8181 locally)
  - `FRONTEND_ORIGIN=https://memoera.in` (vs localhost)
  - `RAZORPAY_CALLBACK_URL=https://memoera.in/payment-success` (vs localhost)
- **Dockerfile bug found & fixed** (now in both the EC2 copy and local `C:\memoera\backend\Dockerfile`): `apt-get install` step that pulls in `libreoffice-core` also pulls in `tzdata`, which prompts interactively via debconf and hangs the build forever unless `DEBIAN_FRONTEND=noninteractive` is set. Fix: added
  ```
  ENV DEBIAN_FRONTEND=noninteractive TZ=UTC
  ```
  right before the `RUN apt-get install ...` line in the runtime stage. ✅ Local repo now matches — no reconciliation debt left.
- Two stuck/aborted docker build attempts happened before finding the debconf root cause — both were started with `& disown` over SSH, and `TaskStop` on the local task only kills the local SSH client, **not** the disowned remote process. This orphaned processes on the 1GB instance and made SSH hang (`Connection timed out during banner exchange`). Fixed by rebooting the instance via AWS Console (twice) to clear it out.
- **Lesson learned:** never background a remote build with `& disown`. Instead use the Bash tool's own `run_in_background: true` on the plain foreground `ssh ... "docker build ..."` command — killing that task closes the SSH connection, which kills the remote process too.
- ✅ Confirmed instance clean after the second reboot (`docker ps -a` empty, `docker images` empty, no stray `apt`/`dpkg`/`docker` processes).
- 🔄 Image build (`cd ~/app && sudo docker build -t webar-backend .`) kicked off correctly this time (foreground SSH + local `run_in_background`, no `& disown`, no `tail` pipe) — apt-get step passed cleanly (no debconf hang), currently past that, compiling the Go binary. Not finished yet as of last check.

### Remaining steps for EC2/backend
1. ✅ Confirm instance clean after reboot — done.
2. 🔄 Build the image — **in progress**, no errors so far.
3. Run the container, exposing port 8080 (`PORT=8080` in `.env`, `EXPOSE 8080` in Dockerfile) — map to host port 80 or front with a reverse proxy.
4. Put HTTPS in front of it (Caddy/nginx + Let's Encrypt, or ALB + ACM).
5. Point `api.memoera.in` DNS at `13.48.28.49` once confirmed working.

## 4. Frontend (S3 + CloudFront, replaces Netlify) — NOT STARTED

- Create S3 bucket + CloudFront distribution for the React app (`webar-app/`).
- Recreate `webar-app/netlify.toml`'s headers as CloudFront response-header policy / behaviors:
  - `Permissions-Policy: camera=(*), microphone=()`
  - Standard hardening headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy)
  - SPA fallback: all paths → `/index.html` (CloudFront custom error response)
  - Cache rules: `*.mp4`, `/libs/*`, `/assets/*` → immutable 1yr; `*.png`/`*.jpg` → 1wk; `/targets/*` → 1day; `/ar-scanner.html` → no-cache.
- Update `webar-app/src/config/api.js` to point at the new backend URL (`api.memoera.in`).
- `npm run build` + `aws s3 sync` to deploy.

## 5. Cutover & cleanup — NOT STARTED

- Test on staging subdomains before flipping DNS.
- Flip DNS for `api.memoera.in` and `memoera.in`.
- Monitor for issues.
- Decommission: Render, Netlify, Cloudflare R2, Neon.
- Also revisit: `.github/workflows/keep-backend-warm.yml` / `keep-backend-awake.yml` — no longer needed once Render is gone.
- Confirm AWS root account has MFA enabled and a billing budget alert set (not yet verified either way).

## Gotchas learned along the way

- AWS Console security-group Source combobox: typing a name alone isn't enough — must click the resolved dropdown option, or saving fails with "a CIDR block, a security group ID or a prefix list has to be specified".
- Playwright MCP file downloads can land one directory level up from where you'd expect (`C:\memoera\.playwright-mcp\`, not `C:\memoera\backend\.playwright-mcp\`).
- `chmod 600` on a `.pem` under Windows/Git Bash/NTFS may not visibly show in `ls -la`, but works fine for OpenSSH's Windows/git-bash client.
- `sed` in-place edits over SSH with multi-line replacements are fragile — better to write the full file locally via heredoc and `scp` it over.
- Piping a long-running remote command through `| tail -N` hides all progress until the command exits (buffers to EOF) — looks identical to a genuine hang. Avoid piping through `tail` on builds; watch raw output or tail a log file instead.
- EC2 status checks (System/Instance/EBS all "passed") only prove AWS-level health, not that SSH/the app inside is responsive — `Connection timed out during banner exchange` while status checks are green points at the OS being resource-starved, not a network/firewall problem.
