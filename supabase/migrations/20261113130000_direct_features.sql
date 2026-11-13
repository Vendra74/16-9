-- 16:9: mensagens mais completas. Rode uma vez no SQL Editor, depois dos anteriores.
--
--   * pedidos de mensagem (quem você não segue cai numa caixa separada)
--   * responder a uma mensagem, reagir, editar, encaminhar
--   * silenciar e fixar conversas
--   * desligar "lida" e "online" no Perfil

-- ---------------------------------------------------------------------------
-- Colunas novas
-- ---------------------------------------------------------------------------

alter table public.conversations
  add column if not exists started_by uuid,
  -- Conversas que já existem continuam abertas; só as novas podem nascer como pedido.
  add column if not exists accepted boolean not null default true,
  add column if not exists a_muted boolean not null default false,
  add column if not exists b_muted boolean not null default false,
  add column if not exists a_pinned boolean not null default false,
  add column if not exists b_pinned boolean not null default false,
  -- O "lida" que a outra pessoa vê. a_read_at/b_read_at seguem controlando o aviso de não lida.
  add column if not exists a_seen_at timestamptz,
  add column if not exists b_seen_at timestamptz;

update public.conversations
set a_seen_at = coalesce(a_seen_at, a_read_at),
    b_seen_at = coalesce(b_seen_at, b_read_at);

alter table public.messages
  add column if not exists reply_to uuid references public.messages (id) on delete set null,
  add column if not exists edited_at timestamptz,
  -- Quem reagiu e com o quê: { "<id da pessoa>": "❤️" }. Conversa é sempre de duas pessoas.
  add column if not exists reactions jsonb not null default '{}'::jsonb,
  add column if not exists forwarded boolean not null default false;

alter table public.profiles
  add column if not exists hide_read boolean not null default false,
  add column if not exists hide_online boolean not null default false;

-- ---------------------------------------------------------------------------
-- Ao enviar: confere a resposta citada e decide se a conversa nasce como pedido
-- ---------------------------------------------------------------------------

-- Quem manda pelo app não escolhe reações nem "editada", e só responde a mensagem desta conversa.
create or replace function public.on_message_insert_extras()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.edited_at := null;
    new.reactions := '{}'::jsonb;
    new.forwarded := coalesce(new.forwarded, false);
    if new.reply_to is not null and not exists (
      select 1 from public.messages m
      where m.id = new.reply_to and m.conversation_id = new.conversation_id
    ) then
      new.reply_to := null;
    end if;
  end if;
  return new;
end;
$$;

-- A primeira mensagem decide se a conversa é um pedido; a resposta de quem recebeu aceita.
create or replace function public.on_message_insert_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  conv public.conversations%rowtype;
  other uuid;
  follows_sender boolean := true;
begin
  select * into conv from public.conversations where id = new.conversation_id;
  if conv.id is null or new.sender_id not in (conv.user_a, conv.user_b) then
    return new; -- a regra de quem pode escrever recusa logo adiante
  end if;
  other := case when conv.user_a = new.sender_id then conv.user_b else conv.user_a end;

  if conv.last_message_at is null then
    -- Vira pedido se quem recebe não segue quem escreveu.
    if to_regclass('public.follows') is not null then
      execute 'select exists (select 1 from public.follows where follower = $1 and followed = $2)'
        into follows_sender using other, new.sender_id;
    end if;
    update public.conversations
    set started_by = new.sender_id, accepted = follows_sender
    where id = conv.id;
  elsif not conv.accepted and conv.started_by is distinct from new.sender_id then
    update public.conversations set accepted = true where id = conv.id;
  end if;
  return new;
end;
$$;

drop trigger if exists messages_before_insert_extras on public.messages;
create trigger messages_before_insert_extras
  before insert on public.messages
  for each row execute function public.on_message_insert_extras();

drop trigger if exists messages_before_insert_request on public.messages;
create trigger messages_before_insert_request
  before insert on public.messages
  for each row execute function public.on_message_insert_request();

-- ---------------------------------------------------------------------------
-- Pedidos de mensagem
-- ---------------------------------------------------------------------------

