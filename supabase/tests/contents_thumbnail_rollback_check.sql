-- CONTENTS_THUMBNAIL_PREFLIGHT_OK(P0001)를 확인한 경우에만 별도로 전체 실행한다.
-- 성공 예외 DETAIL의 JSON을 아래 null 대신 $baseline$...$baseline$::jsonb로 붙여 넣는다.
-- 저장소 원본의 baseline은 null로 유지하고 실행 결과 JSON을 커밋하지 않는다.
-- 첫 ROLLBACK은 사전 검사의 의도된 예외로 중단된 트랜잭션을 종료한다.
rollback;

-- BEGIN EXACT SNAPSHOT
-- 새 열·제약과 교체 대상 정렬 인덱스를 구분해 기존 콘텐츠와 Storage 상태를 기록한다.
create or replace function pg_temp.contents_thumbnail_snapshot()
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
      md5((to_jsonb(c) - 'thumbnail_path' - 'thumbnail_alt' - 'posted_on')::text),
      '' order by c.id::text
    ), ''))
  )
  into component
  from public.contents c;
  state := state || jsonb_build_object('contents_rows', component);

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
    where a.attrelid = 'public.contents'::regclass
      and a.attnum > 0
      and not a.attisdropped
      and a.attname not in ('thumbnail_path', 'thumbnail_alt', 'posted_on')
  ) s;
  state := state || jsonb_build_object('contents_existing_columns', component);

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
    where c.conrelid = 'public.contents'::regclass
      and c.conname not in (
        'contents_thumbnail_path_check',
        'contents_thumbnail_alt_check',
        'contents_thumbnail_requires_alt_check'
      )
  ) s;
  state := state || jsonb_build_object('contents_existing_constraints', component);

  select to_jsonb(s)
  into component
  from (
    select c.relrowsecurity, c.relforcerowsecurity, c.relowner
    from pg_class c
    where c.oid = 'public.contents'::regclass
  ) s;
  state := state || jsonb_build_object('contents_rls', component);

  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(md5(to_jsonb(i)::text), '' order by i.indexname), ''))
  )
  into component
  from pg_indexes i
  where i.schemaname = 'public'
    and i.tablename = 'contents'
    and i.indexname <> 'contents_published_sort_idx';
  state := state || jsonb_build_object('contents_other_indexes', component);

  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(md5(to_jsonb(i)::text), '' order by i.indexname), '')),
    'definition', max(i.indexdef)
  )
  into component
  from pg_indexes i
  where i.schemaname = 'public'
    and i.tablename = 'contents'
    and i.indexname = 'contents_published_sort_idx';
  state := state || jsonb_build_object('contents_ordering_index', component);

  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(md5(to_jsonb(p)::text), '' order by p.policyname), ''))
  )
  into component
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename = 'contents';
  state := state || jsonb_build_object('contents_policies', component);

  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(md5(to_jsonb(s)::text), '' order by s.tgname), ''))
  )
  into component
  from (
    select t.tgname, t.tgenabled, pg_get_triggerdef(t.oid, true) as definition
    from pg_trigger t
    where t.tgrelid = 'public.contents'::regclass
      and not t.tgisinternal
  ) s;
  state := state || jsonb_build_object('contents_triggers', component);

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
    where c.oid = 'public.contents'::regclass
  ) s;
  state := state || jsonb_build_object('contents_table_grants', component);

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
    where a.attrelid = 'public.contents'::regclass
      and a.attnum > 0
      and not a.attisdropped
      and a.attname not in ('thumbnail_path', 'thumbnail_alt', 'posted_on')
  ) s;
  state := state || jsonb_build_object('contents_existing_column_grants', component);

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
    or baseline->>'format' is distinct from 'contents-thumbnail-preflight-v1'
    or baseline->'eligible' is distinct from 'true'::jsonb
    or jsonb_typeof(baseline->'state') is distinct from 'object'
    or jsonb_typeof(baseline->'test_ids') is distinct from 'array'
  then
    raise exception using
      errcode = 'P0001',
      message = 'CONTENTS_THUMBNAIL_ROLLBACK_BASELINE_REQUIRED: 지정 성공 예외 DETAIL 원본이 필요합니다.';
  end if;

  if to_regclass('public.contents') is null
    or to_regclass('storage.buckets') is null
    or to_regclass('storage.objects') is null
  then
    raise exception using
      errcode = 'P0001',
      message = 'CONTENTS_THUMBNAIL_ROLLBACK_FAILED: 기존 contents 또는 Storage 객체 없음';
  end if;

  if exists (
    select 1
    from pg_attribute
    where attrelid = 'public.contents'::regclass
      and attname in ('thumbnail_path', 'thumbnail_alt', 'posted_on')
      and attnum > 0
      and not attisdropped
  ) or exists (
    select 1
    from pg_constraint
    where conrelid = 'public.contents'::regclass
      and conname in (
        'contents_thumbnail_path_check',
        'contents_thumbnail_alt_check',
        'contents_thumbnail_requires_alt_check'
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'CONTENTS_THUMBNAIL_ROLLBACK_FAILED: 썸네일 열 또는 제약 잔존';
  end if;

  if to_regclass('public.contents_published_sort_idx') is null
    or not exists (
      select 1
      from pg_index i
      where i.indexrelid = 'public.contents_published_sort_idx'::regclass
        and i.indrelid = 'public.contents'::regclass
        and i.indisvalid
        and i.indisready
        and not i.indisunique
        and not i.indisprimary
        and not i.indisexclusion
        and i.indnkeyatts = 4
        and i.indexprs is null
        and i.indpred is null
        and pg_get_indexdef(i.indexrelid) =
          'CREATE INDEX contents_published_sort_idx ON public.contents USING btree (is_published, sort_order, created_at DESC, id DESC)'
    )
  then
    raise exception using
      errcode = 'P0001',
      message = 'CONTENTS_THUMBNAIL_ROLLBACK_FAILED: 기존 contents_published_sort_idx 미복원';
  end if;

  if exists (
    select 1
    from public.contents
    where id in (
      select value::uuid
      from jsonb_array_elements_text(baseline->'test_ids')
    )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'CONTENTS_THUMBNAIL_ROLLBACK_FAILED: 검사 콘텐츠 행 잔존';
  end if;

  current_state := pg_temp.contents_thumbnail_snapshot();
  if (
    select jsonb_agg(key order by key)
    from jsonb_object_keys(current_state) as key
  ) is distinct from (
    select jsonb_agg(key order by key)
    from jsonb_object_keys(baseline->'state') as key
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'CONTENTS_THUMBNAIL_ROLLBACK_FAILED: baseline 상태 키 불일치';
  end if;

  for component in select jsonb_object_keys(baseline->'state')
  loop
    if current_state->component is distinct from baseline->'state'->component then
      raise exception using
        errcode = 'P0001',
        message = 'CONTENTS_THUMBNAIL_ROLLBACK_FAILED: 기존 콘텐츠·Storage 불일치: ' || component;
    end if;
  end loop;

  raise notice 'CONTENTS_THUMBNAIL_ROLLBACK_OK: 썸네일 열·제약·검사 행 없음. 기존 정렬 인덱스와 콘텐츠 행·구조·RLS·정책·권한·트리거·Storage 원본 일치.';
end;
$rollback_check$;

select 'CONTENTS_THUMBNAIL_ROLLBACK_OK' as result;

-- 운영 역방향 SQL(마이그레이션 적용 후 되돌릴 때만 검토·백업 후 별도 실행):
-- begin;
-- drop index public.contents_published_sort_idx;
-- create index contents_published_sort_idx
-- on public.contents (is_published, sort_order, created_at desc, id desc);
-- alter table public.contents
-- drop constraint contents_thumbnail_requires_alt_check,
-- drop constraint contents_thumbnail_alt_check,
-- drop constraint contents_thumbnail_path_check,
-- drop column posted_on,
-- drop column thumbnail_alt,
-- drop column thumbnail_path;
-- commit;
