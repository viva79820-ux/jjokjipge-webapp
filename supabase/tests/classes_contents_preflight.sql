-- classes·contents가 아직 없는 DB에서 전체 실행한다.
-- 마지막 SQLSTATE P0001과 CLASSES_CONTENTS_PREFLIGHT_OK 예외만 성공이다.
-- 성공 예외 DETAIL의 baseline JSON을 별도로 보관한 뒤 롤백 확인 SQL에 입력한다.
-- 실제 계정·profile·기존 업무 행을 변경하지 않으며 성공 예외로 전체 롤백한다.
rollback;
begin;

do $prerequisite$
declare
  missing text[] := '{}';
  table_name text;
begin
  if to_regclass('public.classes') is not null then
    raise exception using
      errcode = 'P0001',
      message = 'CLASSES_CONTENTS_PREFLIGHT_ALREADY_APPLIED: public.classes';
  end if;
  if to_regclass('public.contents') is not null then
    raise exception using
      errcode = 'P0001',
      message = 'CLASSES_CONTENTS_PREFLIGHT_ALREADY_APPLIED: public.contents';
  end if;

  foreach table_name in array array[
    'profiles',
    'stores',
    'counselors',
    'consult_products',
    'reservations',
    'faqs',
    'inquiries',
    'notices'
  ]
  loop
    if to_regclass('public.' || table_name) is null then
      missing := array_append(missing, 'public.' || table_name);
    end if;
  end loop;

  if to_regprocedure('private.is_admin()') is null then
    missing := array_append(missing, 'private.is_admin()');
  end if;
  if to_regprocedure('private.set_updated_at()') is null then
    missing := array_append(missing, 'private.set_updated_at()');
  end if;
  if to_regrole('anon') is null then
    missing := array_append(missing, 'anon');
  end if;
  if to_regrole('authenticated') is null then
    missing := array_append(missing, 'authenticated');
  end if;
  if to_regrole('service_role') is null then
    missing := array_append(missing, 'service_role');
  end if;

  if cardinality(missing) > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'CLASSES_CONTENTS_PREFLIGHT_PREREQUISITE_FAILED: ' || array_to_string(missing, ', ');
  end if;

  if not (
    select bool_and(relrowsecurity)
    from pg_class
    where oid = any (array[
      'public.profiles'::regclass,
      'public.stores'::regclass,
      'public.counselors'::regclass,
      'public.consult_products'::regclass,
      'public.reservations'::regclass,
      'public.faqs'::regclass,
      'public.inquiries'::regclass,
      'public.notices'::regclass
    ])
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'CLASSES_CONTENTS_PREFLIGHT_PREREQUISITE_FAILED: 기존 업무 테이블 RLS 비활성';
  end if;

  if not exists (select 1 from public.profiles where role = 'admin') then
    raise exception using
      errcode = 'P0001',
      message = 'CLASSES_CONTENTS_PREFLIGHT_PREREQUISITE_FAILED: 기존 관리자 profile 필요';
  end if;
end;
$prerequisite$;

-- BEGIN EXACT SNAPSHOT
create or replace function pg_temp.classes_contents_snapshot()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $snapshot$
declare
  state jsonb := '{}'::jsonb;
  table_name text;
  component jsonb;
  catalog_state jsonb;
  empty_literal text := quote_literal('');
begin
  foreach table_name in array array[
    'profiles',
    'stores',
    'counselors',
    'consult_products',
    'reservations',
    'faqs',
    'inquiries',
    'notices'
  ]
  loop
    execute
      'select jsonb_build_object('
      || quote_literal('count') || ', count(*), '
      || quote_literal('hash') || ', md5(coalesce(string_agg(md5(to_jsonb(t)::text), '
      || empty_literal || ' order by t.id::text), ' || empty_literal || '))) '
      || 'from public.' || quote_ident(table_name) || ' t'
    into component;
    state := state || jsonb_build_object(table_name || '_rows', component);

    execute
      'select jsonb_build_object('
      || quote_literal('table') || ', ('
      || 'select to_jsonb(s) from (select c.relkind, c.relrowsecurity, c.relforcerowsecurity, c.relowner '
      || 'from pg_class c where c.oid = ' || quote_literal('public.' || table_name) || '::regclass) s), '
      || quote_literal('columns') || ', ('
      || 'select coalesce(jsonb_agg(to_jsonb(s) order by s.attnum), ' || quote_literal('[]') || '::jsonb) from ('
      || 'select a.attnum, a.attname, format_type(a.atttypid, a.atttypmod) as data_type, '
      || 'a.attnotnull, a.attidentity, a.attgenerated, a.attcollation, '
      || 'pg_get_expr(d.adbin, d.adrelid) as default_expression '
      || 'from pg_attribute a left join pg_attrdef d '
      || 'on d.adrelid = a.attrelid and d.adnum = a.attnum '
      || 'where a.attrelid = ' || quote_literal('public.' || table_name) || '::regclass '
      || 'and a.attnum > 0 and not a.attisdropped) s), '
      || quote_literal('constraints') || ', ('
      || 'select coalesce(jsonb_agg(to_jsonb(s) order by s.conname), ' || quote_literal('[]') || '::jsonb) from ('
      || 'select c.conname, c.contype, c.condeferrable, c.condeferred, c.convalidated, '
      || 'pg_get_constraintdef(c.oid, true) as definition '
      || 'from pg_constraint c where c.conrelid = '
      || quote_literal('public.' || table_name) || '::regclass) s), '
      || quote_literal('indexes') || ', ('
      || 'select coalesce(jsonb_agg(to_jsonb(s) order by s.indexname), ' || quote_literal('[]') || '::jsonb) from ('
      || 'select i.indexname, i.indexdef from pg_indexes i '
      || 'where i.schemaname = ' || quote_literal('public')
      || ' and i.tablename = ' || quote_literal(table_name) || ') s), '
      || quote_literal('policies') || ', ('
      || 'select coalesce(jsonb_agg(to_jsonb(s) order by s.policyname), ' || quote_literal('[]') || '::jsonb) from ('
      || 'select p.policyname, p.permissive, p.roles, p.cmd, p.qual, p.with_check '
      || 'from pg_policies p where p.schemaname = ' || quote_literal('public')
      || ' and p.tablename = ' || quote_literal(table_name) || ') s), '
      || quote_literal('table_grants') || ', ('
      || 'select coalesce(jsonb_agg(to_jsonb(s) order by s.grantee::text, s.grantor::text, s.privilege_type), '
      || quote_literal('[]') || '::jsonb) from ('
      || 'select x.grantor, x.grantee, x.privilege_type, x.is_grantable '
      || 'from pg_class c cross join lateral aclexplode(c.relacl) x '
      || 'where c.oid = ' || quote_literal('public.' || table_name) || '::regclass) s), '
      || quote_literal('column_grants') || ', ('
      || 'select coalesce(jsonb_agg(to_jsonb(s) order by s.attnum, s.grantee::text, s.grantor::text, s.privilege_type), '
      || quote_literal('[]') || '::jsonb) from ('
      || 'select a.attnum, a.attname, x.grantor, x.grantee, x.privilege_type, x.is_grantable '
      || 'from pg_attribute a cross join lateral aclexplode(a.attacl) x '
      || 'where a.attrelid = ' || quote_literal('public.' || table_name) || '::regclass '
      || 'and a.attnum > 0 and not a.attisdropped) s), '
      || quote_literal('triggers') || ', ('
      || 'select coalesce(jsonb_agg(to_jsonb(s) order by s.tgname), ' || quote_literal('[]') || '::jsonb) from ('
      || 'select t.tgname, t.tgenabled, pg_get_triggerdef(t.oid, true) as definition '
      || 'from pg_trigger t where not t.tgisinternal and t.tgrelid = '
      || quote_literal('public.' || table_name) || '::regclass) s))'
    into catalog_state;
    state := state || jsonb_build_object(
      table_name || '_catalog',
      jsonb_build_object('count', 7, 'hash', md5(catalog_state::text))
    );
  end loop;

  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(
      md5(pg_get_functiondef(p.oid) || coalesce(p.proacl::text, '')),
      '' order by p.proname, pg_get_function_identity_arguments(p.oid)
    ), ''))
  )
  into component
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private';
  state := state || jsonb_build_object('private_functions', component);

  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(
      md5(to_jsonb(s)::text),
      '' order by s.defaclrole::text, s.defaclnamespace::text, s.defaclobjtype
    ), ''))
  )
  into component
  from (
    select d.defaclrole, d.defaclnamespace, d.defaclobjtype, d.defaclacl
    from pg_default_acl d
  ) s;
  state := state || jsonb_build_object('default_privileges', component);

  return state;
