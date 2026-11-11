-- 16:9: carrossel. Um post de foto pode levar até 10 fotos.
--
-- A primeira continua em image_path (é o que os builds antigos, as grades e as
-- mensagens mostram). As demais ficam em extra_images, na ordem escolhida.

alter table public.posts
  add column extra_images text[] not null default '{}'
    check (cardinality(extra_images) <= 9);

-- Mesmas regras de antes, mais as do carrossel: só em foto, e só imagens da
-- própria pasta de quem publica.
create or replace function public.on_post_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  extra text;
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
      new.extra_images := '{}';
    else
      new.mux_upload_id := null;
      new.status := 'ready';
    end if;
    foreach extra in array new.extra_images loop
      if extra is null or extra not like new.user_id::text || '/%' then
        raise exception 'image_outside_own_folder';
      end if;
    end loop;
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
