-- 16:9: notificações no idioma de cada aparelho. Rode uma vez no SQL Editor, depois dos anteriores.
--
-- Cada aparelho passa a guardar o idioma em que o app está aberto nele, e a função
-- "notify" escreve a notificação nesse idioma. Aparelhos já registrados ficam em
-- português até abrirem a versão nova do app.

alter table public.push_tokens add column if not exists language text not null default 'pt';

-- A versão antiga (sem idioma) sai para não haver duas funções com o mesmo nome;
-- a nova aceita a chamada antiga, porque o idioma é opcional.
drop function if exists public.register_push_token(text, text);

create or replace function public.register_push_token(
  device_token text,
  device_platform text default '',
  device_language text default 'pt'
)
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
  insert into public.push_tokens (token, user_id, platform, language)
  values (
    device_token,
    auth.uid(),
    left(coalesce(device_platform, ''), 20),
    left(coalesce(nullif(device_language, ''), 'pt'), 10)
  )
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        language = excluded.language,
        updated_at = now();
end;
$$;

revoke execute on function public.register_push_token(text, text, text) from public, anon;
grant execute on function public.register_push_token(text, text, text) to authenticated;

notify pgrst, 'reload schema';
