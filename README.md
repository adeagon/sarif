<p align="center">
  <img src="app/public/sarif.svg" width="48" alt="Sarif" />
</p>

<h1 align="center">Sarif</h1>

<p align="center">
  Travel intelligence dashboard for frequent flyers and digital nomads.
  <br>Award search, award alerts, points tracking, US and Schengen stay counters. Runs locally.
</p>

## Quickstart

**Node (development):**

```bash
git clone https://github.com/jcdentonintheflesh/sarif.git
cd sarif/app
npm install
cp .env.example .env
npm run dev
```

Open [localhost:5173](http://localhost:5173). The app will walk you through setup — add your trips, points, and home airport from the UI. Append `?demo` to the URL to explore with sample data first.

Don't have Git? Click the green **Code** button on the repo page, hit **Download ZIP**, unzip it, and run the same commands starting from `cd sarif/app`.

**Docker Compose (production-style):**

```bash
git clone https://github.com/jcdentonintheflesh/sarif.git
cd sarif/app
cp .env.example .env   # add API keys if desired
docker compose up --build -d
```

Open [localhost:3001](http://localhost:3001). SQLite data persists in `app/data/` across restarts. Stop with `docker compose down`.

For Raspberry Pi LAN deployment, see [app/docs/raspberry-pi-deployment.md](app/docs/raspberry-pi-deployment.md).

## API keys (optional)

Works without any API keys. Award search and live prices turn on once you add them.

| Key | What it powers | Where to get it | Cost |
|-----|---------------|-----------------|------|
| `SEATS_API_KEY` | Award search | [seats.aero](https://seats.aero) | $9.99/mo |
| `RAPIDAPI_KEY` | Business/PE cash prices | [Sky Scrapper on RapidAPI](https://rapidapi.com/apiheya/api/sky-scrapper) | Free (100 req/mo) or $8.99/mo (10k req) |
| `TRAVELPAYOUTS_TOKEN` | Economy cash baseline | [travelpayouts.com](https://www.travelpayouts.com/developers/api) | Free |

Add keys to `.env` and restart `npm run dev` — it runs both the frontend and the API server automatically.

## Overview

![Sarif dashboard](screenshots/sarif-overview.png)

**Award Search** pulls live award availability from [seats.aero](https://seats.aero), which aggregates availability across 30+ airline loyalty programs (United, Aeroplan, Flying Blue, etc.) into one API. Sarif shows these results alongside cash prices from [Sky Scrapper](https://rapidapi.com/apiheya/api/sky-scrapper) (business/premium economy) and [Travelpayouts](https://www.travelpayouts.com/developers/api) (economy), so you can compare points vs. dollars on the same screen.

**Award Alerts** monitors routes in the background and notifies you in real time when seats matching your criteria become available — filter by cabin, max miles, max taxes, direct-only, date range, and specific programs. Alerts are evaluated every 15 minutes via seats.aero and pushed to the browser over SSE.

**Points & Miles** tracks balances across all your programs and shows which transferable currencies (Amex MR, Chase UR, etc.) can move where.

**US Presence Tracker** counts rolling 180-day and 365-day totals, runs the IRS Substantial Presence Test (the 3-year weighted formula), and suggests exit dates so you don't accidentally trigger tax residency.

**Schengen Tracker** does the same for the 90/180-day Schengen rule.

**Trip Planner** lets you simulate future trips against both US and Schengen limits before you book anything.

![Award Search](screenshots/sarif-search.png)

No accounts, no cloud, no tracking. Data stays on your machine.

## Data setup

Add your data directly in the app:
- **US trips** — get your entry/exit dates from [i94.cbp.dhs.gov](https://i94.cbp.dhs.gov), then add them in the Trip History tab
- **Schengen stays** — add in the Schengen tab
- **Points balances** — edit inline in the Points tab

All data is stored in your browser's localStorage and never leaves your machine.

## Stack

React 19, Vite, Tailwind CSS, Recharts, Express, SQLite (better-sqlite3), localStorage

## License

[MIT](LICENSE)

---

Built by [@vxdenton](https://x.com/vxdenton)
