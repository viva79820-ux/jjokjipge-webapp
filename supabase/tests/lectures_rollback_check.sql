-- LECTURES_PREFLIGHT_OK(P0001)를 확인한 경우에만 별도로 전체 실행한다.
-- 성공 예외 DETAIL의 JSON을 아래 null 대신 $baseline$...$baseline$::jsonb로 붙여 넣는다.
-- 저장소 원본의 baseline은 null로 유지하고 실행 결과 JSON을 커밋하지 않는다.
-- 첫 ROLLBACK은 사전 검사의 의도된 예외로 중단된 트랜잭션을 종료한다.
rollback;

-- BEGIN EXACT SNAPSHOT
create or replace function pg_temp.lectures_snapshot()
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
  policy_hash text;
begin
  foreach table_name in array array['profiles', 'classes', 'contents']
  loop
    execute
      'select jsonb_build_object('
      || quote_literal('count') || ', count(*), '
      || quote_literal('hash') || ', md5(coalesce(string_agg(md5(to_jsonb(t)::text), '
      || quote_literal('') || ' order by t.id::text), ' || quote_literal('') || '))) '
      || 'from public.' || quote_ident(table_name) || ' t'
    into component;
    state := state || jsonb_build_object(table_name || '_rows', component);

    execute
      'select jsonb_build_object('
      || quote_literal('columns') || ', ('
      || 'select md5(coalesce(string_agg(md5(to_jsonb(s)::text), '
      || quote_literal('') || ' order by s.attnum), ' || quote_literal('') || ')) from ('
      || 'select a.attnum, a.attname, format_type(a.atttypid, a.atttypmod) as data_type, '
      || 'a.attnotnull, pg_get_expr(d.adbin, d.adrelid) as default_expression '
      || 'from pg_attribute a left join pg_attrdef d '
      || 'on d.adrelid = a.attrelid and d.adnum = a.attnum '
      || 'where a.attrelid = ' || quote_literal('public.' || table_name) || '::regclass '
      || 'and a.attnum > 0 and not a.attisdropped) s), '
      || quote_literal('policies') || ', ('
      || 'select md5(coalesce(string_agg(md5(to_jsonb(p)::text), '
      || quote_literal('') || ' order by p.policyname), ' || quote_literal('') || ')) '
      || 'from pg_policies p where p.schemaname = ' || quote_literal('public')
      || ' and p.tablename = ' || quote_literal(table_name) || '))'
    into component;
    state := state || jsonb_build_object(table_name || '_catalog', component);
  end loop;

  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(md5(to_jsonb(u)::text), '' order by u.id::text), ''))
  )
  into component
  from auth.users u;
  state := state || jsonb_build_object('auth_users', component);

  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(md5(to_jsonb(o)::text), '' order by o.id::text), ''))
  )
  into component
  from storage.objects o;
  state := state || jsonb_build_object('storage_objects', component);

  select md5(coalesce(string_agg(md5(to_jsonb(p)::text), '' order by p.policyname), ''))
  into policy_hash
  from pg_policies p
  where p.schemaname = 'storage'
    and p.tablename = 'objects'
    and p.policyname in (
      'public_images_select_admin',
      'public_images_insert_admin',
      'public_images_update_admin',
      'public_images_delete_admin'
    );
  state := state || jsonb_build_object('admin_storage_policies', to_jsonb(policy_hash));

  return state;
end;
$snapshot$;
-- END EXACT SNAPSHOT

do $rollback_check$
declare
  baseline jsonb := null; -- 예: $baseline${"format":...}$baseline$::jsonb
  current_state jsonb;
  component text;
begin
  if baseline is null
    or baseline->>'format' is distinct from 'lectures-preflight-v1'
    or baseline->'eligible' is distinct from 'true'::jsonb
    or jsonb_typeof(baseline->'state') is distinct from 'object'
  then
    raise exception using
      errcode = 'P0001',
      message = 'LECTURES_ROLLBACK_BASELINE_REQUIRED: 지정 성공 예외 DETAIL 원본이 필요합니다.';
  end if;

  if to_regclass('public.teachers') is not null
    or to_regclass('public.lectures') is not null
    or to_regclass('public.lecture_upload_consents') is not null
    or to_regclass('public.teachers_granted_by_idx') is not null
    or to_regclass('public.lectures_teacher_created_idx') is not null
    or to_regprocedure('private.assign_teacher_grant()') is not null
    or to_regprocedure('private.assign_lecture_consent()') is not null
    or to_regprocedure('private.guard_lecture_insert()') is not null
    or to_regprocedure('private.guard_lecture_update()') is not null
    or exists (
      select 1
      from pg_policies
      where (
        schemaname = 'public'
        and tablename in ('teachers', 'lectures', 'lecture_upload_consents')
      )
      or policyname in (
        'public_images_select_teacher_lecture',
        'public_images_insert_teacher_lecture',
        'public_images_update_teacher_lecture',
        'public_images_delete_teacher_lecture'
      )
    )
  then
    raise exception using
      errcode = 'P0001',
      message = 'LECTURES_ROLLBACK_FAILED: 신규 강의 객체 잔존';
  end if;

  if to_regclass('public.profiles') is null
    or to_regclass('public.classes') is null
    or to_regclass('public.contents') is null
    or to_regclass('storage.objects') is null
  then
    raise exception using
      errcode = 'P0001',
      message = 'LECTURES_ROLLBACK_FAILED: 기존 대상 테이블 없음';
  end if;

  current_state := pg_temp.lectures_snapshot();
  if (
    select jsonb_agg(key order by key)
    from jsonb_object_keys(current_state) as key
  ) is distinct from (
    select jsonb_agg(key order by key)
    from jsonb_object_keys(baseline->'state') as key
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'LECTURES_ROLLBACK_FAILED: baseline 상태 키 불일치';
  end if;

  for component in select jsonb_object_keys(baseline->'state')
  loop
    if current_state->component is distinct from baseline->'state'->component then
      raise exception using
        errcode = 'P0001',
        message = 'LECTURES_ROLLBACK_FAILED: 기존 데이터·카탈로그 불일치: ' || component;
    end if;
  end loop;

  raise notice 'LECTURES_ROLLBACK_OK: 신규 강의 객체·검사 행 없음. 기존 profile·클래스·콘텐츠·인증·Storage 원본 일치.';
end;
$rollback_check$;

select 'LECTURES_ROLLBACK_OK' as result;
