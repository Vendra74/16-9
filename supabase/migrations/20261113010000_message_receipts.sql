-- Marcadores das mensagens: enviada, recebida e lida.
--
-- "Lida" já existia (a_read_at / b_read_at). Aqui entra "recebida": a hora em
-- que o app de cada pessoa buscou as mensagens da conversa pela última vez.
-- Uma mensagem minha está recebida se a outra pessoa recebeu depois de eu
-- enviar, e lida se ela leu depois de eu enviar.

alter table public.conversations
  add column if not exists a_delivered_at timestamptz not null default now(),
  add column if not exists b_delivered_at timestamptz not null default now();

-- O app chama ao buscar a lista de conversas: tudo o que chegou até agora está recebido.
-- Só mexe nas conversas com mensagem nova da outra pessoa, para não gerar aviso à toa.
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
    and last_sender is distinct from auth.uid()
    and last_message_at > (case when user_a = auth.uid() then a_delivered_at else b_delivered_at end);
$$;

revoke execute on function public.mark_conversations_delivered() from public, anon;
grant execute on function public.mark_conversations_delivered() to authenticated;

-- Quem leu também recebeu.
create or replace function public.mark_conversation_read(conv uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.conversations
  set a_read_at = case when user_a = auth.uid() then now() else a_read_at end,
      b_read_at = case when user_b = auth.uid() then now() else b_read_at end,
      a_delivered_at = case when user_a = auth.uid() then now() else a_delivered_at end,
      b_delivered_at = case when user_b = auth.uid() then now() else b_delivered_at end
  where id = conv and auth.uid() in (user_a, user_b);
$$;

grant execute on function public.mark_conversation_read(uuid) to authenticated;
