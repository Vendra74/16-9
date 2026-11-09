-- 16:9: perfis e feedback dos testers.
-- Rode este arquivo uma vez no SQL Editor do Supabase (ou com `supabase db push`).

-- Perfil público de cada pessoa. Criado automaticamente no cadastro.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique
    check (username ~ '^[a-z0-9_.]{3,24}$'),
  display_name text not null default ''
    check (char_length(display_name) <= 60),
  specialty text not null default ''
    check (char_length(specialty) <= 60),
  city text not null default ''
    check (char_length(city) <= 60),
  bio text not null default ''
    check (char_length(bio) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Perfis visíveis para quem está logado"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Cada um edita o próprio perfil"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Cria o perfil a partir dos dados enviados no cadastro (nome e @usuário).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  wanted text := lower(coalesce(new.raw_user_meta_data ->> 'username', ''));
begin
  if wanted !~ '^[a-z0-9_.]{3,24}$'
     or exists (select 1 from public.profiles where username = wanted) then
    -- Sem @ válido (ex.: cadastro pelo painel): gera um provisório.
    wanted := 'user_' || substr(replace(new.id::text, '-', ''), 1, 10);
  end if;

  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    wanted,
    left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 60)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Permite à tela de cadastro checar se um @ está livre antes de criar a conta.
create or replace function public.username_available(name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.profiles where username = lower(name));
$$;

grant execute on function public.username_available(text) to anon, authenticated;

-- Feedback enviado de dentro do app. Só o time lê (pelo painel do Supabase).
create table public.feedback (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  message text not null check (char_length(message) between 1 and 4000),
  app_version text,
  platform text,
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

create policy "Testers enviam o próprio feedback"
  on public.feedback for insert
  to authenticated
  with check ((select auth.uid()) = user_id);
