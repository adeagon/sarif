# Raspberry Pi LAN Deployment

Deploy Sarif as a 24/7 LAN-accessible service on a Raspberry Pi 5.

## Prerequisites

- Raspberry Pi 5, 64-bit Raspberry Pi OS (bookworm)
- Docker and Docker Compose installed and running
- Repo cloned to the Pi

Verify:

```bash
docker version
docker compose version
```

## Setup

All commands run from `app/` on the Pi.

```bash
cp .env.example .env
```

Edit `.env` and add API keys (optional — the app runs without them):

```
SEATS_API_KEY=        # award search via seats.aero
RAPIDAPI_KEY=         # business/PE cash prices
TRAVELPAYOUTS_TOKEN=  # economy cash baseline
```

`HOST`, `PORT`, and `SARIF_DB_PATH` are already set in `compose.yaml` and do not need to be added to `.env`.

## Deploy

```bash
docker compose up --build -d
```

**First run:** expect several minutes. Node dependencies and `better-sqlite3` need to compile for ARM64.

Check status and logs:

```bash
docker compose ps
docker compose logs -f
```

## LAN Access

Find the Pi's IP:

```bash
hostname -I
```

Open from any machine on the network:

```
http://<pi-ip>:3002
```

Recommend setting a DHCP reservation on your router so the Pi always gets the same IP.

## Persistence

SQLite lives at `data/sarif.db` (relative to `app/`) on the host (bind-mounted into the container). Data survives container restarts and rebuilds. To back up, copy `data/sarif.db` off the Pi.

## Update

```bash
git pull
docker compose up -d --build
```

## Stop / Restart

```bash
docker compose down      # stop (data preserved)
docker compose up -d     # start without rebuilding
```

## Boot Behavior

`compose.yaml` sets `restart: unless-stopped`. The container restarts automatically unless you explicitly stop it with `docker compose down`. After a host reboot, if Docker starts normally, the container should come back up on its own.

## Verification Checklist

From the Pi or another machine on the LAN:

```bash
# Service is up
curl -s http://<pi-ip>:3002/api/alerts        # expect []

# Create an alert
curl -s -X POST http://<pi-ip>:3002/api/alerts \
  -H 'Content-Type: application/json' \
  -d '{"origin":"JFK","destination":"LHR","cabin":"J"}'

# Confirm it persisted
curl -s http://<pi-ip>:3002/api/alerts        # expect array with 1 alert

# Restart and confirm data survives
docker compose down && docker compose up -d
curl -s http://<pi-ip>:3002/api/alerts        # expect same alert still present
```

Verify SQLite bind mount on host:

```bash
ls data/sarif.db
```

## Operations

### Health monitoring

The app exposes a health endpoint:

```bash
curl http://localhost:3002/api/health
# {"ok":true,"service":"sarif"}
```

Docker also uses this for its built-in healthcheck — `docker compose ps` will show `(healthy)` once the container passes.

**Uptime Kuma:** Add an HTTP(s) monitor pointing to `http://<pi-ip>:3002/api/health` with keyword `"ok":true`.

### Backup

SQLite lives at `data/sarif.db` (relative to `app/` on the host). Copy it to a timestamped backup:

```bash
cp data/sarif.db data/sarif-$(date +%F).db
```

Run this from `app/`. Copy the backup off the Pi to keep it safe.

### Restore

```bash
docker compose down
cp data/sarif-YYYY-MM-DD.db data/sarif.db
docker compose up -d
```

### Troubleshooting

```bash
docker compose ps                           # check health status
docker compose logs -f                      # stream logs
curl http://localhost:3002/api/health       # confirm 200 + ok:true
ls data/sarif.db                            # confirm DB file exists
```
