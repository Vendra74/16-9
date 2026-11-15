-- 16:9: painel do administrador dentro do app. Rode uma vez no SQL Editor, depois dos anteriores.
--
-- Quem é administrador: quem está na tabela "team" (criada em 20261112120000_safety).
-- O painel só aparece no Perfil dessas pessoas, e cada função abaixo confere de novo
-- no banco: mesmo que alguém force a tela, sem estar na equipe não vê nada.
--
-- O que entra:
--   1. Denúncias com situação (aberta/resolvida) e decisão da equipe.
--   2. Feedback dos testers com "lido".
--   3. Suspensão de contas: quem é suspenso não publica, não comenta, não manda
--      mensagem, não curte nem segue, e os trabalhos e comentários somem para os outros.
--      Desfazer a suspensão traz tudo de volta.
--   4. Funções do painel: números, denúncias, pessoas, feedback e equipe.

-- ---------- Quem é da equipe ----------

create or replace function public.is_team(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.team where user_id = uid);
$$;

grant execute on function public.is_team(uuid) to authenticated;

-- ---------- Suspensão ----------

alter table public.profiles
  add column if not exists banned_at timestamptz,
  add column if not exists banned_reason text not null default '' check (char_length(banned_reason) <= 500);

-- Ninguém se tira da suspensão editando o próprio perfil: só as funções do painel mudam isso.
create or replace function public.protect_ban_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('app.admin_action', true) is distinct from 'on' then
    new.banned_at := old.banned_at;
    new.banned_reason := old.banned_reason;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_ban on public.profiles;
create trigger profiles_protect_ban
  before update on public.profiles
  for each row execute function public.protect_ban_columns();

create or replace function public.is_banned(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = uid and banned_at is not null);
$$;

grant execute on function public.is_banned(uuid) to authenticated;

-- Regras "restritivas" valem junto com as que já existem (todas precisam passar).
drop policy if exists "Conta suspensa não publica" on public.posts;
create policy "Conta suspensa não publica"
  on public.posts as restrictive for insert to authenticated
  with check (not public.is_banned());

drop policy if exists "Conta suspensa não comenta" on public.comments;
create policy "Conta suspensa não comenta"
  on public.comments as restrictive for insert to authenticated
  with check (not public.is_banned());

drop policy if exists "Conta suspensa não manda mensagem" on public.messages;
create policy "Conta suspensa não manda mensagem"
  on public.messages as restrictive for insert to authenticated
  with check (not public.is_banned());

drop policy if exists "Conta suspensa não curte" on public.likes;
create policy "Conta suspensa não curte"
  on public.likes as restrictive for insert to authenticated
  with check (not public.is_banned());

drop policy if exists "Conta suspensa não curte comentário" on public.comment_likes;
create policy "Conta suspensa não curte comentário"
  on public.comment_likes as restrictive for insert to authenticated
  with check (not public.is_banned());

drop policy if exists "Conta suspensa não segue" on public.follows;
create policy "Conta suspensa não segue"
  on public.follows as restrictive for insert to authenticated
  with check (not public.is_banned());

-- Trabalhos e comentários de conta suspensa somem para os outros (quem publicou ainda vê).
drop policy if exists "Trabalhos de conta suspensa somem" on public.posts;
create policy "Trabalhos de conta suspensa somem"
  on public.posts as restrictive for select to authenticated
  using (user_id = (select auth.uid()) or not public.is_banned(user_id));

drop policy if exists "Comentários de conta suspensa somem" on public.comments;
create policy "Comentários de conta suspensa somem"
  on public.comments as restrictive for select to authenticated
  using (user_id = (select auth.uid()) or not public.is_banned(user_id));

-- ---------- Denúncias e feedback: situação ----------

alter table public.reports
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid references public.profiles (id) on delete set null,
  add column if not exists resolution text check (resolution in ('kept', 'removed', 'banned'));

create index if not exists reports_open_idx on public.reports (created_at desc) where resolved_at is null;

alter table public.feedback add column if not exists read_at timestamptz;

-- ---------- Funções do painel ----------

create or replace function public.require_team()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_team(auth.uid()) then raise exception 'not_team'; end if;
end;
$$;

