# Seahawks Gameday

Real-time flag football scoreboard. Multiple parents can update the score from their phones — all connected devices see changes instantly.

---

## Setup

### 1. Create a free Supabase project

1. Go to [supabase.com](https://supabase.com) and sign up (free)
2. Click **New project** — give it a name like `seahawks-gameday`
3. Wait ~2 minutes for provisioning

### 2. Run the SQL

In your Supabase dashboard, open the **SQL Editor** and run:

```sql
-- Create the game state table (one row, ever)
create table game_state (
  id int primary key default 1,
  seahawks_score int not null default 0,
  opponent_score int not null default 0,
  quarter int not null default 1,
  updated_at timestamptz not null default now(),
  constraint single_row check (id = 1)
);

-- Insert the initial row
insert into game_state (id) values (1);

-- Disable RLS (low-stakes family app — no auth needed)
alter table game_state disable row level security;

-- Enable Realtime on the table
alter publication supabase_realtime add table game_state;
```

### 3. Configure environment variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Fill in your credentials from the Supabase dashboard (**Settings → API**):

```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### 4. Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser (or on your phone via your local IP).

---

## Deploy

### Vercel (recommended)

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → **New Project** → import your repo
3. In **Environment Variables**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
4. Click **Deploy** — Vercel auto-detects Vite

### Netlify

1. Push to GitHub
2. Go to [netlify.com](https://netlify.com) → **Add new site** → import from GitHub
3. Set build command: `npm run build`, publish directory: `dist`
4. Under **Site settings → Environment variables**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
5. Deploy

Share the URL with other parents — anyone with the link can update the score.

---

## Add to Home Screen (PWA)

On iPhone: open the app in Safari → Share → **Add to Home Screen**  
On Android: open in Chrome → menu → **Add to Home Screen**

---

## How it works

- On load: fetches the current game row from Supabase, then subscribes to Realtime changes
- Score buttons write directly to Supabase via `upsert`
- The Realtime subscription fires for all connected clients (including the sender), so the UI always reflects confirmed DB state
- The **Refresh** button re-fetches manually as a fallback if Realtime disconnects
