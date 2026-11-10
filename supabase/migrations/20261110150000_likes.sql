-- 16:9: curtidas (a claquete). Rode uma vez no SQL Editor, depois dos anteriores.

create table public.likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index likes_user_idx on public.likes (user_id);

alter table public.likes enable row level security;

-- Cada um só enxerga as próprias curtidas: assim o feed sabe se você já curtiu,
-- e o total vem pronto em posts.like_count.
create policy "Cada um vê as próprias curtidas"
  on public.likes for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Cada um curte em seu nome"
  on public.likes for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.posts p where p.id = post_id)
  );

create policy "Cada um desfaz a própria curtida"
  on public.likes for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Total de curtidas em cada post, mantido pelo banco.
alter table public.posts add column like_count integer not null default 0;

create or replace function public.on_like_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set like_count = like_count + 1 where id = new.post_id;
    return new;
  else
    update public.posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
    return old;
  end if;
end;
$$;

create trigger likes_after_change
  after insert or delete on public.likes
  for each row execute function public.on_like_change();
