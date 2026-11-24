-- CLASS_POSTER_PREFLIGHT_OK(P0001)를 확인한 경우에만 별도로 전체 실행한다.
-- 성공 예외 DETAIL의 JSON을 아래 null 대신 $baseline$...$baseline$::jsonb로 붙여 넣는다.
-- 저장소 원본의 baseline은 null로 유지하고 실행 결과 JSON을 커밋하지 않는다.
-- 첫 ROLLBACK은 사전 검사의 의도된 예외로 중단된 트랜잭션을 종료한다.
rollback;

-- BEGIN EXACT SNAPSHOT
-- 새 포스터 열과 제약만 제외하면 마이그레이션 전후가 같아야 한다.
create or replace function pg_temp.class_poster_snapshot()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $snapshot$
declare
  state jsonb := '{}'::jsonb;
  component jsonb;
begin
  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(
      md5((to_jsonb(c) - 'poster_path' - 'poster_alt')::text),
      '' order by c.id::text
    ), ''))
  )
  into component
  from public.classes c;
  state := state || jsonb_build_object('classes_rows', component);

  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(md5(to_jsonb(s)::text), '' order by s.attnum), ''))
  )
  into component
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
    where a.attrelid = 'public.classes'::regclass
      and a.attnum > 0
      and not a.attisdropped
      and a.attname not in ('poster_path', 'poster_alt')
  ) s;
  state := state || jsonb_build_object('classes_existing_columns', component);

  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(md5(to_jsonb(s)::text), '' order by s.conname), ''))
  )
  into component
  from (
    select
      c.conname,
      c.contype,
      c.condeferrable,
      c.condeferred,
      c.convalidated,
      pg_get_constraintdef(c.oid, true) as definition
    from pg_constraint c
    where c.conrelid = 'public.classes'::regclass
      and c.conname not in (
        'classes_poster_path_check',
        'classes_poster_alt_check',
        'classes_poster_requires_alt_check'
      )
  ) s;
  state := state || jsonb_build_object('classes_existing_constraints', component);

  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(md5(to_jsonb(s)::text), '' order by s.indexname), ''))
  )
  into component
  from (
    select i.indexname, i.indexdef
    from pg_indexes i
    where i.schemaname = 'public'
      and i.tablename = 'classes'
  ) s;
  state := state || jsonb_build_object('classes_indexes', component);

  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(md5(to_jsonb(p)::text), '' order by p.policyname), ''))
  )
  into component
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename = 'classes';
  state := state || jsonb_build_object('classes_policies', component);

  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(md5(to_jsonb(s)::text), '' order by s.tgname), ''))
  )
  into component
  from (
    select t.tgname, t.tgenabled, pg_get_triggerdef(t.oid, true) as definition
    from pg_trigger t
    where t.tgrelid = 'public.classes'::regclass
      and not t.tgisinternal
  ) s;
  state := state || jsonb_build_object('classes_triggers', component);

  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(md5(to_jsonb(s)::text), ''
      order by s.grantee::text, s.grantor::text, s.privilege_type), ''))
  )
  into component
  from (
    select x.grantor, x.grantee, x.privilege_type, x.is_grantable
    from pg_class c
    cross join lateral aclexplode(c.relacl) x
    where c.oid = 'public.classes'::regclass
  ) s;
  state := state || jsonb_build_object('classes_grants', component);

  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(md5(to_jsonb(b)::text), '' order by b.id), ''))
  )
  into component
  from storage.buckets b
  where b.id = 'public-images';
  state := state || jsonb_build_object('public_images_bucket', component);

  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(md5(to_jsonb(o)::text), '' order by o.id::text), ''))
  )
  into component
  from storage.objects o;
  state := state || jsonb_build_object('storage_objects', component);

  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(md5(to_jsonb(p)::text), '' order by p.policyname), ''))
  )
  into component
  from pg_policies p
  where p.schemaname = 'storage'
    and p.tablename = 'objects';
  state := state || jsonb_build_object('storage_object_policies', component);

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
    or baseline->>'format' is distinct from 'class-poster-preflight-v1'
    or baseline->'eligible' is distinct from 'true'::jsonb
    or jsonb_typeof(baseline->'state') is distinct from 'object'
    or jsonb_typeof(baseline->'test_ids') is distinct from 'array'
  then
    raise exception using
      errcode = 'P0001',
      message = 'CLASS_POSTER_ROLLBACK_BASELINE_REQUIRED: 지정 성공 예외 DETAIL 원본이 필요합니다.';
  end if;

  if to_regclass('public.classes') is null
    or to_regclass('storage.buckets') is null
    or to_regclass('storage.objects') is null
  then
    raise exception using
      errcode = 'P0001',
      message = 'CLASS_POSTER_ROLLBACK_FAILED: 기존 classes 또는 Storage 객체 없음';
  end if;

  if exists (
    select 1
    from pg_attribute
    where attrelid = 'public.classes'::regclass
      and attname in ('poster_path', 'poster_alt')
      and attnum > 0
      and not attisdropped
  ) or exists (
    select 1
    from pg_constraint
    where conrelid = 'public.classes'::regclass
      and conname in (
        'classes_poster_path_check',
        'classes_poster_alt_check',
        'classes_poster_requires_alt_check'
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'CLASS_POSTER_ROLLBACK_FAILED: 포스터 열 또는 제약 잔존';
  end if;

  if exists (
    select 1
    from public.classes
    where id in (
      select value::uuid
      from jsonb_array_elements_text(baseline->'test_ids')
    )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'CLASS_POSTER_ROLLBACK_FAILED: 검사 클래스 행 잔존';
  end if;

  current_state := pg_temp.class_poster_snapshot();
  if (
    select jsonb_agg(key order by key)
    from jsonb_object_keys(current_state) as key
  ) is distinct from (
    select jsonb_agg(key order by key)
    from jsonb_object_keys(baseline->'state') as key
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'CLASS_POSTER_ROLLBACK_FAILED: baseline 상태 키 불일치';
  end if;

  for component in select jsonb_object_keys(baseline->'state')
  loop
    if current_state->component is distinct from baseline->'state'->component then
      raise exception using
        errcode = 'P0001',
        message = 'CLASS_POSTER_ROLLBACK_FAILED: 기존 클래스·Storage 불일치: ' || component;
    end if;
  end loop;

  raise notice 'CLASS_POSTER_ROLLBACK_OK: 포스터 열·제약·검사 행 없음. 기존 클래스 행·구조·정책·권한·Storage 원본 일치.';
end;
$rollback_check$;

select 'CLASS_POSTER_ROLLBACK_OK' as result;