end;
$snapshot$;
-- END EXACT SNAPSHOT

create temporary table classes_contents_test_ids (
  kind text primary key,
  id uuid unique not null
);
insert into classes_contents_test_ids (kind, id) values
  ('class_private', 'ffffffff-ffff-4fff-8fff-ffffffffc001'),
  ('class_public', 'ffffffff-ffff-4fff-8fff-ffffffffc002'),
  ('class_admin', 'ffffffff-ffff-4fff-8fff-ffffffffc003'),
  ('content_private', 'ffffffff-ffff-4fff-8fff-ffffffffd001'),
  ('content_public', 'ffffffff-ffff-4fff-8fff-ffffffffd002'),
  ('content_admin', 'ffffffff-ffff-4fff-8fff-ffffffffd003');

create temporary table classes_contents_actors (
  kind text primary key,
  id uuid not null,
  mode text not null
);
insert into classes_contents_actors (kind, id, mode)
select 'admin', id, 'admin_profile'
from public.profiles
where role = 'admin'
order by id
limit 1;

with existing_user as (
  select id
  from public.profiles
  where role = 'user'
  order by id
  limit 1
),
fallback_candidates as (
  select gen_random_uuid() as id
  from generate_series(1, 16)
),
fallback as (
  select c.id
  from fallback_candidates c
  where not exists (select 1 from public.profiles p where p.id = c.id)
  order by c.id
  limit 1
)
insert into classes_contents_actors (kind, id, mode)
select
  'non_admin',
  coalesce((select id from existing_user), (select id from fallback)),
  case
    when exists (select 1 from existing_user) then 'existing_user'
    else 'profileless'
  end;

