-- 16:9: notificações push. Rode uma vez no SQL Editor, depois dos anteriores.
--
-- Cada aparelho que aceita notificações guarda aqui o seu endereço de entrega (token).
-- Quem envia é a função "notify", no servidor; o app nunca lê o token dos outros.

create table public.push_tokens (
  token text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null default '',
  updated_at timestamptz not null default now()
);

create index push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

create policy "Cada um vê os próprios aparelhos"
  on public.push_tokens for select to authenticated
  using ((select auth.uid()) = user_id);

-- Usado ao sair da conta: o aparelho deixa de receber notificações dela.
create policy "Cada um remove os próprios aparelhos"
  on public.push_tokens for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Registra o aparelho para quem está logado. Se o mesmo aparelho já estava em
-- outra conta (trocou de usuário sem sair), ele passa para a conta atual.
create or replace function public.register_push_token(device_token text, device_platform text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if device_token is null or char_length(device_token) not between 10 and 300 then
    raise exception 'bad_token';
  end if;
  insert into public.push_tokens (token, user_id, platform)
  values (device_token, auth.uid(), left(coalesce(device_platform, ''), 20))
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end;
$$;

revoke execute on function public.register_push_token(text, text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;

notify pgrst, 'reload schema';
