-- Online e "visto por último".
--
-- O app avisa a cada meio minuto que está aberto, e avisa quando sai da tela.
-- Só quem tem conversa com a pessoa (e não está bloqueado) consegue ver.
-- Ninguém lê a tabela direto: tudo passa pelas duas funções abaixo.

create table if not exists public.presence (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  online boolean not null default false
);

alter table public.presence enable row level security;

-- O app chama com true enquanto está aberto e com false ao sair da tela.
create or replace function public.set_presence(is_online boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.presence (user_id, last_seen_at, online)
  select auth.uid(), now(), is_online
  where auth.uid() is not null
  on conflict (user_id) do update set last_seen_at = now(), online = excluded.online;
$$;

-- Estado das pessoas pedidas, só das que conversam com quem chamou.
-- "Online" é decidido aqui, pelo relógio do servidor: avisou há menos de 90 s
-- e não avisou que saiu. Assim um app que fechou sem avisar não fica online para sempre.
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
  where p.user_id = any (ids)
    and p.user_id <> auth.uid()
    and not public.is_blocked(auth.uid(), p.user_id)
    and exists (
      select 1 from public.conversations c
      where c.user_a = least(auth.uid(), p.user_id)
        and c.user_b = greatest(auth.uid(), p.user_id)
    );
$$;

revoke execute on function public.set_presence(boolean) from public, anon;
revoke execute on function public.presence_of(uuid[]) from public, anon;
grant execute on function public.set_presence(boolean) to authenticated;
grant execute on function public.presence_of(uuid[]) to authenticated;