do $actor_check$
begin
  if (select count(*) from classes_contents_actors) <> 2
    or (
      select id from classes_contents_actors where kind = 'non_admin'
    ) = (
      select id from classes_contents_actors where kind = 'admin'
    )
    or exists (
      select 1
      from public.profiles p
      join classes_contents_actors a on a.id = p.id
      where a.kind = 'non_admin'
        and p.role = 'admin'
    )
  then
    raise exception using
      errcode = 'P0001',
      message = 'CLASSES_CONTENTS_PREFLIGHT_PREREQUISITE_FAILED: 검사 역할 선택 실패';
  end if;
end;
$actor_check$;

create temporary table classes_contents_baseline as
select jsonb_build_object(
  'format', 'classes-contents-preflight-v1',
  'eligible', true,
  'state', pg_temp.classes_contents_snapshot(),
  'test_ids', (
    select jsonb_agg(id::text order by id::text)
    from classes_contents_test_ids
  ),
  'non_admin_mode', (
    select mode
    from classes_contents_actors
    where kind = 'non_admin'
  )
) as snapshot;

create temporary table classes_contents_results (
  label text not null
);
grant select on classes_contents_test_ids, classes_contents_actors to anon, authenticated;
grant insert on classes_contents_results to anon, authenticated;

create function pg_temp.classes_contents_assert(ok boolean, label text)
returns void
language plpgsql
security invoker
as $$
begin
  if ok is distinct from true then
    raise exception 'CLASSES_CONTENTS_ASSERT_FAILED: %', label;
  end if;
  insert into pg_temp.classes_contents_results values (label);
end;
$$;

create function pg_temp.classes_contents_expected_error(
  command text,
  expected_state text,
  label text
)
returns void
language plpgsql
security invoker
as $$
begin
  begin
    execute command;
  exception when others then
    if sqlstate <> expected_state then
      raise;
    end if;
    insert into pg_temp.classes_contents_results values (label);
    return;
  end;
  raise exception 'CLASSES_CONTENTS_EXPECTED_ERROR_MISSING: %', label;
end;
$$;

create function pg_temp.classes_contents_no_rows(command text, label text)
returns void
language plpgsql
security invoker
as $$
declare
  affected bigint;
begin
  execute command;
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'CLASSES_CONTENTS_UNEXPECTED_ROWS: %', label;
  end if;
  insert into pg_temp.classes_contents_results values (label);
end;
$$;

grant execute on function pg_temp.classes_contents_assert(boolean, text)
to anon, authenticated;
grant execute on function pg_temp.classes_contents_expected_error(text, text, text)
to anon, authenticated;
grant execute on function pg_temp.classes_contents_no_rows(text, text)
to anon, authenticated;

-- BEGIN EXACT MIGRATION
-- 외부 링크로 열람하는 클래스와 콘텐츠의 DB 기반만 만든다. 실제 강의·채널 자료는 넣지 않는다.
do $prerequisite$
declare
  missing text[] := '{}';
