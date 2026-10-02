# Deploying DocuFlow AI for free (Oracle Cloud Always Free)

Everything runs on **one free virtual machine** with Docker Compose:

```
Internet ─▶ Caddy (HTTPS, automatic certificates) ──┬─▶ web     (Next.js)
                                                     ├─▶ api     (NestJS)   /api/*
                                                     └─▶ storage (SeaweedFS S3)  s3.<host>
            api, worker ─▶ postgres (pgvector) · redis · storage    (internal network only)
```

Only ports 80 and 443 are public. Data lives in Docker volumes on the VM. Hosting costs nothing; AI
features bill the OpenAI key you add in **Settings** (usually cents for light use).

Files: `Dockerfile`, `docker-compose.prod.yml`, `deploy/` (Caddyfile, scripts).

---

## 1. Create the VM (once)

1. Sign up at **cloud.oracle.com** for the Free Tier. A card is required for identity verification, and
   Always Free resources aren't charged. Your *home region* is permanent, so pick one near you.
2. **Compute → Instances → Create instance**
   - Image: **Canonical Ubuntu 24.04**
   - Shape: **Ampere → VM.Standard.A1.Flex**, 2 OCPUs / 12 GB is plenty (Always Free allows up to 4 / 24 GB)
   - Networking: keep "Assign a public IPv4 address" on
   - SSH keys: upload yours or download the generated one
   - "Out of capacity"? Retry later or pick another availability domain. Free ARM capacity comes and goes.
3. Note the instance's **public IP**.

## 2. Open ports 80 and 443

Oracle blocks them in **two** places:

1. **Cloud firewall:** instance → Subnet → Security List → *Add Ingress Rules*:
   source `0.0.0.0/0`, TCP, destination ports `80,443`.
2. **VM firewall:** SSH in (`ssh ubuntu@<public-ip>`) and run:
   ```bash
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
   sudo netfilter-persistent save
   ```

## 3. Install Docker and get the code

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu && exit        # log out so the group applies, then SSH back in
git clone https://github.com/vikramoff24/docuAI.git && cd docuAI
```

## 4. Configure and deploy

```bash
./deploy/init-env.sh <public-ip> <your-email>   # writes .env.production with random secrets
./deploy/deploy.sh                               # first build takes ~5–10 minutes
```

The app is now at **`https://app.<ip-with-dashes>.sslip.io`** (e.g. `https://app.203-0-113-5.sslip.io`).
sslip.io gives you a free hostname for any IP, and Caddy gets the HTTPS certificate on the first request.
To use your own domain instead, create DNS A records for `app.<domain>` and `s3.<domain>` pointing at the
IP, then run `init-env.sh <domain> <email>`.

Then sign up (this creates your organization) and add an OpenAI key under **Settings**.

> `.env.production` holds every secret. It's gitignored; keep a copy somewhere safe. Losing
> `AI_CREDENTIALS_ENCRYPTION_KEY` makes stored API keys unreadable (re-enter them in Settings).

## 5. Updating

```bash
cd ~/docuAI && git pull && ./deploy/deploy.sh
```

Migrations run automatically before the new API and worker start. Data volumes are kept.

## 6. Backups (do this)

```bash
crontab -e
# add:
15 3 * * * /home/ubuntu/docuAI/deploy/backup.sh >> /home/ubuntu/backup.log 2>&1
```

This keeps 7 days of database dumps and file archives in `deploy/backups/`. They're on the same VM, so
copy them elsewhere now and then (`scp ubuntu@<ip>:docuAI/deploy/backups/* .`).

Restore the database: `docker compose --env-file .env.production -f docker-compose.prod.yml exec -T postgres pg_restore -U docuflow -d docuflow --clean < deploy/backups/db-<stamp>.dump`

## Operating

| Task | Command (in `~/docuAI`) |
|---|---|
| Status | `docker compose --env-file .env.production -f docker-compose.prod.yml ps` |
| Logs | `docker compose --env-file .env.production -f docker-compose.prod.yml logs -f --tail 100 api worker` |
| Restart one service | `docker compose --env-file .env.production -f docker-compose.prod.yml restart api` |
| Disk usage | `docker system df` · prune old images: `docker image prune -f` |

## Things to know

- **Anyone can sign up.** Registration is open, so anyone who finds the URL can create an account. They only
  see their own organization, but they use your server.
- **Idle reclamation:** Oracle may reclaim Always Free instances that stay almost completely idle for a
  week. Light real use avoids this. Upgrading to a paid account (still free within limits) also stops it.
- **HTTPS certificate fails?** Check that ports 80/443 are open (step 2). Let's Encrypt has rate limits.
  If sslip.io hits them, use a free DuckDNS name or your own domain.
- **Rate limits** count per client IP. Caddy sets the real IP, and the API only trusts Caddy's network
  (`TRUST_PROXY`, see ADR-013).
- **Storage** is SeaweedFS (S3-compatible). To use Cloudflare R2 (free 10 GB) instead, set the
  `STORAGE_*` variables in `docker-compose.prod.yml` to R2's endpoint and keys, and remove the `storage` service.

## Testing the production stack locally

```bash
cat > /tmp/local.env <<'EOF'
APP_ADDRESS=http://app.localhost
S3_ADDRESS=http://s3.localhost
APP_URL=http://app.localhost:8088
S3_URL=http://s3.localhost:8088
ACME_EMAIL=local@example.com
HTTP_PORT=8088
HTTPS_PORT=8443
POSTGRES_PASSWORD=local-pg
REDIS_PASSWORD=local-redis
STORAGE_ACCESS_KEY=localaccesskey
STORAGE_SECRET_KEY=local-storage-secret
JWT_ACCESS_SECRET=local-jwt-secret-local-jwt-secret-local-jwt
AI_CREDENTIALS_ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
RATE_LIMIT_MULTIPLIER=20
EOF
docker build -t docuflow:latest .
docker compose -p docuflow-local --env-file /tmp/local.env -f docker-compose.prod.yml up -d --wait
cd apps/web && E2E_BASE_URL=http://app.localhost:8088 pnpm test:e2e
```

`RATE_LIMIT_MULTIPLIER=20` exists only so the browser suite (all from one IP) fits; never set it in production.
