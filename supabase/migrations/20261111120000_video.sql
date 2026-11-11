-- 16:9: posts de vídeo (com som). Rode uma vez no SQL Editor, depois dos anteriores.
--
-- O vídeo fica no Mux; aqui guardamos só o endereço para tocar (video_url).
-- A capa continua em image_path, como nas fotos, então quem ainda está numa
-- versão antiga do app vê o vídeo como uma foto em vez de um post quebrado.

alter table public.posts
  add column kind text not null default 'photo' check (kind in ('photo', 'video')),
  add column status text not null default 'ready' check (status in ('processing', 'ready', 'failed')),
  add column video_url text,
  add column duration real,
  add column mux_upload_id text unique,
  add column mux_asset_id text;

-- Quem publica pelo app não escolhe o estado nem o endereço do vídeo:
-- um vídeo sempre nasce "processando" e só o servidor (aviso do Mux) libera.
create or replace function public.on_post_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.video_url := null;
    new.duration := null;
    new.mux_asset_id := null;
    if new.kind = 'video' then
      if new.mux_upload_id is null then
        raise exception 'video_without_upload';
      end if;
      new.status := 'processing';
    else
      new.mux_upload_id := null;
      new.status := 'ready';
    end if;
  end if;
  return new;
end;
$$;

create trigger posts_before_insert
  before insert on public.posts
  for each row execute function public.on_post_insert();

-- No feed só entra o que está pronto. Quem publicou vê o próprio vídeo enquanto processa.
drop policy "Publicações visíveis, menos de quem você bloqueou" on public.posts;
create policy "Publicações prontas, menos de quem você bloqueou"
  on public.posts for select to authenticated
  using (
    (status = 'ready' or user_id = (select auth.uid()))
    and not exists (
      select 1 from public.blocks
      where blocker = (select auth.uid()) and blocked = posts.user_id
    )
  );

notify pgrst, 'reload schema';
