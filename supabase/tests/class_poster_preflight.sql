-- 클래스 포스터 마이그레이션을 아직 적용하지 않은 DB에서 전체 실행한다.
-- 마지막 SQLSTATE P0001과 CLASS_POSTER_PREFLIGHT_OK 예외만 성공이다.
-- 성공 예외 DETAIL의 baseline JSON을 별도로 보관한 뒤 롤백 확인 SQL에 입력한다.
-- 실제 클래스·Storage 객체를 변경하지 않으며 성공 예외로 전체 롤백한다.
rollback;
begin;

do $prerequisite$
declare
  missing text[] := '{}';
begin
  if to_regclass('public.classes') is null then
    missing := array_append(missing, 'public.classes');
  end if;
  if to_regclass('public.products') is null then
    missing := array_append(missing, 'public.products');
  end if;
  if to_regclass('storage.buckets') is null then
    missing := array_append(missing, 'storage.buckets');
  end if;
  if to_regclass('storage.objects') is null then
    missing := array_append(missing, 'storage.objects');
  end if;

  if cardinality(missing) > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'CLASS_POSTER_PREFLIGHT_PREREQUISITE_FAILED: ' || array_to_string(missing, ', ');
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
      message = 'CLASS_POSTER_PREFLIGHT_ALREADY_APPLIED: classes 포스터 열 또는 제약이 이미 있습니다.';
  end if;

  if not (
    select relrowsecurity
    from pg_class
    where oid = 'public.classes'::regclass
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'CLASS_POSTER_PREFLIGHT_PREREQUISITE_FAILED: public.classes RLS 비활성';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.products'::regclass
      and conname = 'products_image_path_check'
      and pg_get_constraintdef(oid, true) like '%products/%'
      and pg_get_constraintdef(oid, true) like '%jpg|jpeg|png|webp%'
  ) or not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.products'::regclass
      and conname = 'products_image_alt_check'
      and pg_get_constraintdef(oid, true) like '%200%'
  ) or not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.products'::regclass
      and conname = 'products_image_requires_alt_check'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'CLASS_POSTER_PREFLIGHT_PREREQUISITE_FAILED: 상품 이미지의 기준 제약이 예상과 다릅니다.';
  end if;

  if not exists (
    select 1
    from storage.buckets
    where id = 'public-images'
      and name = 'public-images'
      and public
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'CLASS_POSTER_PREFLIGHT_PREREQUISITE_FAILED: public-images 공개 버킷 필요';
  end if;

  if (
    select count(*) = 4
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'public_images_select_admin',
        'public_images_insert_admin',
        'public_images_update_admin',
        'public_images_delete_admin'
      )
      and roles = array['authenticated']::name[]
  ) is not true
  or not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'public_images_insert_admin'
      and cmd = 'INSERT'
      and with_check like '%public-images%'
      and with_check like '%private.is_admin()%'
      and with_check not like '%foldername%'
  )
  or not has_table_privilege('authenticated', 'storage.objects', 'INSERT')
  then
    raise exception using
      errcode = 'P0001',
      message = 'CLASS_POSTER_PREFLIGHT_PREREQUISITE_FAILED: classes/를 포함하는 기존 Storage 관리자 정책 필요';
  end if;
end;
$prerequisite$;

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

create temporary table class_poster_test_ids (
  id uuid primary key
);
insert into class_poster_test_ids (id) values
  ('ffffffff-ffff-4fff-8fff-fffffffff001'),
  ('ffffffff-ffff-4fff-8fff-fffffffff002'),
  ('ffffffff-ffff-4fff-8fff-fffffffff003'),
  ('ffffffff-ffff-4fff-8fff-fffffffff004'),
  ('ffffffff-ffff-4fff-8fff-fffffffff005');