begin
  if to_regclass('public.classes') is not null then
    raise exception using
      errcode = 'P0001',
      message = 'CLASSES_CONTENTS_SCHEMA_ALREADY_EXISTS: public.classes';
  end if;
  if to_regclass('public.contents') is not null then
    raise exception using
      errcode = 'P0001',
      message = 'CLASSES_CONTENTS_SCHEMA_ALREADY_EXISTS: public.contents';
  end if;
  if to_regprocedure('private.is_admin()') is null then
    missing := array_append(missing, 'private.is_admin()');
  end if;
  if to_regprocedure('private.set_updated_at()') is null then
    missing := array_append(missing, 'private.set_updated_at()');
  end if;
  if to_regrole('anon') is null then
    missing := array_append(missing, 'anon');
  end if;
  if to_regrole('authenticated') is null then
    missing := array_append(missing, 'authenticated');
  end if;
  if to_regrole('service_role') is null then
    missing := array_append(missing, 'service_role');
  end if;

  if cardinality(missing) > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'CLASSES_CONTENTS_SCHEMA_PREREQUISITE_FAILED: ' || array_to_string(missing, ', ');
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname = 'is_admin'
      and pg_get_function_identity_arguments(p.oid) = ''
      and pg_get_function_result(p.oid) = 'boolean'
      and p.prosecdef
      and p.provolatile = 's'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'CLASSES_CONTENTS_SCHEMA_PREREQUISITE_FAILED: private.is_admin() 정의가 예상과 다릅니다.';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname = 'set_updated_at'
      and pg_get_function_identity_arguments(p.oid) = ''
      and pg_get_function_result(p.oid) = 'trigger'
      and not p.prosecdef
      and p.provolatile = 'v'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'CLASSES_CONTENTS_SCHEMA_PREREQUISITE_FAILED: private.set_updated_at() 정의가 예상과 다릅니다.';
  end if;
end;
$prerequisite$;

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  title text not null constraint classes_title_check
    check (title ~ '[^[:space:]]' and char_length(title) <= 100),
  description text not null constraint classes_description_check
    check (description ~ '[^[:space:]]' and char_length(description) <= 5000),
  field text not null constraint classes_field_check
    check (field in ('saju', 'tarot')),
  video_url text constraint classes_video_url_check
    check (
      video_url is null
      or (
        char_length(video_url) <= 2048
        and video_url ~ '^https://(\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?)(:[0-9]{1,5})?([/?#][^[:space:][:cntrl:]]*)?$'
      )
    ),
  is_published boolean not null default false,
  sort_order integer not null default 0 constraint classes_sort_order_check
    check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint classes_published_video_url_check
    check (not is_published or video_url is not null)
);

create table public.contents (
  id uuid primary key default gen_random_uuid(),
  title text not null constraint contents_title_check
    check (title ~ '[^[:space:]]' and char_length(title) <= 100),
  description text constraint contents_description_check
    check (
      description is null
      or (
        description ~ '[^[:space:]]'
        and char_length(description) <= 1000
      )
    ),
  channel text not null constraint contents_channel_check
    check (channel in ('blog', 'instagram', 'youtube')),
  external_url text constraint contents_external_url_check
    check (
      external_url is null
      or (
        char_length(external_url) <= 2048
        and external_url ~ '^https://(\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?)(:[0-9]{1,5})?([/?#][^[:space:][:cntrl:]]*)?$'
      )
    ),
  is_published boolean not null default false,
  sort_order integer not null default 0 constraint contents_sort_order_check
    check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contents_published_external_url_check
    check (not is_published or external_url is not null)
);

alter table public.classes enable row level security;
alter table public.contents enable row level security;

create index classes_published_sort_idx
on public.classes (is_published, sort_order, created_at desc, id desc);
create index contents_published_sort_idx
on public.contents (is_published, sort_order, created_at desc, id desc);

create trigger classes_set_updated_at
before update on public.classes
for each row execute function private.set_updated_at();
create trigger contents_set_updated_at
before update on public.contents
for each row execute function private.set_updated_at();

create policy classes_select_published_or_admin on public.classes
for select to anon, authenticated
using (is_published or (select private.is_admin()));
create policy classes_insert_admin on public.classes
for insert to authenticated
with check ((select private.is_admin()));
create policy classes_update_admin on public.classes
for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));
create policy classes_delete_admin on public.classes
for delete to authenticated
using ((select private.is_admin()));

create policy contents_select_published_or_admin on public.contents
for select to anon, authenticated
using (is_published or (select private.is_admin()));
create policy contents_insert_admin on public.contents
for insert to authenticated
with check ((select private.is_admin()));
create policy contents_update_admin on public.contents
for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));
create policy contents_delete_admin on public.contents
for delete to authenticated
using ((select private.is_admin()));

revoke all on public.classes, public.contents
from public, anon, authenticated, service_role;
grant select on public.classes, public.contents to anon, authenticated;
grant insert, update, delete on public.classes, public.contents to authenticated;
-- END EXACT MIGRATION

-- 제약과 기본값은 실제 INSERT/UPDATE로 확인한다.
insert into public.classes (
  id,
  title,
  description,
  field,
  updated_at
)
values (
  (select id from classes_contents_test_ids where kind = 'class_private'),
  '테스트 비공개 강의',
  '테스트 설명',
  'saju',
  '2000-01-01'
);
select pg_temp.classes_contents_assert(
  (
    select
      video_url is null
      and not is_published
      and sort_order = 0
      and created_at = now()
      and updated_at = '2000-01-01'::timestamptz
    from public.classes
    where id = (select id from classes_contents_test_ids where kind = 'class_private')
  ),
  '강의 기본값과 비공개 영상 NULL'
);

