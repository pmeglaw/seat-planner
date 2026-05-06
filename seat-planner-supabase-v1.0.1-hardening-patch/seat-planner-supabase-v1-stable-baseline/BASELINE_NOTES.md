# Seat Planner Supabase V1 Stable Baseline

This package is the current stable Supabase/Next.js baseline for the internal Office Seat Planner.

## Current baseline status

- Full 60-seat office map layout
- Supabase Auth magic-link login
- Admin draft view at `/admin`
- Viewer/published map at `/`
- Supabase Postgres-backed seats, employees, and profiles
- Role-based admin/viewer behavior
- Seat inspector with glass UI polish
- Add seat, move seat, edit seat, delete seat
- Employee assignment with name and position entry
- Show Names / Hide Names toggle
- Search and filters for employee, department, position, seat, and status
- QA-fixed TypeScript, lint, and build baseline from the previous package

## Local setup

1. Copy your working `.env.local` into this folder, next to `package.json`.
2. Install dependencies:

```bash
npm install
```

3. Run QA checks:

```bash
npm run test
npm run typecheck
npm run lint
npm run build
```

4. Start local dev:

```bash
npm run dev
```

5. Open:

```txt
http://localhost:3000/admin
```

## Supabase data note

Your Supabase database was reset to the clean 60-seat draft + 60-seat published layout. Do not run coordinate normalization again. Seat coordinates are already normalized from 0 to 1.

## Manual QA checklist

- Log in with magic link.
- Confirm `/admin` opens for admin user.
- Confirm `/` opens viewer map.
- Select a seat and confirm inspector opens.
- Add employee name + position and save.
- Refresh and confirm assignment persists.
- Toggle Show Names / Hide Names.
- Search for the assigned employee and confirm matching seat stays bright.
- Filter by department and status.
- Move a selected seat using Move Seat mode only.
- Refresh and confirm moved position persists.
- Add a new seat from Advanced.
- Delete a test seat.
- Publish draft map.
- Open `/` and confirm published map reflects changes.

## Do not include in shared zips

- `.env.local`
- `node_modules`
- `.next`
