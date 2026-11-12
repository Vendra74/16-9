-- Links no perfil: site, portfólio, Instagram, Vimeo, YouTube…
-- Até 5 endereços por pessoa, cada um começando com http:// ou https://.
-- Ficam visíveis para quem está logado, como o resto do perfil.

create or replace function public.valid_profile_links(links text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(cardinality(links), 0) <= 5
     and not exists (
       select 1
       from unnest(links) as link
       where char_length(link) > 200
          or link !~ '^https?://[^[:space:]]+\.[^[:space:]]+$'
     );
$$;

alter table public.profiles
  add column if not exists links text[] not null default '{}';

alter table public.profiles
  drop constraint if exists profiles_links_check;

alter table public.profiles
  add constraint profiles_links_check check (public.valid_profile_links(links));
