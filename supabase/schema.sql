-- =====================================================================
-- Filament Stock — Supabase schema
-- Paste the whole file into Supabase → SQL Editor → Run.
-- Safe to run again (idempotent).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table if not exists public.households (
  id             uuid primary key default gen_random_uuid(),
  name           text not null default 'My workshop',
  owner_id       uuid references auth.users(id) on delete set null,
  invite_code    text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  default_min_g  integer not null default 200 check (default_min_g >= 0),
  created_at     timestamptz not null default now()
);
-- How often the desiccant in a spool's own dry box (e.g. a 4 L cereal box) should be swapped.
alter table public.households add column if not exists box_desiccant_days integer not null default 30
  check (box_desiccant_days between 1 and 365);

create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  household_id  uuid not null references public.households(id) on delete cascade,
  display_name  text not null default '',
  is_kid        boolean not null default false,
  created_at    timestamptz not null default now()
);

-- Helper functions (security definer so policies don't recurse into profiles' RLS)
create or replace function public.my_household()
returns uuid language sql stable security definer set search_path = public as $$
  select household_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_adult()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select not is_kid from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.households h
                 where h.id = public.my_household() and h.owner_id = auth.uid())
$$;

create table if not exists public.printers (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null default public.my_household() references public.households(id) on delete cascade,
  name          text not null,
  model         text,
  nozzle_mm     numeric(3,2) not null default 0.40,
  is_default    boolean not null default false,
  created_at    timestamptz not null default now()
);

-- Short human-friendly code printed on labels / written to NFC tags.
-- No 0/O/1/I to avoid confusion. Globally unique (it's in the URL).
create or replace function public.gen_spool_code()
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  c text;
begin
  loop
    c := '';
    for i in 1..4 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.spools where code = c);
  end loop;
  return c;
end $$;

