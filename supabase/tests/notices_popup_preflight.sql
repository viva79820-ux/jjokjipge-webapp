-- 이미 notices 마이그레이션이 적용됐고 is_popup은 아직 없는 DB에서 전체 실행한다.
-- SQLSTATE P0001과 NOTICES_POPUP_PREFLIGHT_OK로 끝나는 마지막 예외만 성공이다.
-- 성공 예외 DETAIL의 baseline JSON을 보관한 뒤 notices_popup_rollback_check.sql에 입력한다.
-- COMMIT하지 않으며 실제 공지·사용자·profiles·Storage는 변경하지 않는다.
-- 다른 작업이 없는 새 SQL Editor에서 파일 전체를 실행한다.
rollback;
begin;

do $$
declare
  missing text[] := '{}';
begin
  if to_regclass('public.notices') is null then
    missing := array_append(missing, 'public.notices');
  elsif exists (
    select 1
    from pg_attribute
    where attrelid = 'public.notices'::regclass
      and attname = 'is_popup'
      and not attisdropped
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'NOTICES_POPUP_PREFLIGHT_ALREADY_APPLIED: public.notices.is_popup';
  end if;

  if to_regclass('public.profiles') is null then
    missing := array_append(missing, 'public.profiles');
  end if;
  if to_regprocedure('private.is_admin()') is null then
    missing := array_append(missing, 'private.is_admin()');
  end if;

  if cardinality(missing) > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'NOTICES_POPUP_PREFLIGHT_PREREQUISITE_FAILED: ' || array_to_string(missing, ', ');
  end if;

  if not (
    select relrowsecurity
    from pg_class
    where oid = 'public.notices'::regclass
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'NOTICES_POPUP_PREFLIGHT_PREREQUISITE_FAILED: notices RLS 비활성';
  end if;

  if not exists (select 1 from public.profiles where role = 'admin') then
    raise exception using
      errcode = 'P0001',
      message = 'NOTICES_POPUP_PREFLIGHT_PREREQUISITE_FAILED: 기존 관리자 profile 필요';
  end if;
end;
$$;

create function pg_temp.notices_popup_snapshot()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'rows', (
      select jsonb_build_object(
        'count', count(*),
        'hash', md5(coalesce(string_agg(md5((to_jsonb(n) - 'is_popup')::text), '' order by n.id::text), ''))
      )
      from public.notices n
    ),
    'table', (
      select jsonb_build_object(
        'count', count(*),
        'hash', md5(coalesce(string_agg(md5(to_jsonb(s)::text), '' order by s.oid::text), ''))
      )
      from (
        select
          c.oid,
          c.relkind,
          c.relrowsecurity,
          c.relforcerowsecurity,
          c.relowner
        from pg_class c
        where c.oid = 'public.notices'::regclass
      ) s
    ),
    'columns', (
      select jsonb_build_object(
        'count', count(*),
        'hash', md5(coalesce(string_agg(md5(to_jsonb(s)::text), '' order by s.attnum::text), ''))
      )
      from (
        select
          a.attnum,
          a.attname,
          format_type(a.atttypid, a.atttypmod) as data_type,
          a.attnotnull,
          a.attidentity,
          a.attgenerated,
          a.attcollation,
          pg_get_expr(d.adbin, d.adrelid) as default_expression
        from pg_attribute a
        left join pg_attrdef d
          on d.adrelid = a.attrelid
          and d.adnum = a.attnum
        where a.attrelid = 'public.notices'::regclass
          and a.attnum > 0
          and not a.attisdropped
          and a.attname <> 'is_popup'
      ) s
    ),
    'constraints', (
      select jsonb_build_object(
        'count', count(*),
        'hash', md5(coalesce(string_agg(md5(to_jsonb(s)::text), '' order by s.conname), ''))
      )
      from (
        select
          c.conname,
          c.contype,
          c.condeferrable,
          c.condeferred,
          c.convalidated,
          pg_get_constraintdef(c.oid, true) as definition
        from pg_constraint c
        where c.conrelid = 'public.notices'::regclass
          and not (
            c.contype = 'n'
            and exists (
              select 1
              from unnest(c.conkey) key(attnum)
              join pg_attribute a
                on a.attrelid = c.conrelid
                and a.attnum = key.attnum
              where a.attname = 'is_popup'
            )
          )
      ) s
    ),
    'indexes', (
      select jsonb_build_object(
        'count', count(*),
        'hash', md5(coalesce(string_agg(md5(to_jsonb(s)::text), '' order by s.indexname), ''))
      )
      from (
        select i.indexname, i.indexdef
        from pg_indexes i
        where i.schemaname = 'public'
          and i.tablename = 'notices'
      ) s
    ),
    'policies', (
      select jsonb_build_object(
        'count', count(*),
        'hash', md5(coalesce(string_agg(md5(to_jsonb(s)::text), '' order by s.policyname), ''))
      )
      from (
        select
          p.policyname,
          p.permissive,
          p.roles,
          p.cmd,
          p.qual,
          p.with_check
        from pg_policies p
        where p.schemaname = 'public'
          and p.tablename = 'notices'
      ) s
    ),
    'table_grants', (
      select jsonb_build_object(
        'count', count(*),
        'hash', md5(coalesce(string_agg(md5(to_jsonb(s)::text), '' order by s.grantee::text || ':' || s.grantor::text || ':' || s.privilege_type || ':' || s.is_grantable::text), ''))
      )
      from (
        select
          x.grantor,
          x.grantee,
          x.privilege_type,
          x.is_grantable
        from pg_class c
        cross join lateral aclexplode(c.relacl) x
        where c.oid = 'public.notices'::regclass
      ) s
    ),
    'column_grants', (
      select jsonb_build_object(
        'count', count(*),
        'hash', md5(coalesce(string_agg(md5(to_jsonb(s)::text), '' order by s.attnum::text || ':' || s.grantee::text || ':' || s.grantor::text || ':' || s.privilege_type || ':' || s.is_grantable::text), ''))
      )
      from (
        select
          a.attnum,
          a.attname,
          x.grantor,
          x.grantee,
          x.privilege_type,
          x.is_grantable
        from pg_attribute a
        cross join lateral aclexplode(a.attacl) x
        where a.attrelid = 'public.notices'::regclass
          and a.attnum > 0
          and not a.attisdropped
          and a.attname <> 'is_popup'
      ) s
    ),
    'triggers', (
      select jsonb_build_object(
        'count', count(*),
        'hash', md5(coalesce(string_agg(md5(to_jsonb(s)::text), '' order by s.tgname), ''))
      )
      from (
        select
          t.tgname,
          t.tgenabled,
          pg_get_triggerdef(t.oid, true) as definition
        from pg_trigger t
        where t.tgrelid = 'public.notices'::regclass
          and not t.tgisinternal
      ) s
    )
  );
$$;

create temporary table notices_popup_test_ids (
  kind text primary key,
  id uuid unique not null
);
insert into notices_popup_test_ids (kind, id) values
  ('default', 'ffffffff-ffff-4fff-8fff-fffffffff001'),
  ('draft_popup', 'ffffffff-ffff-4fff-8fff-fffffffff002'),
  ('published_nonpopup', 'ffffffff-ffff-4fff-8fff-fffffffff003'),
  ('popup_old', 'ffffffff-ffff-4fff-8fff-fffffffff010'),
  ('popup_tie_low', 'ffffffff-ffff-4fff-8fff-fffffffff011'),
  ('popup_tie_high', 'ffffffff-ffff-4fff-8fff-fffffffff012'),
  ('delete_check', 'ffffffff-ffff-4fff-8fff-fffffffff020'),
  ('denied_insert', 'ffffffff-ffff-4fff-8fff-fffffffff030');

do $$
begin
  if exists (
    select 1
    from public.notices n
    join notices_popup_test_ids t on t.id = n.id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'NOTICES_POPUP_PREFLIGHT_PREREQUISITE_FAILED: 검사 UUID 충돌';
  end if;
end;
$$;

create temporary table notices_popup_actors (
  kind text primary key,
  id uuid not null,
  mode text not null
);
insert into notices_popup_actors (kind, id, mode)
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
  where not exists (
    select 1
    from public.profiles p
    where p.id = c.id
  )
  order by c.id
  limit 1
)
insert into notices_popup_actors (kind, id, mode)
select
  'non_admin',
  coalesce((select id from existing_user), (select id from fallback)),
  case
    when exists (select 1 from existing_user) then 'existing_user'
    else 'profileless'
  end;

do $$
begin
  if (
    select id
    from notices_popup_actors
    where kind = 'non_admin'
  ) = (
    select id
    from notices_popup_actors
    where kind = 'admin'
  ) or exists (
    select 1
    from public.profiles p
    join notices_popup_actors a on a.id = p.id
    where a.kind = 'non_admin'
      and p.role = 'admin'
  ) or exists (
    select 1
    from notices_popup_actors a
    where a.kind = 'non_admin'
      and (
        (
          a.mode = 'existing_user'
          and not exists (
            select 1
            from public.profiles p
            where p.id = a.id
              and p.role = 'user'
          )
        )
        or (
          a.mode = 'profileless'
          and exists (
            select 1
            from public.profiles p
            where p.id = a.id
          )
        )
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'NOTICES_POPUP_PREFLIGHT_PREREQUISITE_FAILED: 비관리자 검사 ID 선택 실패';
  end if;
end;
$$;

create temporary table notices_popup_baseline as
select jsonb_build_object(
  'format', 'notices-popup-preflight-v1',
  'eligible', true,
  'state', pg_temp.notices_popup_snapshot(),
  'test_ids', (
    select jsonb_agg(id::text order by id::text)
    from notices_popup_test_ids
  ),
  'non_admin_mode', (
    select mode
    from notices_popup_actors
    where kind = 'non_admin'
  )
) as snapshot;

create temporary table notices_popup_results (
  label text not null
);
grant select on notices_popup_test_ids, notices_popup_actors to anon, authenticated;
grant insert on notices_popup_results to anon, authenticated;

create function pg_temp.notices_popup_assert(ok boolean, label text)
returns void
language plpgsql
security invoker
as $$
begin
  if ok is distinct from true then
    raise exception 'NOTICES_POPUP_ASSERT_FAILED: %', label;
  end if;
  insert into pg_temp.notices_popup_results values (label);
end;
$$;

create function pg_temp.notices_popup_denied(command text, expected_state text, label text)
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
    insert into pg_temp.notices_popup_results values (label);
    return;
  end;
  raise exception 'NOTICES_POPUP_EXPECTED_ERROR_MISSING: %', label;
end;
$$;

create function pg_temp.notices_popup_no_rows(command text, label text)
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
    raise exception 'NOTICES_POPUP_UNEXPECTED_ROWS: %', label;
  end if;
  insert into pg_temp.notices_popup_results values (label);
end;
$$;

grant execute on function pg_temp.notices_popup_assert(boolean, text) to anon, authenticated;
grant execute on function pg_temp.notices_popup_denied(text, text, text) to anon, authenticated;
grant execute on function pg_temp.notices_popup_no_rows(text, text) to anon, authenticated;

-- BEGIN EXACT MIGRATION
-- 기존 공지의 콘텐츠를 홈 팝업으로 표시할지 설정한다.
alter table public.notices
add column is_popup boolean not null default false;
-- END EXACT MIGRATION

select pg_temp.notices_popup_assert(
  (
    select
      format_type(a.atttypid, a.atttypmod) = 'boolean'
      and a.attnotnull
      and pg_get_expr(d.adbin, d.adrelid) = 'false'
    from pg_attribute a
    left join pg_attrdef d
      on d.adrelid = a.attrelid
      and d.adnum = a.attnum
    where a.attrelid = 'public.notices'::regclass
      and a.attname = 'is_popup'
      and not a.attisdropped
  ),
  'is_popup boolean NOT NULL default false'
);
select pg_temp.notices_popup_assert(
  (
    select count(*) = (select (snapshot->'state'->'rows'->>'count')::bigint from notices_popup_baseline)
      and coalesce(bool_and(not is_popup), true)
    from public.notices
  ),
  '기존 모든 공지 is_popup=false'
);
select pg_temp.notices_popup_assert(
  not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.notices'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid, true) like '%is_popup%'
  ),
  '공개 여부와 팝업 설정 결합 CHECK 없음'
);

do $$
declare
  actor text;
  privilege text;
begin
  foreach actor in array array['anon', 'authenticated', 'service_role'] loop
    foreach privilege in array array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'] loop
      perform pg_temp.notices_popup_assert(
        has_column_privilege(actor, 'public.notices', 'is_popup', privilege)
          = has_table_privilege(actor, 'public.notices', privilege),
        actor || ' 기존 테이블 ' || privilege || ' 권한이 is_popup에 적용'
      );
    end loop;
  end loop;
end;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  (select id::text from notices_popup_actors where kind = 'admin'),
  true
);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (select id::text from notices_popup_actors where kind = 'admin'),
    'role', 'authenticated'
  )::text,
  true
);

