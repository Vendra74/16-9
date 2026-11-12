-- 16:9: responder e curtir comentários, ver quem curtiu um post, e a prévia da
-- conversa acompanhar quando uma mensagem é apagada.

-- Respostas: um nível só. Responder a uma resposta entra na mesma conversa do comentário original.
alter table public.comments
  add column parent_id uuid references public.comments (id) on delete cascade,
  add column like_count integer not null default 0;

create index comments_parent_idx on public.comments (parent_id);

create or replace function public.on_comment_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent public.comments%rowtype;
begin
  new.like_count := 0;
  if new.parent_id is not null then
    select * into parent from public.comments where id = new.parent_id;
    if parent.id is null or parent.post_id <> new.post_id then
      raise exception 'reply_to_unknown_comment';
    end if;
    new.parent_id := coalesce(parent.parent_id, parent.id);
  end if;
  return new;
end;
$$;

create trigger comments_before_insert
  before insert on public.comments
  for each row execute function public.on_comment_insert();

-- Apagar um comentário leva as respostas junto, e o total do post tem que acompanhar:
-- o gatilho antigo já desconta uma a uma (ele roda para cada linha apagada).

-- Curtidas em comentários. Chave própria (id), como em likes, para a API não
-- enxergar um caminho extra entre comments e profiles.
create table public.comment_likes (
  id bigint generated always as identity primary key,
  comment_id uuid not null references public.comments (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint comment_likes_comment_user_key unique (comment_id, user_id)
);

create index comment_likes_user_idx on public.comment_likes (user_id);

alter table public.comment_likes enable row level security;

-- Cada um só enxerga as próprias curtidas; o total vem pronto em comments.like_count.
create policy "Cada um vê as próprias curtidas em comentários"
  on public.comment_likes for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Cada um curte comentários em seu nome"
  on public.comment_likes for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.comments c where c.id = comment_id)
  );

create policy "Cada um desfaz a própria curtida em comentário"
  on public.comment_likes for delete to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.on_comment_like_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.comments set like_count = like_count + 1 where id = new.comment_id;
    return new;
  else
    update public.comments set like_count = greatest(like_count - 1, 0) where id = old.comment_id;
    return old;
  end if;
end;
$$;

create trigger comment_likes_after_change
  after insert or delete on public.comment_likes
  for each row execute function public.on_comment_like_change();

-- Quem curtiu um post. As curtidas continuam privadas na tabela (o feed depende
-- disso para saber se VOCÊ curtiu); esta função entrega só a lista de pessoas,
-- sem quem você bloqueou ou quem bloqueou você.
create or replace function public.post_likers(post uuid)
returns table (id uuid, username text, display_name text, avatar_url text, specialty text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.specialty
  from public.likes l
  join public.profiles p on p.id = l.user_id
  where l.post_id = post
    and (select auth.uid()) is not null
    and not public.is_blocked(l.user_id, (select auth.uid()))
  order by l.created_at desc
  limit 200;
$$;

revoke all on function public.post_likers(uuid) from public, anon;
grant execute on function public.post_likers(uuid) to authenticated;

-- Mensagem apagada: a prévia da conversa volta para a mensagem anterior.
create or replace function public.on_message_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  last public.messages%rowtype;
begin
  select * into last from public.messages
  where conversation_id = old.conversation_id
  order by created_at desc
  limit 1;
  update public.conversations
  set last_message = case
        when last.id is null then ''
        when last.body <> '' then left(last.body, 140)
        when last.kind = 'photo' then 'Foto'
        when last.kind = 'video' then 'Vídeo'
        else 'Compartilhou um trabalho'
      end,
      last_message_at = last.created_at,
      last_sender = last.sender_id
  where id = old.conversation_id;
  return old;
end;
$$;

create trigger messages_after_delete
  after delete on public.messages
  for each row execute function public.on_message_deleted();

notify pgrst, 'reload schema';