create table if not exists public.spools (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null default public.my_household() references public.households(id) on delete cascade,
  code            text not null unique default public.gen_spool_code(),
  spoolman_id     text,                       -- SpoolmanDB filament id (null = custom)
  brand           text not null default '',
  name            text not null,
  material        text not null,
  color_hex       text check (color_hex ~ '^[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$'), -- RRGGBB or RRGGBBAA
  color_hexes     text[],                     -- multi-colour filaments
  diameter        numeric(4,2) not null default 1.75,
  initial_g       numeric(8,2) not null check (initial_g > 0),
  spool_weight_g  numeric(8,2) check (spool_weight_g >= 0),
  min_g           integer check (min_g >= 0), -- per-spool override (custom filaments)
  extruder_temp   integer,
  bed_temp        integer,
  location        text not null default 'Shelf',
  notes           text,
  reorder         boolean not null default true,  -- keep on shopping list once archived?
  archived_at     timestamptz,
  created_by      uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists spools_household_idx on public.spools (household_id) where archived_at is null;
create index if not exists spools_spoolman_idx  on public.spools (household_id, spoolman_id);

-- Only one active spool per printer slot.
create unique index if not exists spools_one_per_slot
  on public.spools (household_id, location)
  where archived_at is null
    and location in ('AMS 1','AMS 2','AMS 3','AMS 4','AMS HT','Ender 3');

create table if not exists public.usage_log (
  id            uuid primary key default gen_random_uuid(),
  spool_id      uuid not null references public.spools(id) on delete cascade,
  household_id  uuid not null default public.my_household() references public.households(id) on delete cascade,
  grams         numeric(8,2) not null check (grams <> 0),   -- positive = filament consumed
  kind          text not null default 'print' check (kind in ('print','weigh','adjust')),
  note          text,
  created_by    uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint usage_print_positive check (kind <> 'print' or grams > 0)
);

create index if not exists usage_log_spool_idx on public.usage_log (spool_id, created_at desc);

-- Low-stock threshold per catalogue filament (summed over all its spools).
create table if not exists public.filament_minimums (
  household_id  uuid not null default public.my_household() references public.households(id) on delete cascade,
  spoolman_id   text not null,
  min_g         integer not null check (min_g >= 0),
  primary key (household_id, spoolman_id)
);

-- Places that hold desiccant: dry boxes and the AMS units.
create table if not exists public.dry_spots (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null default public.my_household() references public.households(id) on delete cascade,
  name           text not null,
  kind           text not null default 'box' check (kind in ('box','ams')),
  interval_days  integer not null default 30 check (interval_days between 1 and 365),
  active         boolean not null default true,
  sort           integer not null default 0,
  created_at     timestamptz not null default now(),
  unique (household_id, name)
);

-- Every time someone swaps or recharges the desiccant.
create table if not exists public.desiccant_log (
  id            uuid primary key default gen_random_uuid(),
  spot_id       uuid references public.dry_spots(id) on delete cascade,  -- AMS unit / shared box
  spool_id      uuid references public.spools(id) on delete cascade,     -- spool in its own box
  household_id  uuid not null default public.my_household() references public.households(id) on delete cascade,
  action        text not null default 'replaced' check (action in ('replaced','recharged')),
  humidity_pct  numeric(4,1) check (humidity_pct between 0 and 100),  -- hygrometer reading, optional
  note          text,
  created_by    uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

-- upgrade from the first version (spot only)
alter table public.desiccant_log add column if not exists spool_id uuid references public.spools(id) on delete cascade;
alter table public.desiccant_log alter column spot_id drop not null;
alter table public.desiccant_log drop constraint if exists desiccant_one_target;
alter table public.desiccant_log add constraint desiccant_one_target check (num_nonnulls(spot_id, spool_id) = 1);

create index if not exists desiccant_log_spot_idx  on public.desiccant_log (spot_id, created_at desc);
create index if not exists desiccant_log_spool_idx on public.desiccant_log (spool_id, created_at desc);

create or replace function public.seed_dry_spots(p_household uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.dry_spots (household_id, name, kind, interval_days, sort) values
    (p_household, 'AMS 2 Pro', 'ams', 60, 2),
    (p_household, 'AMS HT',    'ams', 60, 3)
  on conflict (household_id, name) do nothing
$$;
revoke execute on function public.seed_dry_spots(uuid) from anon, authenticated, public;

-- The "Dry box" spool location now means the spool's OWN box (one per spool, tracked via
-- desiccant_log.spool_id), so drop the old default shared "Dry box" spot if nothing was logged on it.
delete from public.dry_spots d
 where d.name = 'Dry box' and d.kind = 'box'
   and not exists (select 1 from public.desiccant_log l where l.spot_id = d.id);

-- Existing households (created before desiccant tracking) get the defaults once.
select public.seed_dry_spots(h.id)
from public.households h
where not exists (select 1 from public.dry_spots d where d.household_id = h.id);

-- ---------------------------------------------------------------------
-- Views (security_invoker → RLS of the caller applies)
-- ---------------------------------------------------------------------

drop view if exists public.dry_spot_status;
drop view if exists public.shopping_list;
drop view if exists public.spool_stock;

create view public.spool_stock with (security_invoker = true) as
select
  s.*,
  coalesce(u.used_g, 0)                                   as used_g,
  greatest(s.initial_g - coalesce(u.used_g, 0), 0)        as remaining_g,
  coalesce(s.min_g, fm.min_g, h.default_min_g)            as effective_min_g,
  fm.min_g                                                as filament_min_g,
  u.last_used_at,
  h.box_desiccant_days                                    as desiccant_interval_days,
  dl.created_at                                           as desiccant_changed_at,
  dl.action                                               as desiccant_action,
  dl.humidity_pct                                         as desiccant_humidity_pct
from public.spools s
join public.households h on h.id = s.household_id
left join public.filament_minimums fm
  on fm.household_id = s.household_id and fm.spoolman_id = s.spoolman_id
left join lateral (
  select sum(l.grams) as used_g,
         max(l.created_at) filter (where l.kind = 'print') as last_used_at
  from public.usage_log l
  where l.spool_id = s.id
) u on true
left join lateral (
  select x.created_at, x.action, x.humidity_pct
  from public.desiccant_log x
  where x.spool_id = s.id
  order by x.created_at desc
  limit 1
) dl on true;

-- One row per filament whose total remaining is at or below its minimum.
-- Archived spools stay in the group (with 0 g) while reorder = true,
-- so a finished colour shows up until you buy a new roll.
create view public.shopping_list with (security_invoker = true) as
select
  household_id,
  coalesce(spoolman_id, lower(brand || '|' || name || '|' || material)) as filament_key,
  max(spoolman_id)                                                      as spoolman_id,
  max(brand)      as brand,
  max(name)       as name,
  max(material)   as material,
  max(color_hex)  as color_hex,
  count(*) filter (where archived_at is null)                            as active_spools,
  coalesce(sum(remaining_g) filter (where archived_at is null), 0)       as total_remaining_g,
  max(effective_min_g)                                                   as min_g
from public.spool_stock
where archived_at is null or reorder
group by household_id, coalesce(spoolman_id, lower(brand || '|' || name || '|' || material))
having coalesce(sum(remaining_g) filter (where archived_at is null), 0) <= max(effective_min_g);

-- Each dry spot with its latest desiccant change (due/overdue is worked out in the app).
create view public.dry_spot_status with (security_invoker = true) as
select
  d.*,
  l.id           as last_log_id,
  l.created_at   as last_changed_at,
  l.action       as last_action,
  l.humidity_pct as last_humidity_pct,
  p.display_name as last_changed_by
from public.dry_spots d
left join lateral (
  select * from public.desiccant_log x
  where x.spot_id = d.id
  order by x.created_at desc
  limit 1
) l on true
left join public.profiles p on p.id = l.created_by;

-- ---------------------------------------------------------------------
-- New user → profile (+ household on first signup)
-- Sign up with  data: { display_name, invite_code }  to join an existing
-- household (joiners start as kids; the owner can change that).
-- ---------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  hh    uuid;
  code  text := upper(nullif(trim(new.raw_user_meta_data->>'invite_code'), ''));
  dname text := coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
                         split_part(new.email, '@', 1));
begin
  if code is not null then
    select id into hh from public.households where invite_code = code;
    if hh is null then
      raise exception 'Invalid invite code';
    end if;
    insert into public.profiles (id, household_id, display_name, is_kid)
    values (new.id, hh, dname, true);
  else
    insert into public.households (name, owner_id)
    values (dname || '''s workshop', new.id)
    returning id into hh;
    insert into public.profiles (id, household_id, display_name, is_kid)
    values (new.id, hh, dname, false);
    insert into public.printers (household_id, name, model, is_default) values
      (hh, 'X2D',     'Bambu Lab X2D (AMS 2 Pro + AMS HT)', true),
      (hh, 'Ender 3', 'Creality Ender 3',                   false);
    perform public.seed_dry_spots(hh);
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------

-- Move a spool (anyone in the household, kids too). If the target is a
-- printer slot that is already taken, the previous spool goes to the Shelf.
create or replace function public.move_spool(p_spool uuid, p_location text)
returns void language plpgsql security definer set search_path = public as $$
declare hh uuid := public.my_household();
begin
  if hh is null or not exists (select 1 from public.spools where id = p_spool and household_id = hh) then
    raise exception 'Spool not found';
  end if;
  if p_location in ('AMS 1','AMS 2','AMS 3','AMS 4','AMS HT','Ender 3') then
    update public.spools set location = 'Shelf'
     where household_id = hh and location = p_location and archived_at is null and id <> p_spool;
  end if;
  update public.spools set location = coalesce(nullif(trim(p_location), ''), 'Shelf') where id = p_spool;
end $$;

create or replace function public.set_member_kid(p_member uuid, p_is_kid boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'Only the household owner can do this'; end if;
  if p_member = auth.uid() then raise exception 'You cannot change your own role'; end if;
  update public.profiles set is_kid = p_is_kid
   where id = p_member and household_id = public.my_household();
end $$;

create or replace function public.rotate_invite_code()
returns text language plpgsql security definer set search_path = public as $$
declare c text := upper(substr(md5(gen_random_uuid()::text), 1, 8));
begin
  if not public.is_owner() then raise exception 'Only the household owner can do this'; end if;
  update public.households set invite_code = c where id = public.my_household();
  return c;
end $$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------

alter table public.households        enable row level security;
alter table public.profiles          enable row level security;
alter table public.printers          enable row level security;
alter table public.spools            enable row level security;
alter table public.usage_log         enable row level security;
alter table public.filament_minimums enable row level security;

-- households
drop policy if exists households_select on public.households;
create policy households_select on public.households for select to authenticated
  using (id = public.my_household());
drop policy if exists households_update on public.households;
create policy households_update on public.households for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- profiles (users may only change their own display_name, see grants below)
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (household_id = public.my_household());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- printers
drop policy if exists printers_select on public.printers;
create policy printers_select on public.printers for select to authenticated
  using (household_id = public.my_household());
drop policy if exists printers_write on public.printers;
create policy printers_write on public.printers for all to authenticated
  using (household_id = public.my_household() and public.is_adult())
  with check (household_id = public.my_household() and public.is_adult());

-- spools: everyone can see and add; only adults edit/delete
drop policy if exists spools_select on public.spools;
create policy spools_select on public.spools for select to authenticated
  using (household_id = public.my_household());
drop policy if exists spools_insert on public.spools;
create policy spools_insert on public.spools for insert to authenticated
  with check (household_id = public.my_household());
drop policy if exists spools_update on public.spools;
create policy spools_update on public.spools for update to authenticated
  using (household_id = public.my_household() and public.is_adult())
  with check (household_id = public.my_household() and public.is_adult());
drop policy if exists spools_delete on public.spools;
create policy spools_delete on public.spools for delete to authenticated
  using (household_id = public.my_household() and public.is_adult());

-- usage_log: everyone logs; you can undo your own entry for 15 min; adults can fix anything
drop policy if exists usage_select on public.usage_log;
create policy usage_select on public.usage_log for select to authenticated
  using (household_id = public.my_household());
drop policy if exists usage_insert on public.usage_log;
create policy usage_insert on public.usage_log for insert to authenticated
  with check (
    household_id = public.my_household()
    and created_by = auth.uid()
    and exists (select 1 from public.spools s where s.id = spool_id and s.household_id = public.my_household())
  );
drop policy if exists usage_update on public.usage_log;
create policy usage_update on public.usage_log for update to authenticated
  using (household_id = public.my_household() and public.is_adult())
  with check (household_id = public.my_household() and public.is_adult());
drop policy if exists usage_delete on public.usage_log;
create policy usage_delete on public.usage_log for delete to authenticated
  using (
    household_id = public.my_household()
    and (public.is_adult() or (created_by = auth.uid() and created_at > now() - interval '15 minutes'))
  );

-- filament_minimums: everyone reads, adults write
drop policy if exists minimums_select on public.filament_minimums;
create policy minimums_select on public.filament_minimums for select to authenticated
  using (household_id = public.my_household());
drop policy if exists minimums_write on public.filament_minimums;
create policy minimums_write on public.filament_minimums for all to authenticated
  using (household_id = public.my_household() and public.is_adult())
  with check (household_id = public.my_household() and public.is_adult());

-- dry_spots: everyone reads, adults configure
alter table public.dry_spots     enable row level security;
alter table public.desiccant_log enable row level security;

drop policy if exists dry_spots_select on public.dry_spots;
create policy dry_spots_select on public.dry_spots for select to authenticated
  using (household_id = public.my_household());
drop policy if exists dry_spots_write on public.dry_spots;
create policy dry_spots_write on public.dry_spots for all to authenticated
  using (household_id = public.my_household() and public.is_adult())
  with check (household_id = public.my_household() and public.is_adult());

-- desiccant_log: everyone (kids too) can log a change and undo their own for 15 min
drop policy if exists desiccant_select on public.desiccant_log;
create policy desiccant_select on public.desiccant_log for select to authenticated
  using (household_id = public.my_household());
drop policy if exists desiccant_insert on public.desiccant_log;
create policy desiccant_insert on public.desiccant_log for insert to authenticated
  with check (
    household_id = public.my_household()
    and created_by = auth.uid()
    and (
      exists (select 1 from public.dry_spots d where d.id = spot_id  and d.household_id = public.my_household())
      or exists (select 1 from public.spools s where s.id = spool_id and s.household_id = public.my_household())
    )
  );
drop policy if exists desiccant_update on public.desiccant_log;
create policy desiccant_update on public.desiccant_log for update to authenticated
  using (household_id = public.my_household() and public.is_adult())
  with check (household_id = public.my_household() and public.is_adult());
drop policy if exists desiccant_delete on public.desiccant_log;
create policy desiccant_delete on public.desiccant_log for delete to authenticated
  using (
    household_id = public.my_household()
    and (public.is_adult() or (created_by = auth.uid() and created_at > now() - interval '15 minutes'))
  );

-- ---------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------

-- Nothing for anonymous visitors.
revoke all on public.households, public.profiles, public.printers, public.spools,
              public.usage_log, public.filament_minimums,
              public.dry_spots, public.desiccant_log,
              public.spool_stock, public.shopping_list, public.dry_spot_status from anon;

-- Profiles are created by the trigger; users can only rename themselves.
revoke insert, update, delete on public.profiles from authenticated;
grant  update (display_name) on public.profiles to authenticated;

-- Households: owner may rename / change the default minimum only.
revoke insert, update, delete on public.households from authenticated;
grant  update (name, default_min_g, box_desiccant_days) on public.households to authenticated;

grant select on public.spool_stock, public.shopping_list, public.dry_spot_status to authenticated;

revoke execute on function public.move_spool(uuid, text),
                           public.set_member_kid(uuid, boolean),
                           public.rotate_invite_code() from anon, public;
grant  execute on function public.move_spool(uuid, text),
                           public.set_member_kid(uuid, boolean),
                           public.rotate_invite_code() to authenticated;