insert into public.notices (id, title, body, updated_at)
values (
  (select id from notices_popup_test_ids where kind = 'default'),
  '팝업 검사 기본값',
  '팝업 검사 본문',
  '2000-01-01 00:00:00+00'
);
insert into public.notices (id, title, body, image_path, image_alt, is_popup)
values (
  (select id from notices_popup_test_ids where kind = 'draft_popup'),
  '팝업 검사 비공개',
  '비공개 팝업 검사 본문',
  'notices/11111111-1111-4111-8111-111111111111.webp',
  '팝업 검사 이미지',
  true
);
insert into public.notices (id, title, body, is_published, published_at)
values (
  (select id from notices_popup_test_ids where kind = 'published_nonpopup'),
  '팝업 검사 공개 비대상',
  '공개 비대상 검사 본문',
  true,
  '2030-01-03 00:00:00+00'
);
insert into public.notices (id, title, body, is_pinned, is_popup, is_published, published_at)
values
  (
    (select id from notices_popup_test_ids where kind = 'popup_old'),
    '팝업 검사 이전 공개',
    '이전 공개 팝업 검사 본문',
    true,
    true,
    true,
    '2029-12-31 00:00:00+00'
  ),
  (
    (select id from notices_popup_test_ids where kind = 'popup_tie_low'),
    '팝업 검사 최근 공개 낮은 ID',
    '최근 공개 팝업 검사 본문',
    false,
    true,
    true,
    '2030-01-02 00:00:00+00'
  ),
  (
    (select id from notices_popup_test_ids where kind = 'popup_tie_high'),
    '팝업 검사 최근 공개 높은 ID',
    '최근 공개 팝업 검사 본문',
    false,
    true,
    true,
    '2030-01-02 00:00:00+00'
  ),
  (
    (select id from notices_popup_test_ids where kind = 'delete_check'),
    '팝업 검사 삭제',
    '관리자 삭제 검사 본문',
    false,
    true,
    false,
    null
  );

