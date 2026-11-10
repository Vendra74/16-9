-- 16:9: comentários nos posts. Rode uma vez no SQL Editor, depois dos anteriores.

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index comments_post_idx on public.comments (post_id, created_at);

alter table public.comments enable row level security;

-- Comentários de quem você bloqueou somem para você.
create policy "Comentários visíveis, menos de quem você bloqueou"
  on public.comments for select to authenticated
  using (
    not exists (
      select 1 from public.blocks
      where blocker = (select auth.uid()) and blocked = comments.user_id
    )
  );

-- Cada um comenta em seu nome, e não em post de quem bloqueou ou foi bloqueado.
create policy "Cada um comenta em seu nome"
  on public.comments for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.posts p
      where p.id = post_id and not public.is_blocked(p.user_id, (select auth.uid()))
    )
  );

-- Apaga quem escreveu ou o dono do post.
create policy "Apaga quem escreveu ou o dono do post"
  on public.comments for delete to authenticated
  using (
    (select auth.uid()) = user_id
    or exists (select 1 from public.posts p where p.id = post_id and p.user_id = (select auth.uid()))
  );

-- Total de comentários em cada post, mantido pelo banco.
alter table public.posts add column comment_count integer not null default 0;

create or replace function public.on_comment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set comment_count = comment_count + 1 where id = new.post_id;
    return new;
  else
    update public.posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
    return old;
  end if;
end;
$$;

create trigger comments_after_change
  after insert or delete on public.comments
  for each row execute function public.on_comment_change();

-- Denúncia de comentário.
alter table public.reports add column comment_id uuid;

notify pgrst, 'reload schema';