insert into public.contents (
  id,
  title,
  channel,
  updated_at
)
values (
  (select id from classes_contents_test_ids where kind = 'content_private'),
  '테스트 비공개 콘텐츠',
  'blog',
  '2000-01-01'
);
select pg_temp.classes_contents_assert(
  (
    select
      description is null
      and external_url is null
      and not is_published
      and sort_order = 0
      and created_at = now()
      and updated_at = '2000-01-01'::timestamptz
    from public.contents
    where id = (select id from classes_contents_test_ids where kind = 'content_private')
  ),
  '콘텐츠 기본값과 선택 설명·비공개 링크 NULL'
);

select pg_temp.classes_contents_expected_error(
  $$insert into public.classes (title, description, field, is_published)
    values ('테스트', '설명', 'saju', true)$$,
  '23514',
  '공개 강의 영상 링크 필수'
);
select pg_temp.classes_contents_expected_error(
  $$insert into public.contents (title, channel, is_published)
    values ('테스트', 'youtube', true)$$,
  '23514',
  '공개 콘텐츠 외부 링크 필수'
);

insert into public.classes (
  id,
  title,
  description,
  field,
  video_url,
  is_published,
  sort_order
)
values (
  (select id from classes_contents_test_ids where kind = 'class_public'),
  repeat('가', 100),
  repeat('나', 5000),
  'tarot',
  'https://www.youtube.com/watch?v=test-1_2&email=a@example.invalid',
  true,
  1
);
insert into public.contents (
  id,
  title,
  description,
  channel,
  external_url,
  is_published,
  sort_order
)
values (
  (select id from classes_contents_test_ids where kind = 'content_public'),
  repeat('다', 100),
  repeat('라', 1000),
  'youtube',
  'https://youtu.be/test-1_2?t=30',
  true,
  1
);
select pg_temp.classes_contents_assert(
  (
    select count(*) = 1
    from public.classes
    where is_published and video_url is not null
  )
  and (
    select count(*) = 1
    from public.contents
    where is_published and external_url is not null
  ),
  '유효한 HTTPS 쿼리 주소와 길이 경계 공개 저장'
);

do $constraint_matrix$
declare
  test_case record;
  invalid_url text;
begin
  for test_case in
    select *
    from (
      values
        ($$insert into public.classes (id, title, description, field) values (null, '제목', '설명', 'saju')$$, '23502'),
        ($$insert into public.classes (title, description, field) values (null, '설명', 'saju')$$, '23502'),
        ($$insert into public.classes (title, description, field) values ('제목', null, 'saju')$$, '23502'),
        ($$insert into public.classes (title, description, field) values ('제목', '설명', null)$$, '23502'),
        ($$insert into public.classes (title, description, field, is_published) values ('제목', '설명', 'saju', null)$$, '23502'),
        ($$insert into public.classes (title, description, field, sort_order) values ('제목', '설명', 'saju', null)$$, '23502'),
        ($$insert into public.classes (title, description, field, created_at) values ('제목', '설명', 'saju', null)$$, '23502'),
        ($$insert into public.classes (title, description, field, updated_at) values ('제목', '설명', 'saju', null)$$, '23502'),
        ($$insert into public.classes (title, description, field) values (E' \t\n', '설명', 'saju')$$, '23514'),
        ($$insert into public.classes (title, description, field) values ('제목', E' \t\n', 'saju')$$, '23514'),
        ($$insert into public.classes (title, description, field) values (repeat('가', 101), '설명', 'saju')$$, '23514'),
        ($$insert into public.classes (title, description, field) values ('제목', repeat('가', 5001), 'saju')$$, '23514'),
        ($$insert into public.classes (title, description, field) values ('제목', '설명', 'other')$$, '23514'),
        ($$insert into public.classes (title, description, field, sort_order) values ('제목', '설명', 'saju', -1)$$, '23514'),
        ($$insert into public.contents (id, title, channel) values (null, '제목', 'blog')$$, '23502'),
        ($$insert into public.contents (title, channel) values (null, 'blog')$$, '23502'),
        ($$insert into public.contents (title, channel) values ('제목', null)$$, '23502'),
        ($$insert into public.contents (title, channel, is_published) values ('제목', 'blog', null)$$, '23502'),
        ($$insert into public.contents (title, channel, sort_order) values ('제목', 'blog', null)$$, '23502'),
        ($$insert into public.contents (title, channel, created_at) values ('제목', 'blog', null)$$, '23502'),
        ($$insert into public.contents (title, channel, updated_at) values ('제목', 'blog', null)$$, '23502'),
        ($$insert into public.contents (title, channel) values (E' \t\n', 'blog')$$, '23514'),
        ($$insert into public.contents (title, description, channel) values ('제목', E' \t\n', 'blog')$$, '23514'),
        ($$insert into public.contents (title, channel) values (repeat('가', 101), 'blog')$$, '23514'),
        ($$insert into public.contents (title, description, channel) values ('제목', repeat('가', 1001), 'blog')$$, '23514'),
        ($$insert into public.contents (title, channel) values ('제목', 'other')$$, '23514'),
        ($$insert into public.contents (title, channel, sort_order) values ('제목', 'blog', -1)$$, '23514')
    ) as cases(command, expected_state)
  loop
    perform pg_temp.classes_contents_expected_error(
      test_case.command,
      test_case.expected_state,
      '필수값·공백·길이·분류·정렬 제약: ' || left(test_case.command, 70)
    );
  end loop;

  foreach invalid_url in array array[
    '',
    'javascript:alert(1)',
    'data:text/plain,test',
    '/relative/path',
    'http://example.invalid/video',
    'https://',
    'https:///video',
    'https://user@example.invalid/video',
    'https://user:password@example.invalid/video',
    'https://example.invalid/video path',
    E'https://example.invalid/video\nnext',
    'https://example.invalid/' || repeat('a', 2025)
  ]
  loop
    perform pg_temp.classes_contents_expected_error(
      format(
        'insert into public.classes (title, description, field, video_url) values (%L, %L, %L, %L)',
        '테스트',
        '설명',
        'saju',
        invalid_url
      ),
      '23514',
      '강의 URL 거부: ' || left(invalid_url, 40)
    );
    perform pg_temp.classes_contents_expected_error(
      format(
        'insert into public.contents (title, channel, external_url) values (%L, %L, %L)',
        '테스트',
        'blog',
        invalid_url
      ),
      '23514',
      '콘텐츠 URL 거부: ' || left(invalid_url, 40)
    );
  end loop;