select pg_temp.notices_popup_assert(
  (
    select not is_popup
    from public.notices
    where id = (select id from notices_popup_test_ids where kind = 'default')
  ),
  '신규 공지 is_popup 생략 시 false'
);
select pg_temp.notices_popup_assert(
  (
    select is_popup and not is_published
    from public.notices
    where id = (select id from notices_popup_test_ids where kind = 'draft_popup')
  ),
  '비공개 is_popup=true 초안 저장'
);

update public.notices
set is_popup = true
where id = (select id from notices_popup_test_ids where kind = 'default');
select pg_temp.notices_popup_assert(
  (
    select is_popup and updated_at = now()
    from public.notices
    where id = (select id from notices_popup_test_ids where kind = 'default')
  ),
  '관리자 is_popup=true 수정과 기존 updated_at 트리거'
);
update public.notices
set is_popup = false
where id = (select id from notices_popup_test_ids where kind = 'default');
select pg_temp.notices_popup_assert(
  (
    select not is_popup
    from public.notices
    where id = (select id from notices_popup_test_ids where kind = 'default')
  ),
  '관리자 is_popup=false 수정'
);
select pg_temp.notices_popup_denied(
  format(
    'update public.notices set is_popup=null where id=%L',
    (select id from notices_popup_test_ids where kind = 'draft_popup')
  ),
  '23502',
  'is_popup NULL 거부'
);