do $collision$
begin
  if exists (
    select 1
    from public.classes
    where id in (select id from class_poster_test_ids)
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'CLASS_POSTER_PREFLIGHT_PREREQUISITE_FAILED: 검사 UUID 충돌';
  end if;
end;
$collision$;

create temporary table class_poster_baseline as
select jsonb_build_object(
  'format', 'class-poster-preflight-v1',
  'eligible', true,
  'state', pg_temp.class_poster_snapshot(),
  'test_ids', (
    select jsonb_agg(id::text order by id::text)
    from class_poster_test_ids
  )
) as snapshot;

create temporary table class_poster_results (
  label text not null
);

create function pg_temp.class_poster_assert(ok boolean, label text)
returns void
language plpgsql
security invoker
as $$
begin
  if ok is distinct from true then
    raise exception 'CLASS_POSTER_ASSERT_FAILED: %', label;
  end if;
  insert into pg_temp.class_poster_results values (label);
end;
$$;

create function pg_temp.class_poster_expected_error(
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
    insert into pg_temp.class_poster_results values (label);
    return;
  end;
  raise exception 'CLASS_POSTER_EXPECTED_ERROR_MISSING: %', label;
end;
$$;

-- BEGIN EXACT MIGRATION
-- 클래스 포스터의 public-images 상대 경로와 대체 설명을 저장한다. 실제 이미지·강의 자료는 넣지 않는다.
do $prerequisite$
begin
  if to_regclass('public.classes') is null then
    raise exception using
      errcode = 'P0001',
      message = 'CLASS_POSTER_SCHEMA_PREREQUISITE_FAILED: public.classes가 없습니다.';
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
      message = 'CLASS_POSTER_SCHEMA_ALREADY_EXISTS: classes 포스터 열 또는 제약이 이미 있습니다.';
  end if;
end;
$prerequisite$;

alter table public.classes
add column poster_path text,
add column poster_alt text,
add constraint classes_poster_path_check
  check (
    poster_path ~ '^classes/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
  ),
add constraint classes_poster_alt_check
  check (
    poster_alt is null
    or (
      poster_alt ~ '[^[:space:]]'
      and char_length(poster_alt) <= 200
    )
  ),
add constraint classes_poster_requires_alt_check
  check (poster_path is null or poster_alt is not null);
-- END EXACT MIGRATION

select pg_temp.class_poster_assert(
  pg_temp.class_poster_snapshot() = (
    select snapshot->'state'
    from class_poster_baseline
  ),
  '기존 클래스 행·구조·정책·권한·Storage 보존'
);

select pg_temp.class_poster_assert(
  (
    select count(*) = 2
      and bool_and(format_type(atttypid, atttypmod) = 'text')
      and bool_and(not attnotnull)
      and bool_and(not atthasdef)
    from pg_attribute
    where attrelid = 'public.classes'::regclass
      and attname in ('poster_path', 'poster_alt')
      and attnum > 0
      and not attisdropped
  ),
  '포스터 경로·대체 설명 text NULL 허용'
);

select pg_temp.class_poster_assert(
  (
    select count(*) = 3
      and bool_and(contype = 'c')
      and bool_and(convalidated)
    from pg_constraint
    where conrelid = 'public.classes'::regclass
      and conname in (
        'classes_poster_path_check',
        'classes_poster_alt_check',
        'classes_poster_requires_alt_check'
      )
  ),
  '포스터 CHECK 세 개 생성'
);

select pg_temp.class_poster_assert(
  coalesce((
    select bool_and(poster_path is null and poster_alt is null)
    from public.classes
  ), true),
  '기존 클래스 포스터 NULL 유지'
);

insert into public.classes (id, title, description, field)
values (
  'ffffffff-ffff-4fff-8fff-fffffffff001',
  '포스터 없는 테스트 클래스',
  '테스트 설명',
  'saju'
);
select pg_temp.class_poster_assert(
  (
    select poster_path is null and poster_alt is null
    from public.classes
    where id = 'ffffffff-ffff-4fff-8fff-fffffffff001'
  ),
  '포스터 없는 클래스 등록 허용'
);

update public.classes
set description = '수정된 테스트 설명'
where id = 'ffffffff-ffff-4fff-8fff-fffffffff001';
select pg_temp.class_poster_assert(
  (
    select
      description = '수정된 테스트 설명'
      and poster_path is null
      and poster_alt is null
    from public.classes
    where id = 'ffffffff-ffff-4fff-8fff-fffffffff001'
  ),
  '포스터 없는 클래스 편집 허용'
);

select pg_temp.class_poster_expected_error(
  $$insert into public.classes (title, description, field, poster_path)
    values ('테스트', '설명', 'saju', 'classes/123e4567-e89b-42d3-a456-426614174000.jpg')$$,
  '23514',
  '포스터 경로에 대체 설명 필수'
);
select pg_temp.class_poster_expected_error(
  $$insert into public.classes (title, description, field, poster_alt)
    values ('테스트', '설명', 'saju', E' \t\n')$$,
  '23514',
  '공백 대체 설명 거부'
);
select pg_temp.class_poster_expected_error(
  $$insert into public.classes (title, description, field, poster_alt)
    values ('테스트', '설명', 'saju', repeat('가', 201))$$,
  '23514',
  '201자 대체 설명 거부'
);

do $invalid_paths$
declare
  invalid_path text;
begin
  foreach invalid_path in array array[
    '',
    'https://example.invalid/classes/123e4567-e89b-42d3-a456-426614174000.jpg',
    'public-images/classes/123e4567-e89b-42d3-a456-426614174000.jpg',
    'products/123e4567-e89b-42d3-a456-426614174000.jpg',
    'classes/../products/123e4567-e89b-42d3-a456-426614174000.jpg',
    'classes/123E4567-E89B-42D3-A456-426614174000.jpg',
    'classes/123e4567-e89b-42d3-a456-426614174000.gif',
    'classes/not-a-uuid.png',
    '/classes/123e4567-e89b-42d3-a456-426614174000.webp',
    'classes//123e4567-e89b-42d3-a456-426614174000.webp'
  ]
  loop
    perform pg_temp.class_poster_expected_error(
      format(
        'insert into public.classes (title, description, field, poster_path, poster_alt) values (%L, %L, %L, %L, %L)',
        '테스트',
        '설명',
        'saju',
        invalid_path,
        '대체 설명'
      ),
      '23514',
      '클래스 포스터 경로 거부: ' || left(invalid_path, 60)
    );
  end loop;
end;
$invalid_paths$;

do $valid_extensions$
declare
  extension text;
  test_id uuid;
  sequence_number integer := 2;
begin
  foreach extension in array array['jpg', 'jpeg', 'png', 'webp']
  loop
    select id
    into test_id
    from class_poster_test_ids
    order by id
    offset (sequence_number - 1)
    limit 1;

    execute format(
      'insert into public.classes (id, title, description, field, poster_path, poster_alt) values (%L, %L, %L, %L, %L, %L)',
      test_id,
      '확장자 테스트 ' || extension,
      '설명',
      'tarot',
      'classes/' || test_id::text || '.' || extension,
      repeat('가', 200)
    );
    sequence_number := sequence_number + 1;
  end loop;
end;
$valid_extensions$;

select pg_temp.class_poster_assert(
  (
    select count(*) = 4
      and bool_and(char_length(poster_alt) = 200)
    from public.classes
    where id in (
      select id
      from class_poster_test_ids
      where id <> 'ffffffff-ffff-4fff-8fff-fffffffff001'
    )
  ),
  '상품 이미지와 같은 네 확장자·200자 대체 설명 허용'
);

update public.classes
set
  poster_path = 'classes/123e4567-e89b-42d3-a456-426614174000.webp',
  poster_alt = '테스트 포스터'
where id = 'ffffffff-ffff-4fff-8fff-fffffffff001';
update public.classes
set
  poster_path = null,
  poster_alt = null
where id = 'ffffffff-ffff-4fff-8fff-fffffffff001';
select pg_temp.class_poster_assert(
  (
    select poster_path is null and poster_alt is null
    from public.classes
    where id = 'ffffffff-ffff-4fff-8fff-fffffffff001'
  ),
  '포스터 선택·해제 편집 허용'
);

delete from public.classes
where id in (select id from class_poster_test_ids);

select pg_temp.class_poster_assert(
  pg_temp.class_poster_snapshot() = (
    select snapshot->'state'
    from class_poster_baseline
  ),
  '검사 행 정리 후 기존 클래스·Storage 원본 일치'
);

do $success$
declare
  total integer;
  baseline jsonb;
begin
  select count(*) into total from class_poster_results;
  select snapshot into baseline from class_poster_baseline;

  raise exception using
    errcode = 'P0001',
    message = format(
      'CLASS_POSTER_PREFLIGHT_OK: 검사 %s개 통과. 기존 클래스 행·정책·권한·Storage 보존, 포스터 없는 행 허용, classes 상대 경로·대체 설명 제약 통과. 실제 Storage API·파일 존재·MIME·크기·클래스 UI 미검증. 의도된 전체 롤백.',
      total
    ),
    detail = baseline::text;
end;
$success$;