end;
$constraint_matrix$;

insert into public.classes (title, description, field, video_url)
values (
  '최대 URL 테스트',
  '설명',
  'saju',
  'https://example.invalid/' || repeat(
    'a',
    2048 - char_length('https://example.invalid/')
  )
);
insert into public.contents (title, channel, external_url)
values (
  '최대 URL 테스트',
  'instagram',
  'https://example.invalid/' || repeat(
    'a',
    2048 - char_length('https://example.invalid/')
  )
);
select pg_temp.classes_contents_assert(
  exists (
    select 1
    from public.classes
    where char_length(video_url) = 2048
  )
  and exists (
    select 1
    from public.contents
    where char_length(external_url) = 2048
  ),
  'URL 2048자 경계 허용'
);

update public.classes
set title = title
where id = (select id from classes_contents_test_ids where kind = 'class_private');
update public.contents
set title = title
where id = (select id from classes_contents_test_ids where kind = 'content_private');
select pg_temp.classes_contents_assert(
  (
    select updated_at = now()
    from public.classes
    where id = (select id from classes_contents_test_ids where kind = 'class_private')
  )
  and (
    select updated_at = now()
    from public.contents
    where id = (select id from classes_contents_test_ids where kind = 'content_private')
  ),
  '기존 updated_at 트리거 함수 재사용'
);

do $catalog_check$
declare
  actor text;
  privilege text;
  table_name text;
begin
  foreach table_name in array array['classes', 'contents']
  loop
    perform pg_temp.classes_contents_assert(
      (
        select relrowsecurity
        from pg_class
        where oid = ('public.' || table_name)::regclass
      ),
      table_name || ' RLS 활성'
    );
    foreach actor in array array['anon', 'authenticated', 'service_role']
    loop
      foreach privilege in array array[
        'SELECT',
        'INSERT',
        'UPDATE',
        'DELETE',
        'TRUNCATE',
        'REFERENCES',
        'TRIGGER'
      ]
      loop
        perform pg_temp.classes_contents_assert(
          has_table_privilege(actor, 'public.' || table_name, privilege) = (
            (actor in ('anon', 'authenticated') and privilege = 'SELECT')
            or (
              actor = 'authenticated'
              and privilege in ('INSERT', 'UPDATE', 'DELETE')
            )
          ),
          actor || ' ' || table_name || ' ' || privilege || ' 최소 권한'
        );
      end loop;
    end loop;
    perform pg_temp.classes_contents_assert(
      not exists (
        select 1
        from pg_class c
        cross join lateral aclexplode(c.relacl) x
        where c.oid = ('public.' || table_name)::regclass
          and x.grantee = 0
      ),
      table_name || ' PUBLIC 권한 없음'
    );
  end loop;

  perform pg_temp.classes_contents_assert(
    pg_get_indexdef('public.classes_published_sort_idx'::regclass) =
      'CREATE INDEX classes_published_sort_idx ON public.classes USING btree (is_published, sort_order, created_at DESC, id DESC)',
    '강의 공개·정렬 인덱스'
  );
  perform pg_temp.classes_contents_assert(
    pg_get_indexdef('public.contents_published_sort_idx'::regclass) =
      'CREATE INDEX contents_published_sort_idx ON public.contents USING btree (is_published, sort_order, created_at DESC, id DESC)',
    '콘텐츠 공개·정렬 인덱스'
  );
  perform pg_temp.classes_contents_assert(
    (
      select count(*) = 8
      from pg_policies
      where schemaname = 'public'
        and tablename in ('classes', 'contents')
    ),
    '두 테이블 SELECT·INSERT·UPDATE·DELETE 정책'
  );
  perform pg_temp.classes_contents_assert(
    (
      select count(*) = 2
      from pg_policies
      where schemaname = 'public'
        and tablename in ('classes', 'contents')
        and cmd = 'UPDATE'
        and qual is not null
        and with_check is not null
    ),
    '관리자 UPDATE USING·WITH CHECK'
  );
