-- Public (signed-out) read access for IT Study Hub.
--
-- Run this once in Supabase Dashboard > SQL Editor. It is safe to run again:
-- each policy is dropped before it is recreated.
--
-- Guests can then browse the dashboard, calendar, groups, public profiles and
-- the student directory. Writes, join requests, reports, profile contacts,
-- WhatsApp group links and admin data stay protected by the existing policies.

-- Items and events are public study data.
drop policy if exists "public_read_items" on public.items;
create policy "public_read_items" on public.items
  for select to anon
  using (true);

drop policy if exists "public_read_events" on public.events;
create policy "public_read_events" on public.events
  for select to anon
  using (true);

-- Public profiles power #/u/:username and the student directory.
drop policy if exists "public_read_profiles" on public.profiles;
create policy "public_read_profiles" on public.profiles
  for select to anon
  using (true);

-- Groups keep the same 3-day-after-deadline visibility rule for guests.
drop policy if exists "public_read_groups" on public.groups;
create policy "public_read_groups" on public.groups
  for select to anon
  using (
    exists (
      select 1
      from public.items i
      where i.id = groups.item_id
        and i.due_at + interval '3 days' >= now()
    )
  );

-- Member lists are public, but only for groups that are still visible.
drop policy if exists "public_read_group_members" on public.group_members;
create policy "public_read_group_members" on public.group_members
  for select to anon
  using (
    exists (
      select 1
      from public.groups g
      where g.id = group_members.group_id
    )
  );