-- Números gerais.
create or replace function public.admin_stats()
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_team();
  return json_build_object(
    'users', (select count(*) from public.profiles),
    'users_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'posts', (select count(*) from public.posts),
    'posts_7d', (select count(*) from public.posts where created_at > now() - interval '7 days'),
    'videos', (select count(*) from public.posts where kind = 'video'),
    'comments', (select count(*) from public.comments),
    'messages_7d', (select count(*) from public.messages where created_at > now() - interval '7 days'),
    'active_7d', (
      select count(distinct uid) from (
        select user_id as uid from public.posts where created_at > now() - interval '7 days'
        union select user_id from public.comments where created_at > now() - interval '7 days'
        union select user_id from public.likes where created_at > now() - interval '7 days'
        union select sender_id from public.messages where created_at > now() - interval '7 days'
      ) a
    ),
    'open_reports', (select count(*) from public.reports where resolved_at is null),
    'hidden', (select count(*) from public.posts where hidden) + (select count(*) from public.comments where hidden),
    'unread_feedback', (select count(*) from public.feedback where read_at is null),
    'banned', (select count(*) from public.profiles where banned_at is not null),
    'team', (select count(*) from public.team)
  );
end;
$$;

-- Denúncias, das mais novas para as mais antigas, com o conteúdo denunciado.
create or replace function public.admin_reports(only_open boolean default true, max_rows integer default 100)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_team();
  return coalesce((
    select json_agg(r order by r.created_at desc)
    from (
      select
        rp.id, rp.reason, rp.created_at, rp.resolved_at, rp.resolution,
        json_build_object('id', a.id, 'username', a.username, 'display_name', a.display_name, 'avatar_url', a.avatar_url) as reporter,
        case when u.id is null then null else json_build_object(
          'id', u.id, 'username', u.username, 'display_name', u.display_name, 'avatar_url', u.avatar_url,
          'banned', u.banned_at is not null,
          'reports', (select count(*) from public.reports x where x.reported_user = u.id)
        ) end as reported_user,
        case when p.id is null then null else json_build_object(
          'id', p.id, 'title', p.title, 'image_path', p.image_path, 'kind', p.kind, 'hidden', p.hidden, 'user_id', p.user_id
        ) end as post,
        case when c.id is null then null else json_build_object(
          'id', c.id, 'body', c.body, 'hidden', c.hidden, 'user_id', c.user_id
        ) end as comment,
        -- Só a mensagem denunciada, nunca o resto da conversa.
        case when m.id is null then null else json_build_object(
          'id', m.id, 'body', m.body, 'kind', m.kind, 'sender_id', m.sender_id
        ) end as message,
        (select count(distinct x.reporter) from public.reports x
          where (rp.post_id is not null and x.post_id = rp.post_id)
             or (rp.comment_id is not null and x.comment_id = rp.comment_id)
             or (rp.post_id is null and rp.comment_id is null and rp.message_id is not null and x.message_id = rp.message_id)
        ) as same_target
      from public.reports rp
      left join public.profiles a on a.id = rp.reporter
      left join public.profiles u on u.id = rp.reported_user
      left join public.posts p on p.id = rp.post_id
      left join public.comments c on c.id = rp.comment_id
      left join public.messages m on m.id = rp.message_id
      where (not only_open or rp.resolved_at is null)
      order by rp.created_at desc
      limit least(greatest(max_rows, 1), 500)
    ) r
  ), '[]'::json);
end;
$$;