end;
$catalog_check$;

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);
select pg_temp.classes_contents_assert(
  auth.uid() is null
  and not (select private.is_admin()),
  '비로그인 역할 확인'
);
select pg_temp.classes_contents_assert(
  (
    select count(*) = 1 and bool_and(is_published)
    from public.classes
    where id in (select id from classes_contents_test_ids)
  )
  and (
    select count(*) = 1 and bool_and(is_published)
    from public.contents
    where id in (select id from classes_contents_test_ids)
  ),
  '비로그인 공개 행만 조회'
);
select pg_temp.classes_contents_expected_error(
  $$insert into public.classes (title, description, field) values ('침범', '설명', 'saju')$$,
  '42501',
  '비로그인 강의 INSERT 차단'
);
select pg_temp.classes_contents_expected_error(
  $$insert into public.contents (title, channel) values ('침범', 'blog')$$,
  '42501',
  '비로그인 콘텐츠 INSERT 차단'
);
select pg_temp.classes_contents_expected_error(
  $$update public.classes set title = '침범'$$,
  '42501',
  '비로그인 강의 UPDATE 차단'
);
select pg_temp.classes_contents_expected_error(
  $$update public.contents set title = '침범'$$,
  '42501',
  '비로그인 콘텐츠 UPDATE 차단'
);
select pg_temp.classes_contents_expected_error(
  $$delete from public.classes$$,
  '42501',
  '비로그인 강의 DELETE 차단'
);
select pg_temp.classes_contents_expected_error(
  $$delete from public.contents$$,
  '42501',
  '비로그인 콘텐츠 DELETE 차단'
);
select pg_temp.classes_contents_expected_error(
  $$truncate public.classes$$,
  '42501',
  '비로그인 TRUNCATE 차단'
);
select pg_temp.classes_contents_expected_error(
  $$truncate public.contents$$,
  '42501',
  '비로그인 콘텐츠 TRUNCATE 차단'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  (select id::text from classes_contents_actors where kind = 'non_admin'),
  true
);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub',
    (select id::text from classes_contents_actors where kind = 'non_admin'),
    'role',
    'authenticated'
  )::text,
  true
);
select pg_temp.classes_contents_assert(
  auth.uid() = (select id from classes_contents_actors where kind = 'non_admin')
  and not (select private.is_admin()),
  '비관리자 인증 역할 확인'
);
select pg_temp.classes_contents_assert(
  (
    select count(*) = 1 and bool_and(is_published)
    from public.classes
    where id in (select id from classes_contents_test_ids)
  )
  and (
    select count(*) = 1 and bool_and(is_published)
    from public.contents
    where id in (select id from classes_contents_test_ids)
  ),
  '비관리자 인증 역할 공개 행만 조회'
);
select pg_temp.classes_contents_expected_error(
  $$insert into public.classes (title, description, field) values ('침범', '설명', 'saju')$$,
  '42501',
  '비관리자 강의 INSERT RLS 차단'
);
select pg_temp.classes_contents_expected_error(
  $$insert into public.contents (title, channel) values ('침범', 'blog')$$,
  '42501',
  '비관리자 콘텐츠 INSERT RLS 차단'
);
select pg_temp.classes_contents_no_rows(
  $$update public.classes set title = '침범'$$,
  '비관리자 강의 UPDATE 0행'
);
select pg_temp.classes_contents_no_rows(
  $$update public.contents set title = '침범'$$,
  '비관리자 콘텐츠 UPDATE 0행'
);
select pg_temp.classes_contents_no_rows(
  $$delete from public.classes$$,
  '비관리자 강의 DELETE 0행'
);
select pg_temp.classes_contents_no_rows(
  $$delete from public.contents$$,
  '비관리자 콘텐츠 DELETE 0행'
);
select pg_temp.classes_contents_expected_error(
  $$truncate public.classes$$,
  '42501',
  '비관리자 강의 TRUNCATE 차단'
);
select pg_temp.classes_contents_expected_error(
  $$truncate public.contents$$,
  '42501',
  '비관리자 콘텐츠 TRUNCATE 차단'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  (select id::text from classes_contents_actors where kind = 'admin'),
  true
);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub',
    (select id::text from classes_contents_actors where kind = 'admin'),
    'role',
    'authenticated'
  )::text,
  true
);
select pg_temp.classes_contents_assert(
  auth.uid() = (select id from classes_contents_actors where kind = 'admin')
  and (select private.is_admin()),
  '관리자 인증 역할 확인'
);
select pg_temp.classes_contents_assert(
  (
    select count(*) = 2
    from public.classes
    where id in (select id from classes_contents_test_ids)
  )
  and (
    select count(*) = 2
    from public.contents
    where id in (select id from classes_contents_test_ids)
  ),
  '관리자 비공개 포함 조회'
);
insert into public.classes (
  id,
  title,
  description,
  field
)
values (
  (select id from classes_contents_test_ids where kind = 'class_admin'),
  '테스트 관리자 강의',
  '설명',
  'tarot'
);
insert into public.contents (
  id,
  title,
  channel
)
values (
  (select id from classes_contents_test_ids where kind = 'content_admin'),
  '테스트 관리자 콘텐츠',
  'instagram'
);
update public.classes
set
  video_url = 'https://example.invalid/admin-class?preview=1',
  is_published = true
