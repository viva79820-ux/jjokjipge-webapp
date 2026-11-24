-- CLASS_DELIVERY_MODE_PREFLIGHT_OK(P0001)를 확인한 경우에만 별도로 전체 실행한다.
-- 성공 예외 DETAIL의 JSON을 아래 null 대신 $baseline$...$baseline$::jsonb로 붙여 넣는다.
-- 저장소 원본의 baseline은 null로 유지하고 실행 결과 JSON을 커밋하지 않는다.
-- 첫 ROLLBACK은 사전 검사의 의도된 예외로 중단된 트랜잭션을 종료한다.
rollback;

-- BEGIN EXACT SNAPSHOT
-- 새 구분 열과 교체 대상 제약만 제외하면 마이그레이션 전후가 같아야 한다.
create or replace function pg_temp.class_delivery_mode_snapshot()
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
      md5((to_jsonb(c) - 'is_online')::text),
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
      and a.attname <> 'is_online'
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
      and c.conname <> 'classes_published_video_url_check'
  ) s;
  state := state || jsonb_build_object('classes_existing_constraints', component);

  select to_jsonb(s)
  into component
  from (
    select c.relrowsecurity, c.relforcerowsecurity, c.relowner
    from pg_class c
    where c.oid = 'public.classes'::regclass
  ) s;
  state := state || jsonb_build_object('classes_rls', component);

  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(md5(to_jsonb(i)::text), '' order by i.indexname), ''))
  )
  into component
  from pg_indexes i
  where i.schemaname = 'public'
    and i.tablename = 'classes';
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
    'hash', md5(coalesce(string_agg(
      md5(to_jsonb(s)::text),
      '' order by s.grantee::text, s.grantor::text, s.privilege_type
    ), ''))
  )
  into component
  from (
    select x.grantor, x.grantee, x.privilege_type, x.is_grantable
    from pg_class c
    cross join lateral aclexplode(c.relacl) x
    where c.oid = 'public.classes'::regclass
  ) s;
  state := state || jsonb_build_object('classes_table_grants', component);

  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(
      md5(to_jsonb(s)::text),
      '' order by s.attnum, s.grantee::text, s.grantor::text, s.privilege_type
    ), ''))
  )
  into component
  from (
    select a.attnum, a.attname, x.grantor, x.grantee, x.privilege_type, x.is_grantable
    from pg_attribute a
    cross join lateral aclexplode(a.attacl) x
    where a.attrelid = 'public.classes'::regclass
      and a.attnum > 0
      and not a.attisdropped
      and a.attname <> 'is_online'
  ) s;
  state := state || jsonb_build_object('classes_existing_column_grants', component);

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
  video_url_attnum smallint;
  is_published_attnum smallint;
begin
  if baseline is null
    or baseline->>'format' is distinct from 'class-delivery-mode-preflight-v1'
    or baseline->'eligible' is distinct from 'true'::jsonb
    or jsonb_typeof(baseline->'state') is distinct from 'object'
    or jsonb_typeof(baseline->'test_ids') is distinct from 'array'
  then
    raise exception using
      errcode = 'P0001',
      message = 'CLASS_DELIVERY_MODE_ROLLBACK_BASELINE_REQUIRED: 지정 성공 예외 DETAIL 원본이 필요합니다.';
  end if;

  if to_regclass('public.classes') is null
    or to_regclass('storage.objects') is null
  then
    raise exception using
      errcode = 'P0001',
      message = 'CLASS_DELIVERY_MODE_ROLLBACK_FAILED: public.classes 또는 storage.objects 없음';
  end if;

  if exists (
    select 1
    from pg_attribute
    where attrelid = 'public.classes'::regclass
      and attname = 'is_online'
      and attnum > 0
      and not attisdropped
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'CLASS_DELIVERY_MODE_ROLLBACK_FAILED: is_online 열 잔존';
  end if;

  select attnum
  into video_url_attnum
  from pg_attribute
  where attrelid = 'public.classes'::regclass
    and attname = 'video_url'
    and atttypid = 'text'::regtype
    and atttypmod = -1
    and not attnotnull
    and attnum > 0
    and not attisdropped;

  select a.attnum
  into is_published_attnum
  from pg_attribute a
  join pg_attrdef d
    on d.adrelid = a.attrelid
    and d.adnum = a.attnum
  where a.attrelid = 'public.classes'::regclass
    and a.attname = 'is_published'
    and a.atttypid = 'boolean'::regtype
    and a.atttypmod = -1
    and a.attnotnull
    and pg_get_expr(d.adbin, d.adrelid) in ('false', 'false::boolean')
    and a.attnum > 0
    and not a.attisdropped;

  if video_url_attnum is null
    or is_published_attnum is null
    or not exists (
      select 1
      from pg_constraint c
      where c.conrelid = 'public.classes'::regclass
        and c.conname = 'classes_published_video_url_check'
        and c.contype = 'c'
        and c.convalidated
        and cardinality(c.conkey) = 2
        and c.conkey @> array[video_url_attnum, is_published_attnum]::smallint[]
        and lower(pg_get_constraintdef(c.oid, true)) like '%not is_published%'
        and lower(pg_get_constraintdef(c.oid, true)) like '%video_url is not null%'
        and lower(pg_get_constraintdef(c.oid, true)) not like '%is_online%'
    )
  then
    raise exception using
      errcode = 'P0001',
      message = 'CLASS_DELIVERY_MODE_ROLLBACK_FAILED: 기존 공개 영상 제약 미복원';
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
      message = 'CLASS_DELIVERY_MODE_ROLLBACK_FAILED: 검사 클래스 행 잔존';
  end if;

  current_state := pg_temp.class_delivery_mode_snapshot();
  if (
    select jsonb_agg(key order by key)
    from jsonb_object_keys(current_state) as key
  ) is distinct from (
    select jsonb_agg(key order by key)
    from jsonb_object_keys(baseline->'state') as key
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'CLASS_DELIVERY_MODE_ROLLBACK_FAILED: baseline 상태 키 불일치';
  end if;

  for component in select jsonb_object_keys(baseline->'state')
  loop
    if current_state->component is distinct from baseline->'state'->component then
      raise exception using
        errcode = 'P0001',
        message = 'CLASS_DELIVERY_MODE_ROLLBACK_FAILED: 기존 클래스·RLS·정책·권한·Storage 정책 불일치: ' || component;
    end if;
  end loop;

  raise notice 'CLASS_DELIVERY_MODE_ROLLBACK_OK: is_online·검사 행 없음. 기존 공개 영상 제약과 클래스·RLS·정책·권한·Storage 정책 원본 일치.';
end;
$rollback_check$;

select 'CLASS_DELIVERY_MODE_ROLLBACK_OK' as result;
