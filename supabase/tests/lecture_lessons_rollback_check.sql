-- LECTURE_LESSONS_PREFLIGHT_OK(P0001)를 확인한 경우에만 별도로 전체 실행한다.
-- 1단계 스키마(teachers, lectures, lecture_upload_consents)는 이미 운영에 적용되어 있다.
-- 전제: 1단계 스키마(teachers, lectures, lecture_upload_consents)는 적용된 채 남아 있다.
-- 이번 사전 검사 트랜잭션만 롤백되므로 2단계 객체는 없어야 하고 1단계 객체는 유지된다.
-- 사전 검사의 임시 사용자(고정 UUID, example.invalid)와 profile, 그 폴더의 Storage 객체가 남아 있으면 실패한다.
-- 성공 예외 DETAIL의 JSON을 아래 null 대신 $baseline$...$baseline$::jsonb로 붙여 넣는다.
-- 저장소 원본의 baseline은 null로 유지하고 실행 결과 JSON을 커밋하지 않는다.
-- 첫 ROLLBACK은 사전 검사의 의도된 예외로 중단된 트랜잭션을 종료한다.
rollback;

-- BEGIN EXACT SNAPSHOT
create or replace function pg_temp.lecture_lessons_snapshot()
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

  select jsonb_build_object(
    'anon_select', has_table_privilege('anon', 'public.lectures', 'SELECT'),
    'authenticated_delete', has_table_privilege('authenticated', 'public.lectures', 'DELETE'),
    'service_select', has_table_privilege('service_role', 'public.lectures', 'SELECT'),
    'service_insert', has_table_privilege('service_role', 'public.lectures', 'INSERT'),
    'service_update', has_table_privilege('service_role', 'public.lectures', 'UPDATE'),
    'service_delete', has_table_privilege('service_role', 'public.lectures', 'DELETE'),
    'policies', md5(coalesce((
      select string_agg(md5(to_jsonb(p)::text), '' order by p.policyname)
      from pg_policies p
      where p.schemaname = 'public'
        and p.tablename = 'lectures'
    ), ''))
  )
  into component;
  state := state || jsonb_build_object('lectures_access', component);

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
    or baseline->>'format' is distinct from 'lecture-lessons-preflight-v1'
    or baseline->'eligible' is distinct from 'true'::jsonb
    or jsonb_typeof(baseline->'state') is distinct from 'object'
  then
    raise exception using
      errcode = 'P0001',
      message = 'LECTURE_LESSONS_ROLLBACK_BASELINE_REQUIRED: 지정 성공 예외 DETAIL 원본이 필요합니다.';
  end if;

  if to_regclass('public.teachers') is null
    or to_regclass('public.lectures') is null
    or to_regclass('public.lecture_upload_consents') is null
  then
    raise exception using
      errcode = 'P0001',
      message = 'LECTURE_LESSONS_ROLLBACK_FAILED: 1단계 스키마 없음';
  end if;

  if to_regclass('public.lecture_lessons') is not null
    or to_regclass('public.lecture_webhook_events') is not null
    or to_regclass('public.lecture_storage_state') is not null
    or to_regclass('public.lecture_progress') is not null
    or to_regclass('public.lecture_lessons_lecture_sort_idx') is not null
    or to_regclass('public.lecture_lessons_teacher_idx') is not null
    or to_regclass('public.lecture_lessons_provider_video_uidx') is not null
    or to_regclass('public.lecture_lessons_ready_idx') is not null
    or to_regclass('public.lectures_published_idx') is not null
    or to_regclass('public.lecture_webhook_events_video_idx') is not null
    or to_regclass('public.lecture_progress_lesson_idx') is not null
    or to_regprocedure('private.guard_lecture_lesson_insert()') is not null
    or to_regprocedure('private.guard_lecture_lesson_update()') is not null
    or to_regprocedure('private.guard_lecture_progress_write()') is not null
    or exists (
      select 1
      from pg_policies
      where policyname in (
        'lectures_select_published',
        'lecture_lessons_select_owner',
        'lecture_lessons_select_admin',
        'lecture_lessons_select_published_ready',
        'lecture_lessons_insert_owner',
        'lecture_lessons_update_owner',
        'lecture_storage_state_select_admin',
        'lecture_progress_select_own',
        'lecture_progress_insert_own',
        'lecture_progress_update_own'
      )
    )
    or not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'lectures'
        and policyname = 'lectures_delete_owner'
    )
  then
    raise exception using
      errcode = 'P0001',
      message = 'LECTURE_LESSONS_ROLLBACK_FAILED: 2단계 객체 잔존 또는 1단계 delete 정책 없음';
  end if;

  current_state := pg_temp.lecture_lessons_snapshot();
  if (
    select jsonb_agg(key order by key)
    from jsonb_object_keys(current_state) as key
  ) is distinct from (
    select jsonb_agg(key order by key)
    from jsonb_object_keys(baseline->'state') as key
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'LECTURE_LESSONS_ROLLBACK_FAILED: baseline 상태 키 불일치';
  end if;

  for component in select jsonb_object_keys(baseline->'state')
  loop
    if current_state->component is distinct from baseline->'state'->component then
      raise exception using
        errcode = 'P0001',
        message = 'LECTURE_LESSONS_ROLLBACK_FAILED: 기존 데이터·카탈로그 불일치: ' || component;
    end if;
  end loop;

  if (
    select count(*)
    from auth.users
    where id in (
      'dddddddd-dddd-4ddd-8ddd-ddddddddddd4'::uuid,
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5'::uuid,
      'ffffffff-ffff-4fff-8fff-fffffffffff6'::uuid
    )
    or email in (
      'lecture-lessons-teacher-a@example.invalid',
      'lecture-lessons-teacher-b@example.invalid',
      'lecture-lessons-member@example.invalid'
    )
  ) <> 0
  or (
    select count(*)
    from public.profiles
    where id in (
      'dddddddd-dddd-4ddd-8ddd-ddddddddddd4'::uuid,
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5'::uuid,
      'ffffffff-ffff-4fff-8fff-fffffffffff6'::uuid
    )
  ) <> 0
  or (
    select count(*)
    from storage.objects
    where strpos(name, 'lectures/dddddddd-dddd-4ddd-8ddd-ddddddddddd4/') = 1
      or strpos(name, 'lectures/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5/') = 1
      or strpos(name, 'lectures/ffffffff-ffff-4fff-8fff-fffffffffff6/') = 1
  ) <> 0
  then
    raise exception using
      errcode = 'P0001',
      message = 'LECTURE_LESSONS_ROLLBACK_FAILED: 임시 사용자·profile·Storage 객체 잔존';
  end if;

  raise notice 'LECTURE_LESSONS_ROLLBACK_OK: 2단계 객체·검사 행 없음. 임시 사용자·profile·Storage 객체 잔존 0. 1단계 스키마와 기존 profile·클래스·콘텐츠·인증·Storage 원본 일치.';
end;
$rollback_check$;

select 'LECTURE_LESSONS_ROLLBACK_OK' as result;
