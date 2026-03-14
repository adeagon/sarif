<p align="center">
  <img src="app/public/sarif.svg" width="48" alt="Sarif" />
</p>

<h1 align="center">Sarif</h1>

<p align="center">
  Travel intelligence dashboard for frequent flyers and digital nomads.
  <br>Award search, points tracking, US and Schengen stay counters. Runs locally.
</p>

## Quickstart

```bash
git clone https://github.com/jcdentonintheflesh/sarif.git
cd sarif/app
npm install
cp src/data/travelHistory.example.js src/data/travelHistory.js
cp .env.example .env
npm run dev
```

Open [localhost:5173](http://localhost:5173). Append `?demo` to the URL to try it with sample data.

## Overview

![Sarif dashboard](screenshots/sarif-overview.png)

**Award Search** searches live award availability via [seats.aero](https://seats.aero) across 30+ loyalty programs and shows cash prices next to point costs.

**Points & Miles** tracks balances across all your programs and shows transfer partner mappings.

**US Presence Tracker** counts rolling 180-day and 365-day totals, runs the IRS Substantial Presence Test, and suggests exit dates.

**Schengen Tracker** shows your 90/180-day rolling window with warnings as you approach the limit.

**Trip Planner** lets you simulate future trips against both US and Schengen limits before booking.

![Award Search](screenshots/sarif-search.png)

No accounts, no cloud, no tracking. Data stays on your machine.

## API keys (optional)

Works without any API keys. Award search and live prices turn on once you add them.

| Key | What it powers | Where to get it | Cost |
|-----|---------------|-----------------|------|
| `SEATS_API_KEY` | Award search | [seats.aero](https://seats.aero) | ~$20/mo |
| `RAPIDAPI_KEY` | Business/PE cash prices | [Sky Scrapper on RapidAPI](https://rapidapi.com/apiheya/api/sky-scrapper) | Free (100 req/mo) or $8.99/mo (10k req) |
| `TRAVELPAYOUTS_TOKEN` | Economy cash baseline | [travelpayouts.com](https://www.travelpayouts.com/developers/api) | Free |

Add keys to `.env`, then start the backend:

```bash
npm run dev:all    # frontend + backend
```

## Data setup

Edit `src/data/travelHistory.js` with your trips, points, and programs:
- US entry/exit dates (get yours from [i94.cbp.dhs.gov](https://i94.cbp.dhs.gov))
- Schengen stays
- Points balances and loyalty programs

This file is gitignored and never gets committed. See `travelHistory.example.js` for the full schema.

## Stack

React 19, Vite, Tailwind CSS, Recharts, Express (API proxy), localStorage

## License

[MIT](LICENSE)

---

Built by [@vxdenton](https://x.com/vxdenton)