where id = (select id from classes_contents_test_ids where kind = 'class_admin');
update public.contents
set
  external_url = 'https://example.invalid/admin-content?preview=1',
  is_published = true
where id = (select id from classes_contents_test_ids where kind = 'content_admin');
select pg_temp.classes_contents_assert(
  (
    select is_published and video_url is not null
    from public.classes
    where id = (select id from classes_contents_test_ids where kind = 'class_admin')
  )
  and (
    select is_published and external_url is not null
    from public.contents
    where id = (select id from classes_contents_test_ids where kind = 'content_admin')
  ),
  '관리자 비공개에서 공개 전환'
);
update public.classes
set
  is_published = false,
  video_url = null
where id = (select id from classes_contents_test_ids where kind = 'class_admin');
update public.contents
set
  is_published = false,
  external_url = null
where id = (select id from classes_contents_test_ids where kind = 'content_admin');
select pg_temp.classes_contents_assert(
  (
    select not is_published and video_url is null
    from public.classes
    where id = (select id from classes_contents_test_ids where kind = 'class_admin')
  )
  and (
    select not is_published and external_url is null
    from public.contents
    where id = (select id from classes_contents_test_ids where kind = 'content_admin')
  ),
  '관리자 공개에서 비공개 전환'
);
with removed as (
  delete from public.classes
  where id = (select id from classes_contents_test_ids where kind = 'class_admin')
  returning id
)
select pg_temp.classes_contents_assert(
  (select count(*) = 1 from removed),
  '관리자 강의 삭제'
);
with removed as (
  delete from public.contents
  where id = (select id from classes_contents_test_ids where kind = 'content_admin')
  returning id
)
select pg_temp.classes_contents_assert(
  (select count(*) = 1 from removed),
  '관리자 콘텐츠 삭제'
);
reset role;

select pg_temp.classes_contents_assert(
  pg_temp.classes_contents_snapshot() = (
    select snapshot->'state'
    from classes_contents_baseline
  ),
  '기존 업무 행·구조·정책·권한·함수·기본 권한 보존'
);

do $success$
declare
  total integer;
  baseline jsonb;
  non_admin_description text;
begin
  select count(*) into total from classes_contents_results;
  select snapshot into baseline from classes_contents_baseline;
  select case mode
    when 'existing_user' then '기존 일반 회원 ID를 사용한 DB 역할/RLS 검사(실제 로그인 검증 아님)'
    when 'profileless' then '프로필 없는 비관리자 인증 역할을 사용한 DB RLS 검사(실제 일반 회원 로그인·Auth 세션 검증 아님)'
  end
  into non_admin_description
  from classes_contents_actors
  where kind = 'non_admin';

  raise exception using
    errcode = 'P0001',
    message = format(
      'CLASSES_CONTENTS_PREFLIGHT_OK: 검사 %s개 통과. %s. SQL 역할·RLS·CHECK·GRANT 검사 통과, 실제 Supabase Data API·실제 로그인·후속 화면 URL 파서 미검증. 의도된 전체 롤백.',
      total,
      non_admin_description
    ),
    detail = baseline::text;
end;
$success$;
