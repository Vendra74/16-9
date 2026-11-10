-- 16:9: mensagens diretas, posts compartilhados, bloqueio e denúncia.
-- Rode este arquivo uma vez no SQL Editor do Supabase, depois dos anteriores.

-- Bloqueio: quem bloqueia deixa de ver os posts da pessoa, e nenhum dos dois manda mensagem ao outro.
create table public.blocks (
  blocker uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  blocked uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);

alter table public.blocks enable row level security;

create policy "Cada um vê quem bloqueou"
  on public.blocks for select to authenticated
  using ((select auth.uid()) = blocker);

create policy "Cada um bloqueia em seu nome"
  on public.blocks for insert to authenticated
  with check ((select auth.uid()) = blocker);

create policy "Cada um desbloqueia quem bloqueou"
  on public.blocks for delete to authenticated
  using ((select auth.uid()) = blocker);

-- Verdadeiro se qualquer um dos dois bloqueou o outro.
create or replace function public.is_blocked(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks
    where (blocker = a and blocked = b) or (blocker = b and blocked = a)
  );
$$;

-- Posts de quem você bloqueou somem do seu feed.
drop policy "Publicações visíveis para quem está logado" on public.posts;
create policy "Publicações visíveis, menos de quem você bloqueou"
  on public.posts for select to authenticated
  using (
    not exists (
      select 1 from public.blocks
      where blocker = (select auth.uid()) and blocked = posts.user_id
    )
  );

-- Denúncias: só o time lê (pelo painel do Supabase).
create table public.reports (
  id bigint generated always as identity primary key,
  reporter uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  reported_user uuid references public.profiles (id) on delete set null,
  post_id uuid references public.posts (id) on delete set null,
  message_id uuid,
  reason text not null default '' check (char_length(reason) <= 1000),
  created_at timestamptz not null default now()
);

alter table public.reports enable row level security;

create policy "Cada um denuncia em seu nome"
  on public.reports for insert to authenticated
  with check ((select auth.uid()) = reporter);

-- Conversas: sempre entre duas pessoas, guardadas em ordem (user_a < user_b) para não duplicar.
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles (id) on delete cascade,
  user_b uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  last_message text not null default '',
  last_sender uuid,
  a_read_at timestamptz not null default now(),
  b_read_at timestamptz not null default now(),
  unique (user_a, user_b),
  check (user_a < user_b)
);

create index conversations_user_a_idx on public.conversations (user_a, last_message_at desc);
create index conversations_user_b_idx on public.conversations (user_b, last_message_at desc);

alter table public.conversations enable row level security;

create policy "Só os dois veem a conversa"
  on public.conversations for select to authenticated
  using ((select auth.uid()) in (user_a, user_b));

-- Abre (ou reaproveita) a conversa com outra pessoa e devolve o id.
create or replace function public.start_conversation(other uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  a uuid := least(me, other);
  b uuid := greatest(me, other);
  conv uuid;
begin
  if me is null then raise exception 'not_authenticated'; end if;
  if other = me then raise exception 'cannot_message_self'; end if;
  if public.is_blocked(me, other) then raise exception 'blocked'; end if;

  insert into public.conversations (user_a, user_b)
  values (a, b)
  on conflict (user_a, user_b) do nothing;

  select id into conv from public.conversations where user_a = a and user_b = b;
  return conv;
end;
$$;

grant execute on function public.start_conversation(uuid) to authenticated;

-- Marca a conversa como lida por quem chamou.
create or replace function public.mark_conversation_read(conv uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.conversations
  set a_read_at = case when user_a = auth.uid() then now() else a_read_at end,
      b_read_at = case when user_b = auth.uid() then now() else b_read_at end
  where id = conv and auth.uid() in (user_a, user_b);
$$;

grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- Mensagens. Um post compartilhado vai em post_id (o texto pode ficar vazio).
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null default '' check (char_length(body) <= 2000),
  post_id uuid references public.posts (id) on delete set null,
  created_at timestamptz not null default now(),
  check (body <> '' or post_id is not null)
);

create index messages_conversation_idx on public.messages (conversation_id, created_at desc);

alter table public.messages enable row level security;

create policy "Só os dois leem as mensagens"
  on public.messages for select to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and (select auth.uid()) in (c.user_a, c.user_b)
    )
  );

create policy "Só os dois escrevem, e não com bloqueio"
  on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (select auth.uid()) in (c.user_a, c.user_b)
        and not public.is_blocked(c.user_a, c.user_b)
    )
  );

-- Mantém o resumo da conversa (prévia, horário, quem mandou) e marca como lida para quem enviou.
create or replace function public.on_message_sent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
  set last_message_at = new.created_at,
      last_message = case when new.body <> '' then left(new.body, 140) else 'Compartilhou um trabalho' end,
      last_sender = new.sender_id,
      a_read_at = case when user_a = new.sender_id then new.created_at else a_read_at end,
      b_read_at = case when user_b = new.sender_id then new.created_at else b_read_at end
  where id = new.conversation_id;
  return new;
end;
$$;

create trigger messages_after_insert
  after insert on public.messages
  for each row execute function public.on_message_sent();

-- Tempo real: o app recebe mensagens novas e mudanças nas conversas sem recarregar.
alter publication supabase_realtime add table public.messages, public.conversations;
