-- 16:9: segurança e exigências das lojas. Rode uma vez no SQL Editor, depois dos anteriores.
--
-- 1. Post ou comentário com 3 denúncias de pessoas diferentes some para todo mundo
--    (menos para quem publicou) até a equipe revisar. Denúncia de alguém da equipe
--    esconde na hora.
-- 2. Tabela "team": quem é da equipe do 16:9. Recebe aviso a cada denúncia e
--    esconde conteúdo denunciando. Preenchida só pelo painel (veja o fim do arquivo).
--
-- Para mostrar de novo algo escondido: Table Editor → posts (ou comments) → hidden = false.

alter table public.posts add column hidden boolean not null default false;
alter table public.comments add column hidden boolean not null default false;

create table public.team (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Sem políticas: ninguém lê nem grava pelo app, só o painel e as funções do servidor.
alter table public.team enable row level security;

create index reports_post_id_idx on public.reports (post_id) where post_id is not null;
create index reports_comment_id_idx on public.reports (comment_id) where comment_id is not null;

create or replace function public.on_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  threshold constant integer := 3;
  from_team boolean := exists (select 1 from public.team where user_id = new.reporter);
begin
  if new.post_id is not null and (
    from_team
    or (select count(distinct reporter) from public.reports where post_id = new.post_id) >= threshold
  ) then
    update public.posts set hidden = true where id = new.post_id;
  end if;

  if new.comment_id is not null and (
    from_team
    or (select count(distinct reporter) from public.reports where comment_id = new.comment_id) >= threshold
  ) then
    update public.comments set hidden = true where id = new.comment_id;
  end if;

  return new;
end;
$$;

create trigger reports_after_insert
  after insert on public.reports
  for each row execute function public.on_report();

-- O que está escondido só aparece para quem publicou.
drop policy "Publicações prontas, menos de quem você bloqueou" on public.posts;
create policy "Publicações prontas e não escondidas, menos de quem você bloqueou"
  on public.posts for select to authenticated
  using (
    ((status = 'ready' and not hidden) or user_id = (select auth.uid()))
    and not exists (
      select 1 from public.blocks
      where blocker = (select auth.uid()) and blocked = posts.user_id
    )
  );

drop policy "Comentários visíveis, menos de quem você bloqueou" on public.comments;
create policy "Comentários não escondidos, menos de quem você bloqueou"
  on public.comments for select to authenticated
  using (
    (not hidden or user_id = (select auth.uid()))
    and not exists (
      select 1 from public.blocks
      where blocker = (select auth.uid()) and blocked = comments.user_id
    )
  );

notify pgrst, 'reload schema';

-- Depois de rodar o resto, coloque você na equipe (troque pelo e-mail da sua conta no app):
-- insert into public.team (user_id) select id from auth.users where email = 'seu-email@exemplo.com';
