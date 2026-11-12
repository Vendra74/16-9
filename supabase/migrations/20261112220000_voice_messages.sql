-- 16:9: mensagens de voz nas conversas. Rode uma vez no SQL Editor, depois dos anteriores.
--
-- O áudio fica no mesmo bucket PRIVADO das fotos de conversa ("messages"):
-- só as duas pessoas da conversa conseguem abrir. Vai até 2 minutos.

alter table public.messages add column if not exists audio_path text;

alter table public.messages
  drop constraint if exists messages_kind_check,
  drop constraint if exists messages_content_check,
  drop constraint if exists messages_media_check;

alter table public.messages
  add constraint messages_kind_check check (kind in ('text', 'photo', 'video', 'audio')),
  add constraint messages_content_check
    check (body <> '' or post_id is not null or image_path is not null or audio_path is not null),
  add constraint messages_media_check check (
    case kind
      when 'text' then true
      when 'audio' then audio_path is not null
      else image_path is not null
    end
  );

-- Quem manda pelo app não escolhe o estado nem o endereço do vídeo; no áudio, a duração
-- vem do app (é só o que aparece no balão) e fica limitada.
create or replace function public.on_message_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.video_url := null;
    new.mux_asset_id := null;
    if new.kind = 'audio' then
      new.duration := least(greatest(coalesce(new.duration, 0), 0), 125);
    else
      new.duration := null;
      new.audio_path := null;
    end if;
    if new.kind = 'video' then
      if new.mux_upload_id is null then
        raise exception 'video_without_upload';
      end if;
      new.status := 'processing';
    else
      new.mux_upload_id := null;
      new.status := 'ready';
    end if;
    -- A imagem e o áudio têm que estar na pasta desta conversa, enviados por quem escreve.
    if new.image_path is not null
       and new.image_path not like new.conversation_id::text || '/' || new.sender_id::text || '/%' then
      raise exception 'image_outside_conversation';
    end if;
    if new.audio_path is not null
       and new.audio_path not like new.conversation_id::text || '/' || new.sender_id::text || '/%' then
      raise exception 'audio_outside_conversation';
    end if;
  end if;
  return new;
end;
$$;

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
        when new.kind = 'audio' then 'Áudio'
        else 'Compartilhou um trabalho'
      end,
      last_sender = new.sender_id,
      a_read_at = case when user_a = new.sender_id then new.created_at else a_read_at end,
      b_read_at = case when user_b = new.sender_id then new.created_at else b_read_at end
  where id = new.conversation_id;
  return new;
end;
$$;

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
        when last.kind = 'audio' then 'Áudio'
        else 'Compartilhou um trabalho'
      end,
      last_message_at = last.created_at,
      last_sender = last.sender_id
  where id = old.conversation_id;
  return old;
end;
$$;

-- O bucket das conversas passa a aceitar áudio (m4a do iPhone e do Android; webm do navegador).
update storage.buckets
set allowed_mime_types = array['image/jpeg', 'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/webm']
where id = 'messages';

notify pgrst, 'reload schema';