select pg_temp.notices_popup_denied(
  'insert into public.notices(title,body) values (E'' \t\n'', ''검사 본문'')',
  '23514',
  '기존 제목 제약 유지'
);
select pg_temp.notices_popup_denied(
  'insert into public.notices(title,body) values (''검사 제목'', E'' \t\n'')',
  '23514',
  '기존 본문 제약 유지'
);
select pg_temp.notices_popup_denied(
  'insert into public.notices(title,body,image_path,image_alt) values (''검사 제목'',''검사 본문'',''notices/../bad.webp'',''검사 이미지'')',
  '23514',
  '기존 이미지 경로 제약 유지'
);
select pg_temp.notices_popup_denied(
  'insert into public.notices(title,body,image_path) values (''검사 제목'',''검사 본문'',''notices/11111111-1111-4111-8111-111111111111.webp'')',
  '23514',
  '기존 이미지 설명 제약 유지'
);
select pg_temp.notices_popup_denied(
  'insert into public.notices(title,body,is_published) values (''검사 제목'',''검사 본문'',true)',
  '23514',
  '기존 공개 시각 제약 유지'
);

with removed as (
  delete from public.notices
  where id = (select id from notices_popup_test_ids where kind = 'delete_check')
  returning id
)
select pg_temp.notices_popup_assert(
  (select count(*) = 1 from removed),
  '관리자 DELETE'
);
reset role;

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);
select pg_temp.notices_popup_assert(
  (
    select count(*) = 4
    from public.notices
    where id in (select id from notices_popup_test_ids)
  ),
  '비로그인 공개 공지만 조회'
);
select pg_temp.notices_popup_assert(
  not exists (
    select 1
    from public.notices
    where id = (select id from notices_popup_test_ids where kind = 'draft_popup')
  ),
  '비로그인 비공개 팝업 미노출'
);
select pg_temp.notices_popup_assert(
  not exists (
    select 1
    from public.notices
    where id = (select id from notices_popup_test_ids where kind = 'published_nonpopup')
      and is_published = true
      and is_popup = true
  ),
  '공개됐지만 팝업 설정이 꺼진 공지 후보 제외'
);
select pg_temp.notices_popup_assert(
  (
    select count(*) = 3
    from public.notices
    where id in (select id from notices_popup_test_ids)
      and is_published = true
      and is_popup = true
  ),
  '공개된 팝업 대상만 고객 후보 포함'
);
select pg_temp.notices_popup_assert(
  (
    select id = 'ffffffff-ffff-4fff-8fff-fffffffff012'::uuid
    from public.notices
    where id in (select id from notices_popup_test_ids)
      and is_published = true
      and is_popup = true
    order by published_at desc, id desc
    limit 1
  ),
  '상단 고정과 무관한 published_at DESC, id DESC 최근 1건'
);
select pg_temp.notices_popup_denied(
  format(
    'insert into public.notices(id,title,body) values (%L,''비로그인 침범'',''검사 본문'')',
    (select id from notices_popup_test_ids where kind = 'denied_insert')
  ),
  '42501',
  '비로그인 INSERT 거부'
);
select pg_temp.notices_popup_denied(
  format(
    'update public.notices set is_popup=false where id=%L',
    (select id from notices_popup_test_ids where kind = 'popup_old')
  ),
  '42501',
  '비로그인 UPDATE 거부'
);
select pg_temp.notices_popup_denied(
  format(
    'delete from public.notices where id=%L',
    (select id from notices_popup_test_ids where kind = 'popup_old')
  ),
  '42501',
  '비로그인 DELETE 거부'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  (select id::text from notices_popup_actors where kind = 'non_admin'),
  true
);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (select id::text from notices_popup_actors where kind = 'non_admin'),
    'role', 'authenticated'
  )::text,
  true
);
select pg_temp.notices_popup_assert(
  auth.uid() = (
    select id
    from notices_popup_actors
    where kind = 'non_admin'
  ),
  '비관리자 인증 역할 auth.uid() 일치'
);
select pg_temp.notices_popup_assert(
  not (select private.is_admin()),
  '비관리자 인증 역할 private.is_admin()=false'
);
select pg_temp.notices_popup_assert(
  (
    select count(*) = 4
    from public.notices
    where id in (select id from notices_popup_test_ids)
  ),
  '비관리자 인증 역할 공개 공지만 조회'
);
select pg_temp.notices_popup_assert(
  not exists (
    select 1
    from public.notices
    where id = (select id from notices_popup_test_ids where kind = 'draft_popup')
  ),
  '비관리자 인증 역할 비공개 팝업 미노출'
);
select pg_temp.notices_popup_denied(
  format(
    'insert into public.notices(id,title,body) values (%L,''비관리자 침범'',''검사 본문'')',
    (select id from notices_popup_test_ids where kind = 'denied_insert')
  ),
  '42501',
  '비관리자 인증 역할 INSERT RLS 거부'
);
select pg_temp.notices_popup_no_rows(
  format(
    'update public.notices set is_popup=false where id=%L',
    (select id from notices_popup_test_ids where kind = 'popup_old')
  ),
  '비관리자 인증 역할 UPDATE 0행'
);
select pg_temp.notices_popup_no_rows(
  format(
    'delete from public.notices where id=%L',
    (select id from notices_popup_test_ids where kind = 'popup_old')
  ),
  '비관리자 인증 역할 DELETE 0행'
);
reset role;