-- Decide uma denúncia. Vale para todas as denúncias abertas do mesmo conteúdo.
--   'kept'    → o conteúdo fica (e volta a aparecer, se tinha sido escondido).
--   'removed' → o conteúdo some para todos (quem publicou ainda vê, como hoje).
--   'banned'  → some e a conta de quem publicou é suspensa.
create or replace function public.admin_resolve_report(report_id bigint, decision text, ban_reason text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  rp public.reports;
  owner uuid;
begin
  perform public.require_team();
  if decision not in ('kept', 'removed', 'banned') then raise exception 'invalid_decision'; end if;
  select * into rp from public.reports where id = report_id;
  if not found then raise exception 'not_found'; end if;

  if rp.post_id is not null then
    update public.posts set hidden = (decision <> 'kept') where id = rp.post_id returning user_id into owner;
  elsif rp.comment_id is not null then
    update public.comments set hidden = (decision <> 'kept') where id = rp.comment_id returning user_id into owner;
  end if;
  owner := coalesce(owner, rp.reported_user);

  if decision = 'banned' then
    if owner is null then raise exception 'no_user'; end if;
    perform public.admin_ban(owner, ban_reason);
  end if;

  update public.reports
  set resolved_at = now(), resolved_by = auth.uid(), resolution = decision
  where resolved_at is null and (
    id = rp.id
    or (rp.post_id is not null and post_id = rp.post_id)
    or (rp.comment_id is not null and comment_id = rp.comment_id)
    or (rp.post_id is null and rp.comment_id is null and rp.message_id is not null and message_id = rp.message_id)
  );
end;
$$;

-- Esconde ou mostra um trabalho ou comentário direto (sem denúncia).
create or replace function public.admin_set_hidden(target text, target_id uuid, value boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_team();
  if target = 'post' then
    update public.posts set hidden = value where id = target_id;
  elsif target = 'comment' then
    update public.comments set hidden = value where id = target_id;
  else
    raise exception 'invalid_target';
  end if;
end;
$$;

-- Pessoas: busca por @, nome ou e-mail. Sem busca, as mais recentes.
create or replace function public.admin_users(query text default '', max_rows integer default 50)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  q text := lower(trim(coalesce(query, '')));
begin
  perform public.require_team();
  return coalesce((
    select json_agg(r order by r.created_at desc)
    from (
      select
        p.id, p.username, p.display_name, p.avatar_url, p.specialty, p.city, p.created_at,
        p.banned_at, p.banned_reason,
        u.email::text as email,
        u.last_sign_in_at,
        exists (select 1 from public.team t where t.user_id = p.id) as is_team,
        (select count(*) from public.posts x where x.user_id = p.id) as posts,
        (select count(*) from public.reports x where x.reported_user = p.id) as reports
      from public.profiles p
      left join auth.users u on u.id = p.id
      where q = ''
         or p.username ilike '%' || q || '%'
         or p.display_name ilike '%' || q || '%'
         or u.email ilike '%' || q || '%'
      order by p.created_at desc
      limit least(greatest(max_rows, 1), 200)
    ) r
  ), '[]'::json);
end;
$$;

create or replace function public.admin_ban(target uuid, reason text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_team();
  if target = auth.uid() then raise exception 'cannot_ban_self'; end if;
  if public.is_team(target) then raise exception 'cannot_ban_team'; end if;
  perform set_config('app.admin_action', 'on', true);
  update public.profiles
  set banned_at = coalesce(banned_at, now()), banned_reason = left(coalesce(reason, ''), 500)
  where id = target;
  perform set_config('app.admin_action', 'off', true);
end;
$$;

create or replace function public.admin_unban(target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_team();
  perform set_config('app.admin_action', 'on', true);
  update public.profiles set banned_at = null, banned_reason = '' where id = target;
  perform set_config('app.admin_action', 'off', true);
end;
$$;

-- Coloca ou tira alguém da equipe. Ninguém tira a si mesmo (para nunca ficar sem administrador).
create or replace function public.admin_set_team(target uuid, value boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_team();
  if value then
    if public.is_banned(target) then raise exception 'banned'; end if;
    insert into public.team (user_id) values (target) on conflict do nothing;
  else
    if target = auth.uid() then raise exception 'cannot_remove_self'; end if;
    delete from public.team where user_id = target;
  end if;
end;
$$;

-- Feedback dos testers, dos mais novos para os mais antigos.
create or replace function public.admin_feedback(max_rows integer default 100)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_team();
  return coalesce((
    select json_agg(r order by r.created_at desc)
    from (
      select
        f.id, f.message, f.app_version, f.platform, f.created_at, f.read_at,
        json_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name, 'avatar_url', p.avatar_url) as author
      from public.feedback f
      left join public.profiles p on p.id = f.user_id
      order by f.created_at desc
      limit least(greatest(max_rows, 1), 500)
    ) r
  ), '[]'::json);
end;
$$;

create or replace function public.admin_mark_feedback(feedback_id bigint, value boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_team();
  update public.feedback set read_at = case when value then now() else null end where id = feedback_id;
end;
$$;

-- Só quem está logado chama; cada função confere a equipe por dentro.
revoke execute on function
  public.require_team(),
  public.admin_stats(),
  public.admin_reports(boolean, integer),
  public.admin_resolve_report(bigint, text, text),
  public.admin_set_hidden(text, uuid, boolean),
  public.admin_users(text, integer),
  public.admin_ban(uuid, text),
  public.admin_unban(uuid),
  public.admin_set_team(uuid, boolean),
  public.admin_feedback(integer),
  public.admin_mark_feedback(bigint, boolean)
from public, anon;

grant execute on function
  public.admin_stats(),
  public.admin_reports(boolean, integer),
  public.admin_resolve_report(bigint, text, text),
  public.admin_set_hidden(text, uuid, boolean),
  public.admin_users(text, integer),
  public.admin_ban(uuid, text),
  public.admin_unban(uuid),
  public.admin_set_team(uuid, boolean),
  public.admin_feedback(integer),
  public.admin_mark_feedback(bigint, boolean)
to authenticated;

notify pgrst, 'reload schema';

-- Se você ainda não está na equipe, rode também (troque pelo e-mail da sua conta no app):
-- insert into public.team (user_id) select id from auth.users where email = 'seu-email@exemplo.com';
