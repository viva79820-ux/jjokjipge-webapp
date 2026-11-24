-- 온라인·오프라인 구분을 아직 적용하지 않은 DB에서 전체 실행한다.
-- 마지막 SQLSTATE P0001과 CLASS_DELIVERY_MODE_PREFLIGHT_OK 예외만 성공이다.
-- 성공 예외 DETAIL의 baseline JSON을 별도로 보관한 뒤 롤백 확인 SQL에 입력한다.
-- 실제 클래스 행·정책·권한·Storage 정책을 변경하지 않으며 성공 예외로 전체 롤백한다.
rollback;
begin;

do $prerequisite$
declare
  video_url_attnum smallint;
  is_published_attnum smallint;
begin
  if to_regclass('public.classes') is null then
    raise exception using
      errcode = 'P0001',
      message = 'CLASS_DELIVERY_MODE_PREFLIGHT_PREREQUISITE_FAILED: public.classes가 없습니다.';
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
      message = 'CLASS_DELIVERY_MODE_PREFLIGHT_ALREADY_APPLIED: public.classes.is_online';
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

  if video_url_attnum is null or is_published_attnum is null then
    raise exception using
      errcode = 'P0001',
      message = 'CLASS_DELIVERY_MODE_PREFLIGHT_PREREQUISITE_FAILED: video_url 또는 is_published 열 정의가 예상과 다릅니다.';
  end if;

  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.classes'::regclass
      and c.conname = 'classes_video_url_check'
      and c.contype = 'c'
      and c.convalidated
      and c.conkey = array[video_url_attnum]::smallint[]
      and pg_get_constraintdef(c.oid, true) like '%2048%'
      and pg_get_constraintdef(c.oid, true) like '%^https://%'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'CLASS_DELIVERY_MODE_PREFLIGHT_PREREQUISITE_FAILED: classes_video_url_check 정의가 예상과 다릅니다.';
  end if;

  if not exists (
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
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'CLASS_DELIVERY_MODE_PREFLIGHT_PREREQUISITE_FAILED: classes_published_video_url_check 정의가 예상과 다릅니다.';
  end if;

  if not (
    select relrowsecurity
    from pg_class
    where oid = 'public.classes'::regclass
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'CLASS_DELIVERY_MODE_PREFLIGHT_PREREQUISITE_FAILED: public.classes RLS 비활성';
  end if;

  if to_regclass('storage.objects') is null then
    raise exception using
      errcode = 'P0001',
      message = 'CLASS_DELIVERY_MODE_PREFLIGHT_PREREQUISITE_FAILED: storage.objects가 없습니다.';
  end if;
end;
$prerequisite$;

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

create temporary table class_delivery_mode_test_ids (
  id uuid primary key
);
insert into class_delivery_mode_test_ids (id) values
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeea001'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeea002');

do $collision$
begin
  if exists (
    select 1
    from public.classes
    where id in (select id from class_delivery_mode_test_ids)
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'CLASS_DELIVERY_MODE_PREFLIGHT_PREREQUISITE_FAILED: 검사 UUID 충돌';
  end if;
end;
$collision$;

create temporary table class_delivery_mode_baseline as
select jsonb_build_object(
  'format', 'class-delivery-mode-preflight-v1',
  'eligible', true,
  'state', pg_temp.class_delivery_mode_snapshot(),
  'test_ids', (
    select jsonb_agg(id::text order by id::text)
    from class_delivery_mode_test_ids
  )
) as snapshot;

create temporary table class_delivery_mode_results (
  label text not null
);

create function pg_temp.class_delivery_mode_assert(ok boolean, label text)
returns void
language plpgsql
security invoker
as $$
begin
  if ok is distinct from true then
    raise exception 'CLASS_DELIVERY_MODE_ASSERT_FAILED: %', label;
  end if;
  insert into pg_temp.class_delivery_mode_results values (label);
end;
$$;

create function pg_temp.class_delivery_mode_expected_error(
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
    insert into pg_temp.class_delivery_mode_results values (label);
    return;
  end;
  raise exception 'CLASS_DELIVERY_MODE_EXPECTED_ERROR_MISSING: %', label;
end;
$$;

-- BEGIN EXACT MIGRATION
-- 클래스의 온라인·오프라인 구분을 추가한다. 기존 클래스는 모두 온라인으로 유지한다.
do $prerequisite$
declare
  video_url_attnum smallint;
  is_published_attnum smallint;
begin
  if to_regclass('public.classes') is null then
    raise exception using
      errcode = 'P0001',
      message = 'CLASS_DELIVERY_MODE_PREREQUISITE_FAILED: public.classes가 없습니다.';
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
      message = 'CLASS_DELIVERY_MODE_ALREADY_EXISTS: public.classes.is_online';
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

  if video_url_attnum is null or is_published_attnum is null then
    raise exception using
      errcode = 'P0001',
      message = 'CLASS_DELIVERY_MODE_PREREQUISITE_FAILED: video_url 또는 is_published 열 정의가 예상과 다릅니다.';
  end if;

  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.classes'::regclass
      and c.conname = 'classes_video_url_check'
      and c.contype = 'c'
      and c.convalidated
      and c.conkey = array[video_url_attnum]::smallint[]
      and pg_get_constraintdef(c.oid, true) like '%2048%'
      and pg_get_constraintdef(c.oid, true) like '%^https://%'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'CLASS_DELIVERY_MODE_PREREQUISITE_FAILED: classes_video_url_check 정의가 예상과 다릅니다.';
  end if;

  if not exists (
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
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'CLASS_DELIVERY_MODE_PREREQUISITE_FAILED: classes_published_video_url_check 정의가 예상과 다릅니다.';
  end if;

  if not (
    select relrowsecurity
    from pg_class
    where oid = 'public.classes'::regclass
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'CLASS_DELIVERY_MODE_PREREQUISITE_FAILED: public.classes RLS 비활성';
  end if;
end;
$prerequisite$;

alter table public.classes
add column is_online boolean not null default true,
drop constraint classes_published_video_url_check,
add constraint classes_published_video_url_check
  check (not is_published or not is_online or video_url is not null);
-- END EXACT MIGRATION

select pg_temp.class_delivery_mode_assert(
  pg_temp.class_delivery_mode_snapshot() = (
    select snapshot->'state'
    from class_delivery_mode_baseline
  ),
  '기존 클래스 행·구조·RLS·정책·권한·Storage 정책 보존'
);

select pg_temp.class_delivery_mode_assert(
  (
    select
      format_type(a.atttypid, a.atttypmod) = 'boolean'
      and a.attnotnull
      and pg_get_expr(d.adbin, d.adrelid) in ('true', 'true::boolean')
    from pg_attribute a
    join pg_attrdef d
      on d.adrelid = a.attrelid
      and d.adnum = a.attnum
    where a.attrelid = 'public.classes'::regclass
      and a.attname = 'is_online'
      and a.attnum > 0
      and not a.attisdropped
  ),
  '온라인 구분 boolean NOT NULL 기본값 true'
);

select pg_temp.class_delivery_mode_assert(
  coalesce((select bool_and(is_online) from public.classes), true),
  '기존 클래스 모두 온라인으로 보존'
);

select pg_temp.class_delivery_mode_assert(
  (
    select count(*) = 1
      and bool_and(c.contype = 'c')
      and bool_and(c.convalidated)
      and bool_and(lower(pg_get_constraintdef(c.oid, true)) like '%not is_published%')
      and bool_and(lower(pg_get_constraintdef(c.oid, true)) like '%not is_online%')
      and bool_and(lower(pg_get_constraintdef(c.oid, true)) like '%video_url is not null%')
    from pg_constraint c
    where c.conrelid = 'public.classes'::regclass
      and c.conname = 'classes_published_video_url_check'
  ),
  '공개 온라인 클래스만 영상 필수'
);

insert into public.classes (
  id,
  title,
  description,
  field,
  is_online,
  is_published
)
values (
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeea001',
  '오프라인 테스트 클래스',
  '테스트 설명',
  'saju',
  false,
  true
);
select pg_temp.class_delivery_mode_assert(
  (
    select not is_online and is_published and video_url is null
    from public.classes
    where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeea001'
  ),
  '공개 오프라인 클래스 영상 없이 저장'
);

select pg_temp.class_delivery_mode_expected_error(
  $$insert into public.classes (title, description, field, is_online, is_published)
    values ('온라인 테스트 클래스', '테스트 설명', 'tarot', true, true)$$,
  '23514',
  '공개 온라인 클래스 영상 NULL 거부'
);

select pg_temp.class_delivery_mode_expected_error(
  $$insert into public.classes (title, description, field, video_url, is_online, is_published)
    values ('온라인 테스트 클래스', '테스트 설명', 'tarot', 'http://example.invalid/video', true, true)$$,
  '23514',
  '공개 온라인 클래스 비 HTTPS 영상 거부'
);

insert into public.classes (
  id,
  title,
  description,
  field,
  video_url,
  is_online,
  is_published
)
values (
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeea002',
  '온라인 테스트 클래스',
  '테스트 설명',
  'tarot',
  'https://example.invalid/video?id=class-test',
  true,
  true
);
select pg_temp.class_delivery_mode_assert(
  (
    select is_online and is_published and video_url like 'https://%'
    from public.classes
    where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeea002'
  ),
  '공개 온라인 클래스 유효한 HTTPS 영상 저장'
);

delete from public.classes
where id in (select id from class_delivery_mode_test_ids);

select pg_temp.class_delivery_mode_assert(
  pg_temp.class_delivery_mode_snapshot() = (
    select snapshot->'state'
    from class_delivery_mode_baseline
  ),
  '검사 행 정리 후 기존 클래스·RLS·정책·권한·Storage 정책 원본 일치'
);

do $success$
declare
  total integer;
  baseline jsonb;
begin
  select count(*) into total from class_delivery_mode_results;
  select snapshot into baseline from class_delivery_mode_baseline;

  raise exception using
    errcode = 'P0001',
    message = format(
      'CLASS_DELIVERY_MODE_PREFLIGHT_OK: 검사 %s개 통과. 기존 클래스는 온라인으로 보존, 공개 오프라인 영상 NULL 허용, 공개 온라인 HTTPS 영상 필수, 기존 RLS·정책·권한·Storage 정책 보존. 의도된 전체 롤백.',
      total
    ),
    detail = baseline::text;
end;
$success$;
