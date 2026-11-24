-- 콘텐츠 썸네일 마이그레이션을 아직 적용하지 않은 DB에서 전체 실행한다.
-- 마지막 SQLSTATE P0001과 CONTENTS_THUMBNAIL_PREFLIGHT_OK 예외만 성공이다.
-- 성공 예외 DETAIL의 baseline JSON을 별도로 보관한 뒤 롤백 확인 SQL에 입력한다.
-- 실제 콘텐츠·Storage 객체를 변경하지 않으며 성공 예외로 전체 롤백한다.
rollback;
begin;

do $prerequisite$
declare
  missing text[] := '{}';
begin
  if to_regclass('public.contents') is null then
    missing := array_append(missing, 'public.contents');
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
      message = 'CONTENTS_THUMBNAIL_PREFLIGHT_PREREQUISITE_FAILED: ' || array_to_string(missing, ', ');
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
      message = 'CONTENTS_THUMBNAIL_PREFLIGHT_ALREADY_APPLIED: contents 썸네일 열 또는 제약이 이미 있습니다.';
  end if;

  if not (
    select relrowsecurity
    from pg_class
    where oid = 'public.contents'::regclass
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'CONTENTS_THUMBNAIL_PREFLIGHT_PREREQUISITE_FAILED: public.contents RLS 비활성';
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
      message = 'CONTENTS_THUMBNAIL_PREFLIGHT_PREREQUISITE_FAILED: contents_published_sort_idx 정의가 예상과 다릅니다.';
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
      message = 'CONTENTS_THUMBNAIL_PREFLIGHT_PREREQUISITE_FAILED: public-images 공개 버킷 필요';
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
      message = 'CONTENTS_THUMBNAIL_PREFLIGHT_PREREQUISITE_FAILED: contents/를 포함하는 기존 Storage 관리자 정책 필요';
  end if;
end;
$prerequisite$;

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

create temporary table contents_thumbnail_test_ids (
  id uuid primary key
);
insert into contents_thumbnail_test_ids (id) values
  ('cccccccc-cccc-4ccc-8ccc-ccccccccc001'),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccc002'),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccc003'),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccc004'),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccc005'),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccc006');

