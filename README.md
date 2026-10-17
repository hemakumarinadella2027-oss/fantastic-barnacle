# fantastic-barnacle
Masters Union Repo

# AIOrNot

AIOrNot is a community-powered AI asset detection prototype for gaming, anime, TV, and media communities. Users can review visual assets, vote AI-generated or authentic, discuss evidence, upload assets, and request studio batch audits.

Live prototype: https://files.instinct.com/p30m1cwnds4g-aiornot-live-prototype

## What is included

- React + TypeScript frontend built with Vite
- Dark neon interface based on the AIOrNot product concept
- Shared asset grid with category filters and vote confidence bars
- Asset detail modal with community evidence comments
- Community leaderboard
- Upload form for new assets
- Studio audit request form
- Demo Pro membership and demo ad placement

## Backend

The app uses Supabase Postgres through the Supabase REST and Auth APIs.

Tables used by the frontend:

- `assets` - shared visual assets in the review queue
- `votes` - community AI/authentic votes
- `evidence` - evidence comments attached to assets
- `subscribers` - demo Pro subscriber records
- `audit_requests` - studio batch-audit requests

The committed Supabase key is a publishable anon key only. Do not commit the Supabase service-role key or database password.

## Monetization status

Monetization is intentionally demo-only for the MBA prototype:

- The free-tier ad slot is a placeholder; no ad network is connected.
- Pro activation writes a demo subscriber record; no Stripe checkout or card charge is connected.
- The verification report download is a demo export.

Connect approved AdSense and Stripe accounts before presenting these as live revenue systems.

## Run locally

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
```

## Deployment note

The current live prototype is hosted as an Instinct File. This repository contains the React/Vite source for that app so it can also be deployed to any static host that supports Vite builds.
