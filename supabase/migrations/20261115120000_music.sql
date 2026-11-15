-- 16:9: música de fundo nos posts (vídeo, foto ou carrossel).
--
-- A música não é misturada ao arquivo do vídeo: o app toca as duas coisas
-- juntas. O post guarda qual música, de onde ela começa e o volume de cada som.
--
-- De onde a música pode vir:
--   1. Biblioteca do 16:9 (tabela music_tracks): faixas originais do projeto,
--      livres de direitos. Os arquivos ficam no site (sixteennine.com.br/musica).
--   2. Arquivo da própria pessoa, enviado ao bucket "music", na pasta dela.
--      Ela declara no app que tem os direitos; denúncias seguem o fluxo de sempre.

-- Biblioteca. Para incluir uma faixa nova basta uma linha aqui (o app lê a lista).
create table public.music_tracks (
  id text primary key check (id ~ '^[a-z0-9-]{1,40}$'),
  title text not null check (char_length(title) between 1 and 80),
  artist text not null default '16:9' check (char_length(artist) <= 80),
  -- Clima, em português, sem acento: épico = epico etc. O app traduz.
  mood text not null default 'outros' check (char_length(mood) <= 30),
  url text not null unique check (url like 'https://%'),
  duration real not null default 0 check (duration >= 0),
  position int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.music_tracks enable row level security;

create policy "Biblioteca de músicas visível para quem entrou"
  on public.music_tracks for select
  to authenticated
  using (active);

insert into public.music_tracks (id, title, mood, url, duration, position) values
  ('horizonte',  'Horizonte',  'epico',        'https://sixteennine.com.br/musica/horizonte.m4a',  73, 1),
  ('mare-mansa', 'Maré Mansa', 'calmo',        'https://sixteennine.com.br/musica/mare-mansa.m4a', 78, 2),
  ('sombra',     'Sombra',     'suspense',     'https://sixteennine.com.br/musica/sombra.m4a',     72, 3),
  ('dia-claro',  'Dia Claro',  'alegre',       'https://sixteennine.com.br/musica/dia-claro.m4a',  72, 4),
  ('cartas',     'Cartas',     'melancolico',  'https://sixteennine.com.br/musica/cartas.m4a',     85, 5),
  ('cafe',       'Café',       'lofi',         'https://sixteennine.com.br/musica/cafe.m4a',       77, 6),
  ('neon',       'Neon',       'eletronico',   'https://sixteennine.com.br/musica/neon.m4a',       68, 7),
  ('terra',      'Terra',      'documentario', 'https://sixteennine.com.br/musica/terra.m4a',      68, 8)
on conflict (id) do nothing;

-- A música de cada post.
alter table public.posts
  -- Faixa da biblioteca: o endereço dela, igual ao de music_tracks.url.
  add column if not exists music_url text check (music_url is null or char_length(music_url) <= 500),
  -- Arquivo próprio: caminho no bucket "music" (<id do usuário>/<arquivo>).
  add column if not exists music_path text check (music_path is null or char_length(music_path) <= 300),
  add column if not exists music_title text not null default '' check (char_length(music_title) <= 120),
  add column if not exists music_artist text not null default '' check (char_length(music_artist) <= 120),
  -- Segundo da música em que o post começa a tocar.
  add column if not exists music_start real not null default 0 check (music_start between 0 and 3600),
  -- Volumes de 0 (mudo) a 1 (inteiro).
  add column if not exists music_volume real not null default 1 check (music_volume between 0 and 1),
  add column if not exists video_volume real not null default 1 check (video_volume between 0 and 1);

-- Arquivos de música enviados pelas pessoas. Leitura pública, como as fotos;
-- cada um grava e apaga só na própria pasta: music/<id do usuário>/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'music', 'music', true, 20971520,
  array['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/wave']
)
on conflict (id) do nothing;

create policy "Música: enviar na própria pasta"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'music'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not public.is_banned()
  );

create policy "Música: ver a própria pasta"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'music'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Música: apagar da própria pasta"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'music'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Confere a música ao publicar: ou é uma faixa da biblioteca, ou um arquivo
-- da pasta de quem publica. Assim ninguém aponta o post para um endereço qualquer.
create or replace function public.on_post_music()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.music_url := nullif(new.music_url, '');
  new.music_path := nullif(new.music_path, '');
  if new.music_url is null and new.music_path is null then
    new.music_url := null;
    new.music_path := null;
    new.music_title := '';
    new.music_artist := '';
    new.music_start := 0;
    new.music_volume := 1;
    return new;
  end if;
  if new.music_url is not null and new.music_path is not null then
    raise exception 'music_not_allowed';
  end if;
  if new.music_url is not null
     and not exists (select 1 from public.music_tracks t where t.url = new.music_url and t.active) then
    raise exception 'music_not_allowed';
  end if;
  if new.music_path is not null
     and (new.music_path not like new.user_id::text || '/%' or new.music_path like '%..%') then
    raise exception 'music_not_allowed';
  end if;
  return new;
end;
$$;

drop trigger if exists on_post_music on public.posts;
create trigger on_post_music
  before insert on public.posts
  for each row execute function public.on_post_music();

notify pgrst, 'reload schema';
