-- 16:9: publicações de fotos (com ficha técnica e local) e foto de perfil.
-- Rode este arquivo uma vez no SQL Editor do Supabase, depois do primeiro.

-- Foto de perfil
alter table public.profiles add column avatar_url text;

-- Publicações. A imagem fica no Storage (bucket "posts"), sempre já recortada em 16:9.
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  image_path text not null,
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  title text not null default '' check (char_length(title) <= 120),
  location text not null default '' check (char_length(location) <= 120),
  -- Ficha técnica: preenchida a partir dos dados EXIF da foto e ajustável por quem publica.
  camera text not null default '' check (char_length(camera) <= 80),
  lens text not null default '' check (char_length(lens) <= 80),
  focal_length text not null default '' check (char_length(focal_length) <= 20),
  aperture text not null default '' check (char_length(aperture) <= 20),
  shutter text not null default '' check (char_length(shutter) <= 20),
  iso text not null default '' check (char_length(iso) <= 20),
  created_at timestamptz not null default now()
);

create index posts_created_at_idx on public.posts (created_at desc);
create index posts_user_id_idx on public.posts (user_id, created_at desc);

alter table public.posts enable row level security;

create policy "Publicações visíveis para quem está logado"
  on public.posts for select
  to authenticated
  using (true);

create policy "Cada um publica em seu nome"
  on public.posts for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Cada um apaga as próprias publicações"
  on public.posts for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Armazenamento das imagens. Leitura pública (as URLs são longas e aleatórias);
-- cada pessoa só grava e apaga dentro da própria pasta: <bucket>/<id do usuário>/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('posts', 'posts', true, 10485760, array['image/jpeg']),
  ('avatars', 'avatars', true, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

create policy "Upload na própria pasta"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id in ('posts', 'avatars')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Necessária para apagar pela API (o Storage confere o arquivo antes de remover).
create policy "Ver a própria pasta"
  on storage.objects for select
  to authenticated
  using (
    bucket_id in ('posts', 'avatars')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Apagar da própria pasta"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id in ('posts', 'avatars')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