do $collision$
begin
  if exists (
    select 1
    from public.contents
    where id in (select id from contents_thumbnail_test_ids)
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'CONTENTS_THUMBNAIL_PREFLIGHT_PREREQUISITE_FAILED: 검사 UUID 충돌';
  end if;
end;
$collision$;

create temporary table contents_thumbnail_baseline as
select jsonb_build_object(
  'format', 'contents-thumbnail-preflight-v1',
  'eligible', true,
  'state', pg_temp.contents_thumbnail_snapshot(),
  'test_ids', (
    select jsonb_agg(id::text order by id::text)
    from contents_thumbnail_test_ids
  )
) as snapshot;

create temporary table contents_thumbnail_results (
  label text not null
);

create function pg_temp.contents_thumbnail_assert(ok boolean, label text)
returns void
language plpgsql
security invoker
as $$
begin
  if ok is distinct from true then
    raise exception 'CONTENTS_THUMBNAIL_ASSERT_FAILED: %', label;
  end if;
  insert into pg_temp.contents_thumbnail_results values (label);
end;
$$;

create function pg_temp.contents_thumbnail_expected_error(
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
    insert into pg_temp.contents_thumbnail_results values (label);
    return;
  end;
  raise exception 'CONTENTS_THUMBNAIL_EXPECTED_ERROR_MISSING: %', label;
end;
$$;

-- BEGIN EXACT MIGRATION
-- 콘텐츠 썸네일 상대 경로·대체 설명·게시일을 추가하고 목록 정렬 인덱스를 교체한다.
do $prerequisite$
begin
  if to_regclass('public.contents') is null then
    raise exception using
      errcode = 'P0001',
      message = 'CONTENTS_THUMBNAIL_SCHEMA_PREREQUISITE_FAILED: public.contents가 없습니다.';
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
      message = 'CONTENTS_THUMBNAIL_SCHEMA_ALREADY_EXISTS: contents 썸네일 열 또는 제약이 이미 있습니다.';
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
      message = 'CONTENTS_THUMBNAIL_SCHEMA_PREREQUISITE_FAILED: contents_published_sort_idx 정의가 예상과 다릅니다.';
  end if;
end;
$prerequisite$;

alter table public.contents
add column thumbnail_path text,
add column thumbnail_alt text,
add column posted_on date,
add constraint contents_thumbnail_path_check
  check (
    thumbnail_path ~ '^contents/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
  ),
add constraint contents_thumbnail_alt_check
  check (
    thumbnail_alt is null
    or (
      thumbnail_alt ~ '[^[:space:]]'
      and char_length(thumbnail_alt) <= 200
    )
  ),
add constraint contents_thumbnail_requires_alt_check
  check (thumbnail_path is null or thumbnail_alt is not null);

drop index public.contents_published_sort_idx;

create index contents_published_sort_idx
on public.contents (
  is_published,
  sort_order asc,
  posted_on desc nulls last,
  id desc
);
-- END EXACT MIGRATION

select pg_temp.contents_thumbnail_assert(
  (pg_temp.contents_thumbnail_snapshot() - 'contents_ordering_index') = (
    select (snapshot->'state') - 'contents_ordering_index'::text
    from contents_thumbnail_baseline
  ),
  '기존 콘텐츠 행·구조·RLS·정책·권한·트리거·기타 인덱스·Storage 보존'
);

select pg_temp.contents_thumbnail_assert(
  (
    select count(*) = 3
      and count(*) filter (
        where attname in ('thumbnail_path', 'thumbnail_alt')
          and format_type(atttypid, atttypmod) = 'text'
      ) = 2
      and count(*) filter (
        where attname = 'posted_on'
          and format_type(atttypid, atttypmod) = 'date'
      ) = 1
      and bool_and(not attnotnull)
      and bool_and(not atthasdef)
    from pg_attribute
    where attrelid = 'public.contents'::regclass
      and attname in ('thumbnail_path', 'thumbnail_alt', 'posted_on')
      and attnum > 0
      and not attisdropped
  ),
  '썸네일 경로·대체 설명 text와 게시일 date NULL 허용'
);

select pg_temp.contents_thumbnail_assert(
  (
    select count(*) = 3
      and bool_and(contype = 'c')
      and bool_and(convalidated)
    from pg_constraint
    where conrelid = 'public.contents'::regclass
      and conname in (
        'contents_thumbnail_path_check',
        'contents_thumbnail_alt_check',
        'contents_thumbnail_requires_alt_check'
      )
  ),
  '썸네일 CHECK 세 개 생성'
);

select pg_temp.contents_thumbnail_assert(
  coalesce((
    select bool_and(
      thumbnail_path is null
      and thumbnail_alt is null
      and posted_on is null
    )
    from public.contents
  ), true),
  '기존 콘텐츠 썸네일·게시일 NULL 유지'
);

select pg_temp.contents_thumbnail_assert(
  (
    select count(*) = 1
      and bool_and(
        pg_get_indexdef(i.indexrelid) =
          'CREATE INDEX contents_published_sort_idx ON public.contents USING btree (is_published, sort_order, posted_on DESC NULLS LAST, id DESC)'
      )
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
  ),
  '게시일 기준 콘텐츠 공개·정렬 인덱스 교체'
);

insert into public.contents (
  id,
  title,
  channel,
  external_url
)
values (
  'cccccccc-cccc-4ccc-8ccc-ccccccccc001',
  '썸네일 없는 테스트 콘텐츠',
  'blog',
  'https://example.invalid/legacy'
);
select pg_temp.contents_thumbnail_assert(
  (
    select
      thumbnail_path is null
      and thumbnail_alt is null
      and posted_on is null
    from public.contents
    where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccc001'
  ),
  '썸네일·게시일 없는 콘텐츠 등록 허용'
);

update public.contents
set description = '수정된 테스트 설명'
where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccc001';
select pg_temp.contents_thumbnail_assert(
  (
    select
      description = '수정된 테스트 설명'
      and thumbnail_path is null
      and thumbnail_alt is null
      and posted_on is null
    from public.contents
    where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccc001'
  ),
  '썸네일·게시일 없는 콘텐츠 편집 허용'
);

select pg_temp.contents_thumbnail_expected_error(
  $$insert into public.contents (title, channel, thumbnail_path)
    values ('테스트', 'blog', 'contents/123e4567-e89b-42d3-a456-426614174000.jpg')$$,
  '23514',
  '썸네일 경로에 대체 설명 필수'
);
select pg_temp.contents_thumbnail_expected_error(
  $$insert into public.contents (title, channel, thumbnail_alt)
    values ('테스트', 'blog', E' \t\n')$$,
  '23514',
  '공백 대체 설명 거부'
);
select pg_temp.contents_thumbnail_expected_error(
  $$insert into public.contents (title, channel, thumbnail_alt)
    values ('테스트', 'blog', repeat('가', 201))$$,
  '23514',
  '201자 대체 설명 거부'
);
select pg_temp.contents_thumbnail_expected_error(
  $$insert into public.contents (title, channel, posted_on)
    values ('테스트', 'blog', '2026-02-30')$$,
  '22008',
  '유효하지 않은 게시일 거부'
);

do $invalid_paths$
declare
  invalid_path text;
begin
  foreach invalid_path in array array[
    '',
    'https://example.invalid/contents/123e4567-e89b-42d3-a456-426614174000.jpg',
    'public-images/contents/123e4567-e89b-42d3-a456-426614174000.jpg',
    'classes/123e4567-e89b-42d3-a456-426614174000.jpg',
    'contents/../classes/123e4567-e89b-42d3-a456-426614174000.jpg',
    'contents/123E4567-E89B-42D3-A456-426614174000.jpg',
    'contents/123e4567-e89b-42d3-a456-426614174000.gif',
    'contents/not-a-uuid.png',
    '/contents/123e4567-e89b-42d3-a456-426614174000.webp',
    'contents//123e4567-e89b-42d3-a456-426614174000.webp'
  ]
  loop
    perform pg_temp.contents_thumbnail_expected_error(
      format(
        'insert into public.contents (title, channel, thumbnail_path, thumbnail_alt) values (%L, %L, %L, %L)',
        '테스트',
        'blog',
        invalid_path,
        '대체 설명'
      ),
      '23514',
      '콘텐츠 썸네일 경로 거부: ' || left(invalid_path, 60)
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
    from contents_thumbnail_test_ids
    order by id
    offset (sequence_number - 1)
    limit 1;

    execute format(
      'insert into public.contents (id, title, channel, external_url, thumbnail_path, thumbnail_alt, is_published, sort_order) values (%L, %L, %L, %L, %L, %L, true, 1)',
      test_id,
      '확장자 테스트 ' || extension,
      'youtube',
      'https://example.invalid/' || extension,
      'contents/' || test_id::text || '.' || extension,
      repeat('가', 200)
    );
    sequence_number := sequence_number + 1;
  end loop;
end;
$valid_extensions$;

update public.contents
set posted_on = case id
  when 'cccccccc-cccc-4ccc-8ccc-ccccccccc002' then date '2026-11-02'
  when 'cccccccc-cccc-4ccc-8ccc-ccccccccc003' then date '2026-11-03'
  when 'cccccccc-cccc-4ccc-8ccc-ccccccccc004' then date '2026-11-03'
  else null
end
where id in (
  'cccccccc-cccc-4ccc-8ccc-ccccccccc002',
  'cccccccc-cccc-4ccc-8ccc-ccccccccc003',
  'cccccccc-cccc-4ccc-8ccc-ccccccccc004',
  'cccccccc-cccc-4ccc-8ccc-ccccccccc005'
);

insert into public.contents (
  id,
  title,
  channel,
  external_url,
  is_published,
  sort_order
)
values (
  'cccccccc-cccc-4ccc-8ccc-ccccccccc006',
  '정렬 테스트 콘텐츠',
  'instagram',
  'https://example.invalid/order',
  true,
  0
);

select pg_temp.contents_thumbnail_assert(
  (
    select count(*) = 4
      and bool_and(char_length(thumbnail_alt) = 200)
    from public.contents
    where id in (
      'cccccccc-cccc-4ccc-8ccc-ccccccccc002',
      'cccccccc-cccc-4ccc-8ccc-ccccccccc003',
      'cccccccc-cccc-4ccc-8ccc-ccccccccc004',
      'cccccccc-cccc-4ccc-8ccc-ccccccccc005'
    )
  ),
  '네 확장자·200자 대체 설명·유효한 게시일 허용'
);

select pg_temp.contents_thumbnail_assert(
  (
    select array_agg(
      id::text
      order by sort_order asc, posted_on desc nulls last, id desc
    ) = array[
      'cccccccc-cccc-4ccc-8ccc-ccccccccc006',
      'cccccccc-cccc-4ccc-8ccc-ccccccccc004',
      'cccccccc-cccc-4ccc-8ccc-ccccccccc003',
      'cccccccc-cccc-4ccc-8ccc-ccccccccc002',
      'cccccccc-cccc-4ccc-8ccc-ccccccccc005'
    ]::text[]
    from public.contents
    where is_published
      and id in (select id from contents_thumbnail_test_ids)
  ),
  'sort_order·게시일 NULLS LAST·UUID 역순 정렬'
);

update public.contents
set
  thumbnail_path = 'contents/123e4567-e89b-42d3-a456-426614174000.webp',
  thumbnail_alt = '테스트 썸네일',
  posted_on = date '2026-11-24'
where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccc001';
update public.contents
set
  thumbnail_path = null,
  thumbnail_alt = null,
  posted_on = null
where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccc001';
select pg_temp.contents_thumbnail_assert(
  (
    select
      thumbnail_path is null
      and thumbnail_alt is null
      and posted_on is null
    from public.contents
    where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccc001'
  ),
  '썸네일·게시일 선택과 해제 편집 허용'
);

delete from public.contents
where id in (select id from contents_thumbnail_test_ids);

select pg_temp.contents_thumbnail_assert(
  (pg_temp.contents_thumbnail_snapshot() - 'contents_ordering_index') = (
    select (snapshot->'state') - 'contents_ordering_index'::text
    from contents_thumbnail_baseline
  ),
  '검사 행 정리 후 기존 콘텐츠·RLS·정책·권한·트리거·기타 인덱스·Storage 원본 일치'
);

do $success$
declare
  total integer;
  baseline jsonb;
begin
  select count(*) into total from contents_thumbnail_results;
  select snapshot into baseline from contents_thumbnail_baseline;

  raise exception using
    errcode = 'P0001',
    message = format(
      'CONTENTS_THUMBNAIL_PREFLIGHT_OK: 검사 %s개 통과. 기존 콘텐츠 행·RLS·정책·권한·트리거·Storage 보존, nullable 기존 행, contents 경로·대체 설명·게시일·정렬 인덱스 통과. 실제 Storage API·파일 존재·MIME·크기·콘텐츠 UI 미검증. 의도된 전체 롤백.',
      total
    ),
    detail = baseline::text;
end;
$success$;