create or replace function public.accept_conversation(conv uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.conversations
  set accepted = true
  where id = conv
    and auth.uid() in (user_a, user_b)
    and started_by is distinct from auth.uid();
$$;

-- Recusar apaga a conversa (e as mensagens dela) para as duas pessoas.
create or replace function public.decline_conversation(conv uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.conversations
  where id = conv
    and not accepted
    and auth.uid() in (user_a, user_b)
    and started_by is distinct from auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Silenciar e fixar: cada pessoa tem o seu, na mesma conversa
-- ---------------------------------------------------------------------------

-- null = deixa como está.
create or replace function public.set_conversation_flags(conv uuid, muted boolean, pinned boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.conversations
  set a_muted = case when user_a = auth.uid() then coalesce(muted, a_muted) else a_muted end,
      b_muted = case when user_b = auth.uid() then coalesce(muted, b_muted) else b_muted end,
      a_pinned = case when user_a = auth.uid() then coalesce(pinned, a_pinned) else a_pinned end,
      b_pinned = case when user_b = auth.uid() then coalesce(pinned, b_pinned) else b_pinned end
  where id = conv and auth.uid() in (user_a, user_b);
$$;

-- ---------------------------------------------------------------------------
-- Reagir e editar
-- ---------------------------------------------------------------------------

-- emoji vazio ou null tira a reação.
create or replace function public.react_to_message(msg uuid, emoji text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.messages m
  set reactions = case
        when coalesce(emoji, '') = '' then m.reactions - auth.uid()::text
        else m.reactions || jsonb_build_object(auth.uid()::text, left(emoji, 16))
      end
  from public.conversations c
  where m.id = msg
    and c.id = m.conversation_id
    and auth.uid() in (c.user_a, c.user_b)
    and not public.is_blocked(c.user_a, c.user_b);
$$;

-- Só texto, só a própria mensagem, até 15 minutos depois de enviar.
create or replace function public.edit_message(msg uuid, new_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean text := btrim(coalesce(new_body, ''));
  edited public.messages%rowtype;
begin
  if clean = '' or char_length(clean) > 2000 then
    raise exception 'invalid_body';
  end if;
  update public.messages
  set body = clean, edited_at = now()
  where id = msg
    and sender_id = auth.uid()
    and kind = 'text'
    and body <> ''
    and created_at > now() - interval '15 minutes'
  returning * into edited;
  if edited.id is null then
    raise exception 'cannot_edit';
  end if;
  -- Se era a última da conversa, a prévia acompanha.
  update public.conversations
  set last_message = left(clean, 140)
  where id = edited.conversation_id and last_message_at = edited.created_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- "Lida", "recebida" e "online" respeitam os pedidos e as escolhas do Perfil
-- ---------------------------------------------------------------------------

-- Quem desligou o "lida" continua zerando o próprio aviso de não lida, mas a outra
-- pessoa não fica sabendo. Num pedido ainda não aceito, abrir também não conta.
create or replace function public.mark_conversation_read(conv uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.conversations c
  set a_read_at = case when c.user_a = auth.uid() then now() else c.a_read_at end,
      b_read_at = case when c.user_b = auth.uid() then now() else c.b_read_at end,
      a_delivered_at = case when c.user_a = auth.uid() and shown.ok then now() else c.a_delivered_at end,
      b_delivered_at = case when c.user_b = auth.uid() and shown.ok then now() else c.b_delivered_at end,
      a_seen_at = case when c.user_a = auth.uid() and shown.ok and not shown.hidden then now() else c.a_seen_at end,
      b_seen_at = case when c.user_b = auth.uid() and shown.ok and not shown.hidden then now() else c.b_seen_at end
  from (
    select (c2.accepted or c2.started_by = auth.uid()) as ok,
           coalesce((select p.hide_read from public.profiles p where p.id = auth.uid()), false) as hidden
    from public.conversations c2 where c2.id = conv
  ) shown
  where c.id = conv and auth.uid() in (c.user_a, c.user_b);
$$;

create or replace function public.mark_conversations_delivered()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.conversations
  set a_delivered_at = case when user_a = auth.uid() then now() else a_delivered_at end,
      b_delivered_at = case when user_b = auth.uid() then now() else b_delivered_at end
  where auth.uid() in (user_a, user_b)
    and accepted
    and last_sender is distinct from auth.uid()
    and last_message_at > (case when user_a = auth.uid() then a_delivered_at else b_delivered_at end);
$$;

-- Quem esconde o próprio "online" também não vê o dos outros.
create or replace function public.presence_of(ids uuid[])
returns table (user_id uuid, online boolean, last_seen_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.user_id,
         p.online and p.last_seen_at > now() - interval '90 seconds',
         p.last_seen_at
  from public.presence p
  join public.profiles them on them.id = p.user_id
  where p.user_id = any (ids)
    and p.user_id <> auth.uid()
    and not them.hide_online
    and not coalesce((select me.hide_online from public.profiles me where me.id = auth.uid()), false)
    and not public.is_blocked(auth.uid(), p.user_id)
    and exists (
      select 1 from public.conversations c
      where c.user_a = least(auth.uid(), p.user_id)
        and c.user_b = greatest(auth.uid(), p.user_id)
        and c.accepted
    );
$$;

revoke execute on function public.accept_conversation(uuid) from public, anon;
revoke execute on function public.decline_conversation(uuid) from public, anon;
revoke execute on function public.set_conversation_flags(uuid, boolean, boolean) from public, anon;
revoke execute on function public.react_to_message(uuid, text) from public, anon;
revoke execute on function public.edit_message(uuid, text) from public, anon;
grant execute on function public.accept_conversation(uuid) to authenticated;
grant execute on function public.decline_conversation(uuid) to authenticated;
grant execute on function public.set_conversation_flags(uuid, boolean, boolean) to authenticated;
grant execute on function public.react_to_message(uuid, text) to authenticated;
grant execute on function public.edit_message(uuid, text) to authenticated;

notify pgrst, 'reload schema';
