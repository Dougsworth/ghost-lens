-- Run in your own Supabase SQL Editor. Never use a service-role key in the browser.
create table if not exists public.ghost_notebooks (
  user_id uuid not null references auth.users(id) on delete cascade,
  learner text not null check (char_length(learner) between 1 and 80),
  snapshot jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, learner)
);
alter table public.ghost_notebooks enable row level security;
create policy "Notebook owners read" on public.ghost_notebooks for select to authenticated using ((select auth.uid()) = user_id);
create policy "Notebook owners create" on public.ghost_notebooks for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Notebook owners update" on public.ghost_notebooks for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Study Together across desktops (added in V12).
-- Each desktop's bridge mirrors room events here, so Lenses on different
-- computers share one room. Demo-grade security: anyone holding this
-- project's anon key can read and write these rows, so treat rooms as public
-- spaces, use random codes, and keep the cleanup below. NEVER put a
-- service-role key in the bridge or the Lens.
create table if not exists public.ghost_room_events (
  id bigint generated always as identity primary key,
  room text not null check (char_length(room) between 1 and 40),
  origin text not null check (char_length(origin) between 1 and 64),
  person text not null check (char_length(person) between 1 and 40),
  name text not null default '' check (char_length(name) <= 40),
  lesson text not null default '' check (char_length(lesson) <= 120),
  event jsonb not null check (pg_column_size(event) <= 32768),
  created_at timestamptz not null default now()
);
create index if not exists ghost_room_events_by_room on public.ghost_room_events (room, id);
alter table public.ghost_room_events enable row level security;
create policy "Rooms are shared: read" on public.ghost_room_events
  for select to anon, authenticated using (true);
create policy "Rooms are shared: write" on public.ghost_room_events
  for insert to anon, authenticated with check (true);
-- No update/delete policies: rows are append-only from clients.

-- Cleanup: room history is only useful for seconds. Run this now and then in
-- the SQL editor, or schedule it with pg_cron if the extension is enabled:
--   delete from public.ghost_room_events where created_at < now() - interval '1 hour';
