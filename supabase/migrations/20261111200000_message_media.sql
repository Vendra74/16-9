-- 16:9: foto e vídeo dentro das conversas.
--
-- A foto (ou a capa do vídeo) fica num bucket PRIVADO, "messages": só as duas
-- pessoas da conversa conseguem abrir. O vídeo vai para o Mux, igual aos posts,
-- e a mensagem nasce "processing" até o aviso do Mux chegar.

alter table public.messages
  add column kind text not null default 'text' check (kind in ('text', 'photo', 'video')),
  add column image_path text,
  add column image_width integer,
  add column image_height integer,
  add column status text not null default 'ready' check (status in ('processing', 'ready', 'failed')),
  add column video_url text,
  add column duration real,
  add column mux_upload_id text unique,
  add column mux_asset_id text;

-- Antes a mensagem precisava de texto ou de um post; agora também vale foto ou vídeo.
do $$
declare
  old_check text;
begin
  for old_check in
    select conname from pg_constraint
    where conrelid = 'public.messages'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%post_id IS NOT NULL%'
  loop
    execute format('alter table public.messages drop constraint %I', old_check);
  end loop;
end;
$$;

alter table public.messages
  add constraint messages_content_check check (body <> '' or post_id is not null or image_path is not null),
  add constraint messages_media_check check (kind = 'text' or image_path is not null);

-- Quem manda pelo app não escolhe o estado nem o endereço do vídeo (igual aos posts).
create or replace function public.on_message_insert()
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
    -- A imagem tem que estar na pasta desta conversa, enviada por quem escreve.
    if new.image_path is not null
       and new.image_path not like new.conversation_id::text || '/' || new.sender_id::text || '/%' then
      raise exception 'image_outside_conversation';
    end if;
  end if;
  return new;
end;
$$;

create trigger messages_before_insert
  before insert on public.messages
  for each row execute function public.on_message_insert();

-- A prévia da conversa diz o que foi enviado.
create or replace function public.on_message_sent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
  set last_message_at = new.created_at,
      last_message = case
        when new.body <> '' then left(new.body, 140)
        when new.kind = 'photo' then 'Foto'
        when new.kind = 'video' then 'Vídeo'
        else 'Compartilhou um trabalho'
      end,
      last_sender = new.sender_id,
      a_read_at = case when user_a = new.sender_id then new.created_at else a_read_at end,
      b_read_at = case when user_b = new.sender_id then new.created_at else b_read_at end
  where id = new.conversation_id;
  return new;
end;
$$;

-- Se o envio do vídeo falhar no meio, o app apaga a mensagem que tinha criado.
create policy "Cada um apaga as mensagens que enviou"
  on public.messages for delete to authenticated
  using (sender_id = (select auth.uid()));

-- Bucket privado: <id da conversa>/<id de quem enviou>/<arquivo>.jpg
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('messages', 'messages', false, 10485760, array['image/jpeg'])
on conflict (id) do nothing;

create policy "Só os dois da conversa enviam imagens nela"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'messages'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and exists (
      select 1 from public.conversations c
      where c.id::text = (storage.foldername(name))[1]
        and (select auth.uid()) in (c.user_a, c.user_b)
    )
  );

create policy "Só os dois da conversa abrem as imagens dela"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'messages'
    and exists (
      select 1 from public.conversations c
      where c.id::text = (storage.foldername(name))[1]
        and (select auth.uid()) in (c.user_a, c.user_b)
    )
  );

create policy "Cada um apaga as imagens que enviou nas conversas"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'messages'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

notify pgrst, 'reload schema';