select pg_temp.notices_popup_assert(
  (
    select count(*) = 3
      and bool_and(is_popup)
    from public.notices
    where id in (
      select id
      from notices_popup_test_ids
      where kind in ('popup_old', 'popup_tie_low', 'popup_tie_high')
    )
  ),
  '비로그인·비관리자 인증 역할 쓰기 차단 후 팝업 원본 보존'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  (select id::text from notices_popup_actors where kind = 'admin'),
  true
);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (select id::text from notices_popup_actors where kind = 'admin'),
    'role', 'authenticated'
  )::text,
  true
);
select pg_temp.notices_popup_assert(
  (
    select count(*) = 6
    from public.notices
    where id in (select id from notices_popup_test_ids)
  ),
  '관리자 비공개 포함 조회'
);
with removed as (
  delete from public.notices
  where id in (select id from notices_popup_test_ids)
  returning id
)
select pg_temp.notices_popup_assert(
  (select count(*) = 6 from removed),
  '관리자 검사 공지 정리'
);
reset role;

do $$
declare
  component text;
  before_state jsonb;
  after_state jsonb := pg_temp.notices_popup_snapshot();
begin
  select snapshot->'state' into before_state from notices_popup_baseline;
  for component in select jsonb_object_keys(before_state) loop
    perform pg_temp.notices_popup_assert(
      after_state->component = before_state->component,
      '기존 상태 보존: ' || component
    );
  end loop;
end;
$$;
select pg_temp.notices_popup_assert(
  not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'notices'
      and indexdef like '%is_popup%'
  ),
  'is_popup 신규 인덱스 없음'
);

do $$
declare
  total integer;
  baseline jsonb;
  non_admin_description text;
begin
  select count(*) into total from notices_popup_results;
  select snapshot into baseline from notices_popup_baseline;
  select case mode
    when 'existing_user' then '기존 일반 회원 ID를 사용한 DB 역할/RLS 검사(실제 로그인 검증 아님)'
    when 'profileless' then '프로필 없는 비관리자 인증 역할을 사용한 DB RLS 검사(실제 일반 회원 로그인·Auth 세션 검증 아님)'
  end
  into non_admin_description
  from notices_popup_actors
  where kind = 'non_admin';
  raise exception using
    errcode = 'P0001',
    message = format(
      'NOTICES_POPUP_PREFLIGHT_OK: 검사 %s개 통과. %s. 의도된 전체 롤백.',
      total,
      non_admin_description
    ),
    detail = baseline::text;
end;
$$;
