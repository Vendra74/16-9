-- 16:9: seguir pessoas. Rode uma vez no SQL Editor, depois dos anteriores.
-- Quem segue quem é público para quem está logado (como no Instagram);
-- as listas escondem quem você bloqueou ou quem bloqueou você.

create table public.follows (
  follower uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  followed uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower, followed),
  check (follower <> followed)
);

create index follows_followed_idx on public.follows (followed, created_at desc);
create index follows_follower_idx on public.follows (follower, created_at desc);

alter table public.follows enable row level security;

create policy "Quem segue quem é visível para quem está logado"
  on public.follows for select to authenticated
  using (true);

create policy "Cada um segue em seu nome, menos quem está bloqueado"
  on public.follows for insert to authenticated
  with check (
    (select auth.uid()) = follower
    and not public.is_blocked(follower, followed)
  );

create policy "Cada um deixa de seguir em seu nome"
  on public.follows for delete to authenticated
  using ((select auth.uid()) = follower);

-- Bloquear desfaz o seguir nos dois sentidos.
create or replace function public.on_block_unfollow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.follows
  where (follower = new.blocker and followed = new.blocked)
     or (follower = new.blocked and followed = new.blocker);
  return new;
end;
$$;

create trigger blocks_after_insert_unfollow
  after insert on public.blocks
  for each row execute function public.on_block_unfollow();

-- Seguidores ('followers') ou seguidos ('following') de uma pessoa, do mais
-- recente ao mais antigo, dizendo se você segue cada um.
create or replace function public.follow_list(person uuid, kind text)
returns table (id uuid, username text, display_name text, avatar_url text, specialty text, i_follow boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.specialty,
         exists (select 1 from public.follows mine
                 where mine.follower = (select auth.uid()) and mine.followed = p.id) as i_follow
  from public.follows f
  join public.profiles p
    on p.id = case when kind = 'followers' then f.follower else f.followed end
  where (select auth.uid()) is not null
    and kind in ('followers', 'following')
    and (case when kind = 'followers' then f.followed else f.follower end) = person
    and not public.is_blocked(p.id, (select auth.uid()))
  order by f.created_at desc
  limit 500;
$$;

revoke all on function public.follow_list(uuid, text) from public, anon;
grant execute on function public.follow_list(uuid, text) to authenticated;

-- "Seguido por X e Y": quem você segue e também segue essa pessoa (até 3),
-- com o total em cada linha.
create or replace function public.followed_by_people_i_follow(person uuid)
returns table (id uuid, username text, display_name text, avatar_url text, total bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username, p.display_name, p.avatar_url, count(*) over () as total
  from public.follows mine
  join public.follows theirs on theirs.follower = mine.followed and theirs.followed = person
  join public.profiles p on p.id = mine.followed
  where mine.follower = (select auth.uid())
    and not public.is_blocked(p.id, (select auth.uid()))
  order by theirs.created_at desc
  limit 3;
$$;

revoke all on function public.followed_by_people_i_follow(uuid) from public, anon;
grant execute on function public.followed_by_people_i_follow(uuid) to authenticated;
