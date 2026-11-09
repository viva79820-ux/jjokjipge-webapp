-- 초기 설치 전용. 기존 마이그레이션이 적용된 DB의 SQL Editor 작성자 권한으로 전체 실행.
-- 기존 객체가 있으면 중단한다. 기존 버킷/파일/사용자/정책을 변경해서 재실행하지 않는다.
-- 1) 전체 실행 -> SQLSTATE P0001, NOTICES_PREFLIGHT_OK 예외만 성공.
-- 2) 성공 예외 DETAIL의 JSON을 별도 보관한다(정책 원본 포함, 임시 테이블에만 남기지 않음).
-- 3) notices_rollback_check.sql의 baseline에 JSON을 붙여 넣고 별도로 전체 실행한다.
-- 지정 예외 외 오류면 실패이며 롤백 확인의 성공으로 이를 대체할 수 없다.
-- psql은 ON_ERROR_STOP=1 권장. COMMIT 없음. Storage SQL은 실제 업로드/API 검사가 아니다.
begin;

-- 객체 생성 전 원본을 수집한다. 기존 정책 전체 정의(역할/명령/USING/WITH CHECK 포함).
create temporary table notices_baseline as
select jsonb_build_object(
  'format', 'notices-preflight-v1',
  'eligible', false,
  'bucket', (select to_jsonb(b) from storage.buckets b where id='public-images'),
  'policies', coalesce((select jsonb_agg(to_jsonb(p) order by policyname) from pg_policies p
    where schemaname='storage' and tablename='objects'), '[]'::jsonb)
) as snapshot;
select snapshot as notices_before_state from notices_baseline;
do $$
declare conflicts text[] := '{}';
begin
  if to_regclass('public.notices') is not null then conflicts := array_append(conflicts,'public.notices'); end if;
  if to_regclass('public.notices_published_sort_idx') is not null then conflicts := array_append(conflicts,'public.notices_published_sort_idx'); end if;
  if exists(select 1 from storage.buckets where id='public-images' or name='public-images') then
    conflicts := array_append(conflicts,'storage.buckets public-images');
  end if;
  if exists(select 1 from pg_policies where schemaname='storage' and tablename='objects'
    and policyname in ('public_images_select_admin','public_images_insert_admin','public_images_update_admin','public_images_delete_admin')) then
    conflicts := array_append(conflicts,'storage.objects public_images_* 신규 정책');
  end if;
  if cardinality(conflicts)>0 then
    raise exception using message='NOTICES_PREFLIGHT_NOT_INITIAL: 기존 객체 '||array_to_string(conflicts,', '),
      detail=(select snapshot::text from notices_baseline);
  end if;
  update notices_baseline set snapshot=jsonb_set(snapshot,'{eligible}','true');
end;
$$;

-- BEGIN EXACT SCHEMA
-- 공지사항 기반만 생성한다. 실제 공지·이미지·팝업 데이터는 넣지 않는다.
create table public.notices (
  id uuid primary key default gen_random_uuid(),
  title text not null constraint notices_title_check check (title ~ '[^[:space:]]' and char_length(title) <= 100),
  body text not null constraint notices_body_check check (body ~ '[^[:space:]]' and char_length(body) <= 5000),
  image_path text constraint notices_image_path_check check (
    image_path ~ '^notices/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
  ),
  image_alt text constraint notices_image_alt_check check (image_alt ~ '[^[:space:]]' and char_length(image_alt) <= 200),
  is_pinned boolean not null default false,
  is_published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notices_image_requires_alt_check check (image_path is null or image_alt is not null),
  constraint notices_published_at_check check (not is_published or published_at is not null)
);
alter table public.notices enable row level security;
create index notices_published_sort_idx on public.notices (is_published, is_pinned desc, published_at desc, id desc);
create trigger notices_set_updated_at before update on public.notices
for each row execute function private.set_updated_at();

create policy notices_select_published_or_admin on public.notices
for select to anon, authenticated using (is_published or (select private.is_admin()));
create policy notices_insert_admin on public.notices
for insert to authenticated with check ((select private.is_admin()));
create policy notices_update_admin on public.notices
for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy notices_delete_admin on public.notices
for delete to authenticated using ((select private.is_admin()));

revoke all on public.notices from public, anon, authenticated, service_role;
grant select on public.notices to anon, authenticated;
grant insert, update, delete on public.notices to authenticated;

-- BEGIN EXACT BUCKET
do $bucket$
declare
  existing storage.buckets%rowtype;
  mismatch text[] := '{}';
  expected_mimes text[] := array['image/jpeg','image/png','image/webp'];
begin
  -- 경쟁 삽입도 오류로 중단한다. ON CONFLICT로 불일치를 숨기지 않는다.
  select * into existing from storage.buckets where id = 'public-images' for update;
  if not found then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('public-images', 'public-images', true, 5242880, expected_mimes);
  else
    if existing.name is distinct from 'public-images' then mismatch := array_append(mismatch, 'name'); end if;
    if existing.public is distinct from true then mismatch := array_append(mismatch, 'public'); end if;
    if existing.file_size_limit is distinct from 5242880 then mismatch := array_append(mismatch, 'file_size_limit'); end if;
    -- 집합 비교: 배열 순서·중복에는 영향받지 않으며 NULL 원소는 거부한다.
    if existing.allowed_mime_types is null
      or array_position(existing.allowed_mime_types, null) is not null
      or not (existing.allowed_mime_types @> expected_mimes and existing.allowed_mime_types <@ expected_mimes)
    then mismatch := array_append(mismatch, 'allowed_mime_types'); end if;
    if cardinality(mismatch) > 0 then
      raise exception using errcode = 'P0001',
        message = 'NOTICES_BUCKET_CONFIG_MISMATCH: ' || array_to_string(mismatch, ',');
    end if;
  end if;
end;
$bucket$;
-- END EXACT BUCKET

-- Storage 전역 GRANT/구조/기존 정책은 변경하지 않는다.
create policy public_images_select_admin on storage.objects
for select to authenticated using (bucket_id = 'public-images' and (select private.is_admin()));
create policy public_images_insert_admin on storage.objects
for insert to authenticated with check (bucket_id = 'public-images' and (select private.is_admin()));
create policy public_images_update_admin on storage.objects
for update to authenticated using (bucket_id = 'public-images' and (select private.is_admin()))
with check (bucket_id = 'public-images' and (select private.is_admin()));
create policy public_images_delete_admin on storage.objects
for delete to authenticated using (bucket_id = 'public-images' and (select private.is_admin()));
-- END EXACT SCHEMA

create temporary table notices_results (label text not null);
grant insert, select on notices_results to anon, authenticated;
create function pg_temp.notice_assert(ok boolean, label text) returns void
language plpgsql security invoker as $$
begin
  if ok is distinct from true then raise exception 'NOTICES_ASSERT_FAILED: %',label; end if;
  insert into pg_temp.notices_results values(label);
end;
$$;
create function pg_temp.notice_denied(command text, expected_state text, label text) returns void
language plpgsql security invoker as $$
begin
  begin execute command;
  exception when others then
    if sqlstate <> expected_state then raise; end if;
    insert into pg_temp.notices_results values(label);
    return;
  end;
  raise exception 'NOTICES_EXPECTED_ERROR_MISSING: %',label;
end;
$$;
create function pg_temp.notice_insert(patch jsonb default '{}') returns uuid
language plpgsql security invoker as $$
declare result uuid;
begin
  insert into public.notices(title,body,image_path,image_alt,is_pinned,is_published,published_at)
  select title,body,image_path,image_alt,is_pinned,is_published,published_at
  from jsonb_populate_record(null::public.notices,
    '{"title":"테스트 공지","body":"테스트 본문","is_pinned":false,"is_published":false}'::jsonb || patch)
  returning id into result;
  return result;
end;
$$;
grant execute on function pg_temp.notice_assert(boolean,text),pg_temp.notice_denied(text,text,text),pg_temp.notice_insert(jsonb) to anon, authenticated;

create temporary table notices_actors (kind text, id uuid);
insert into notices_actors values ('user',gen_random_uuid()),('admin',gen_random_uuid());
grant select on notices_actors to anon, authenticated;
insert into auth.users (id,email,raw_user_meta_data)
select id,id::text||'@example.invalid','{"name":"테스트 공지"}'::jsonb from notices_actors;
update public.profiles set role='admin' where id=(select id from notices_actors where kind='admin');

-- 제약을 실제 INSERT로 확인. 누락/NULL과 공백·길이 경계를 별도 검사한다.
do $$
declare r record; ext text;
begin
  for r in select * from (values
    ('title','null'::jsonb,'23502'),('body','null'::jsonb,'23502'),
    ('is_pinned','null'::jsonb,'23502'),('is_published','null'::jsonb,'23502'),
    ('title',to_jsonb(E' \t\n'::text),'23514'),('body',to_jsonb(E' \t\n'::text),'23514'),
    ('title',to_jsonb(repeat('가',101)),'23514'),('body',to_jsonb(repeat('가',5001)),'23514'),
    ('image_alt',to_jsonb(repeat('가',201)),'23514'),('image_alt',to_jsonb(E' \t\n'::text),'23514'),
    ('image_path',to_jsonb(''::text),'23514'),('image_path',to_jsonb('https://example.invalid/a.webp'::text),'23514'),
    ('image_path',to_jsonb('notices/../a.webp'::text),'23514'),
    ('image_path',to_jsonb('stores/11111111-1111-4111-8111-111111111111.webp'::text),'23514'),
    ('image_path',to_jsonb('public-images/notices/11111111-1111-4111-8111-111111111111.webp'::text),'23514'),
    ('image_path',to_jsonb('notices/11111111-1111-4111-8111-11111111111z.webp'::text),'23514'),
    ('image_path',to_jsonb('notices/11111111-1111-4111-8111-111111111111.svg'::text),'23514'),
    ('is_published','true'::jsonb,'23514')
  ) v(col,val,state) loop
    perform pg_temp.notice_denied(format('select pg_temp.notice_insert(%L::jsonb)',jsonb_build_object(r.col,r.val)),r.state,'제약 '||r.col||' '||r.val::text);
  end loop;
  perform pg_temp.notice_denied($q$select pg_temp.notice_insert('{"image_path":"notices/11111111-1111-4111-8111-111111111111.webp"}')$q$,'23514','이미지 설명 NULL 거부');
  foreach ext in array array['jpg','jpeg','png','webp'] loop
    perform pg_temp.notice_insert(jsonb_build_object('title',repeat('가',100),'body',repeat('가',5000),
      'image_path','notices/11111111-1111-4111-8111-111111111111.'||ext,'image_alt',repeat('가',200)));
    perform pg_temp.notice_assert(true,'정상 확장자·길이 경계 '||ext);
  end loop;
end;
$$;
delete from public.notices;
insert into public.notices(title,body,updated_at) values ('비공개 테스트','원문','2000-01-01');
select pg_temp.notice_assert((select id is not null and not is_pinned and not is_published and published_at is null
  and image_path is null and image_alt is null and created_at=now() from public.notices),'기본값');
update public.notices set body='원문';
select pg_temp.notice_assert((select updated_at=now() from public.notices),'고정 now() 트리거: 과거값을 현재 트랜잭션 시각으로 교체');
select pg_temp.notice_denied('insert into public.notices(id,title,body) values (null,''테스트'',''본문'')','23502','id NULL');
select pg_temp.notice_denied('insert into public.notices(title) values (''테스트'')','23502','본문 누락');
select pg_temp.notice_denied('insert into public.notices(body) values (''테스트'')','23502','제목 누락');
select pg_temp.notice_denied('insert into public.notices(title,body,created_at) values (''테스트'',''본문'',null)','23502','created_at NULL');
select pg_temp.notice_denied('insert into public.notices(title,body,updated_at) values (''테스트'',''본문'',null)','23502','updated_at NULL');
select pg_temp.notice_denied('insert into public.notices(id,title,body) select id,title,body from public.notices','23505','기본 키 중복');
select pg_temp.notice_insert(jsonb_build_object('title','공개 테스트','is_published',true,'published_at',now()));

set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);
select pg_temp.notice_assert((select count(*)=1 and bool_and(is_published) from public.notices),'anon 공개만 조회');
select pg_temp.notice_denied('select pg_temp.notice_insert()','42501','anon INSERT');
select pg_temp.notice_denied('update public.notices set title=''침범''','42501','anon UPDATE');
select pg_temp.notice_denied('delete from public.notices','42501','anon DELETE');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from notices_actors where kind='user'),true);
select pg_temp.notice_assert((select count(*)=1 and bool_and(is_published) from public.notices),'일반 회원 공개만 조회');
select pg_temp.notice_denied('select pg_temp.notice_insert()','42501','회원 INSERT RLS');
with changed as (update public.notices set body='침범' returning id)
select pg_temp.notice_assert((select count(*)=0 from changed),'회원 UPDATE 0행');
with changed as (delete from public.notices returning id)
select pg_temp.notice_assert((select count(*)=0 from changed),'회원 DELETE 0행');
reset role;
select pg_temp.notice_assert((select count(*)=2 and bool_and(body='원문' or body='테스트 본문') from public.notices),'차단 후 실제 원본 보존');

set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from notices_actors where kind='admin'),true);
select pg_temp.notice_assert((select count(*)=2 from public.notices),'관리자 비공개 포함');
select pg_temp.notice_insert('{"title":"관리자 CRUD"}');
with changed as (update public.notices set body='관리자 수정' where title='관리자 CRUD' returning id)
select pg_temp.notice_assert((select count(*)=1 from changed),'관리자 UPDATE');
with changed as (delete from public.notices where title='관리자 CRUD' returning id)
select pg_temp.notice_assert((select count(*)=1 from changed),'관리자 DELETE');
reset role;

-- 카탈로그 권한/키/기본값 검사. 새 테이블에 예기치 않은 역할 권한이 없어야 한다.
do $$
declare actor text; privilege text; col text; r record;
begin
  perform pg_temp.notice_assert((select relrowsecurity from pg_class where oid='public.notices'::regclass),'RLS');
  perform pg_temp.notice_assert(exists(select 1 from pg_constraint where conrelid='public.notices'::regclass and contype='p' and pg_get_constraintdef(oid)='PRIMARY KEY (id)'),'UUID PK');
  perform pg_temp.notice_assert(exists(select 1 from pg_index where indexrelid='public.notices_published_sort_idx'::regclass and indnkeyatts=4),'정렬 인덱스');
  perform pg_temp.notice_assert(pg_get_indexdef('public.notices_published_sort_idx'::regclass) =
    'CREATE INDEX notices_published_sort_idx ON public.notices USING btree (is_published, is_pinned DESC, published_at DESC, id DESC)','인덱스 정렬 방향');
  for r in select * from (values
    ('id','uuid','gen_random_uuid()'),('title','text',null),('body','text',null),
    ('image_path','text',null),('image_alt','text',null),('is_pinned','boolean','false'),('is_published','boolean','false'),
    ('published_at','timestamp with time zone',null),('created_at','timestamp with time zone','now()'),('updated_at','timestamp with time zone','now()')
  ) v(col,typ,expr) loop
    perform pg_temp.notice_assert((select format_type(a.atttypid,a.atttypmod)=r.typ
      and pg_get_expr(d.adbin,d.adrelid) is not distinct from r.expr
      from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
      where a.attrelid='public.notices'::regclass and a.attname=r.col),r.col||' 타입·기본값');
  end loop;
  perform pg_temp.notice_assert((select count(*)=3 and bool_and(not attnotnull) from pg_attribute
    where attrelid='public.notices'::regclass and attname in ('image_path','image_alt','published_at')),'선택값 NULL 허용');
  foreach col in array array['id','title','body','is_pinned','is_published','created_at','updated_at'] loop
    perform pg_temp.notice_assert((select attnotnull from pg_attribute where attrelid='public.notices'::regclass and attname=col),col||' NOT NULL');
  end loop;
  foreach actor in array array['anon','authenticated','service_role'] loop
    foreach privilege in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      perform pg_temp.notice_assert(has_table_privilege(actor,'public.notices',privilege)=
        ((privilege='SELECT' and actor in ('anon','authenticated')) or (privilege in ('INSERT','UPDATE','DELETE') and actor='authenticated')),
        actor||' '||privilege||' GRANT');
    end loop;
  end loop;
  perform pg_temp.notice_assert(not exists(select 1 from pg_class c, lateral aclexplode(c.relacl) a
    where c.oid='public.notices'::regclass and a.grantee=0),'PUBLIC 권한 없음');
end;
$$;

-- 새 버킷만 있는 롤백 트랜잭션에서 실제 마이그레이션과 동일한 DO 블록을 재실행한다.
do $suite$
declare
  bucket_sql text := $exact_bucket$do $bucket$
declare
  existing storage.buckets%rowtype;
  mismatch text[] := '{}';
  expected_mimes text[] := array['image/jpeg','image/png','image/webp'];
begin
  -- 경쟁 삽입도 오류로 중단한다. ON CONFLICT로 불일치를 숨기지 않는다.
  select * into existing from storage.buckets where id = 'public-images' for update;
  if not found then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('public-images', 'public-images', true, 5242880, expected_mimes);
  else
    if existing.name is distinct from 'public-images' then mismatch := array_append(mismatch, 'name'); end if;
    if existing.public is distinct from true then mismatch := array_append(mismatch, 'public'); end if;
    if existing.file_size_limit is distinct from 5242880 then mismatch := array_append(mismatch, 'file_size_limit'); end if;
    -- 집합 비교: 배열 순서·중복에는 영향받지 않으며 NULL 원소는 거부한다.
    if existing.allowed_mime_types is null
      or array_position(existing.allowed_mime_types, null) is not null
      or not (existing.allowed_mime_types @> expected_mimes and existing.allowed_mime_types <@ expected_mimes)
    then mismatch := array_append(mismatch, 'allowed_mime_types'); end if;
    if cardinality(mismatch) > 0 then
      raise exception using errcode = 'P0001',
        message = 'NOTICES_BUCKET_CONFIG_MISMATCH: ' || array_to_string(mismatch, ',');
    end if;
  end if;
end;
$bucket$;$exact_bucket$;
  before_row jsonb;
  after_row jsonb;
  field text;
  message text;
  caught boolean;
begin
  select to_jsonb(b) into before_row from storage.buckets b where id='public-images';
  perform pg_temp.notice_assert((before_row->>'public')::boolean and (before_row->>'file_size_limit')::bigint=5242880
    and (before_row->'allowed_mime_types') @> '["image/jpeg","image/png","image/webp"]'::jsonb,'버킷 신규 생성 설정');
  execute bucket_sql;
  select to_jsonb(b) into after_row from storage.buckets b where id='public-images';
  perform pg_temp.notice_assert(after_row=before_row,'같은 설정 재사용 시 행 전체 불변');
  update storage.buckets set allowed_mime_types=array['image/webp','image/png','image/jpeg'] where id='public-images';
  select to_jsonb(b) into before_row from storage.buckets b where id='public-images';
  execute bucket_sql;
  select to_jsonb(b) into after_row from storage.buckets b where id='public-images';
  perform pg_temp.notice_assert(after_row=before_row,'MIME 순서만 다른 버킷 재사용·행 불변');
  foreach field in array array['name','public','file_size_limit','allowed_mime_types'] loop
    -- 이 하위 트랜잭션은 신규 테스트 버킷의 설정만 바꾸고 매번 되돌린다.
    begin
      if field='name' then update storage.buckets set name='test-mismatch' where id='public-images';
      elsif field='public' then update storage.buckets set public=false where id='public-images';
      elsif field='file_size_limit' then update storage.buckets set file_size_limit=1 where id='public-images';
      else update storage.buckets set allowed_mime_types=array['image/gif'] where id='public-images'; end if;
      select to_jsonb(b) into before_row from storage.buckets b where id='public-images';
      caught := false;
      begin
        execute bucket_sql;
      exception when sqlstate 'P0001' then
        get stacked diagnostics message = message_text;
        if message <> 'NOTICES_BUCKET_CONFIG_MISMATCH: '||field then raise; end if;
        caught := true;
      end;
      if not caught then raise exception 'NOTICES_EXPECTED_BUCKET_MISMATCH: %',field; end if;
      select to_jsonb(b) into after_row from storage.buckets b where id='public-images';
      if after_row is distinct from before_row then raise exception 'NOTICES_BUCKET_CHANGED_ON_ERROR'; end if;
      raise exception using errcode='ZB001',message='의도된 버킷 테스트 하위 롤백';
    exception when sqlstate 'ZB001' then null;
    end;
    perform pg_temp.notice_assert(caught,'버킷 불일치 SQLSTATE·식별자·항목·기존 행 불변 '||field);
  end loop;
end;
$suite$;

-- SECURITY INVOKER로 실제 역할의 0행 차단 또는 정확한 42501만 허용한다.
create function pg_temp.notice_no_rows(command text, label text) returns void
language plpgsql security invoker as $$
declare affected bigint;
begin
  begin
    execute command;
    get diagnostics affected=row_count;
    if affected<>0 then raise exception 'NOTICES_UNEXPECTED_ROWS: %',label; end if;
  exception when insufficient_privilege then
    -- SQLSTATE 42501 외 오류는 처리하지 않는다. 아래 소유자 검사로 실제 원본도 확인한다.
    null;
  end;
  insert into pg_temp.notices_results values(label);
end;
$$;
grant execute on function pg_temp.notice_no_rows(text,text) to anon, authenticated;
create temporary table notices_object (id uuid);
grant select on notices_object to anon, authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from notices_actors where kind='admin'),true);
-- 실제 파일 업로드가 아닌 메타데이터 행만 검사한다. Storage 보호 트리거를 비활성화하지 않는다.
insert into storage.objects(bucket_id,name)
values ('public-images','notices/11111111-1111-4111-8111-111111111111.webp');
reset role;
insert into notices_object select id from storage.objects where bucket_id='public-images'
  and name='notices/11111111-1111-4111-8111-111111111111.webp';

set local role anon;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.notice_no_rows('select id from storage.objects where bucket_id=''public-images''','anon Storage 목록/메타데이터 차단');
select pg_temp.notice_denied('insert into storage.objects(bucket_id,name) values (''public-images'',''notices/anon.webp'')','42501','anon Storage INSERT');
select pg_temp.notice_no_rows('update storage.objects set name=''침범'' where bucket_id=''public-images''','anon Storage UPDATE');
select pg_temp.notice_no_rows('delete from storage.objects where bucket_id=''public-images''','anon Storage DELETE');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from notices_actors where kind='user'),true);
select pg_temp.notice_no_rows('select id from storage.objects where bucket_id=''public-images''','회원 Storage 목록/메타데이터 차단');
select pg_temp.notice_denied('insert into storage.objects(bucket_id,name) values (''public-images'',''notices/user.webp'')','42501','회원 Storage INSERT');
select pg_temp.notice_no_rows('update storage.objects set name=''침범'' where bucket_id=''public-images''','회원 Storage UPDATE');
select pg_temp.notice_no_rows('delete from storage.objects where bucket_id=''public-images''','회원 Storage DELETE');
reset role;
select pg_temp.notice_assert((select count(*)=1 and bool_and(name='notices/11111111-1111-4111-8111-111111111111.webp')
  from storage.objects where bucket_id='public-images'),'차단 후 Storage 실제 원본 보존');

set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from notices_actors where kind='admin'),true);
select pg_temp.notice_assert((select count(*)=1 from storage.objects where id=(select id from notices_object)),'관리자 Storage SELECT/INSERT');
with changed as (update storage.objects set name='notices/22222222-2222-4222-8222-222222222222.png'
  where id=(select id from notices_object) returning id)
select pg_temp.notice_assert((select count(*)=1 from changed),'관리자 Storage UPDATE');
with changed as (delete from storage.objects where id=(select id from notices_object) returning id)
select pg_temp.notice_assert((select count(*)=1 from changed),'관리자 Storage DELETE');
reset role;
select pg_temp.notice_assert(not exists(select 1 from storage.objects where bucket_id='public-images'),'테스트 객체 삭제 확인');

do $$
declare original jsonb; current_policies jsonb; total integer;
begin
  select snapshot into original from notices_baseline;
  select coalesce(jsonb_agg(to_jsonb(p) order by policyname),'[]'::jsonb) into current_policies
  from pg_policies p where schemaname='storage' and tablename='objects'
    and policyname not in ('public_images_select_admin','public_images_insert_admin','public_images_update_admin','public_images_delete_admin');
  perform pg_temp.notice_assert(current_policies=original->'policies','기존 Storage 정책 전체 정의 보존');
  select count(*) into total from notices_results;
  -- DETAIL은 롤백 밖으로 보관할 원본이다. 반드시 복사해 별도 확인 파일에 전달한다.
  raise exception using errcode='P0001',message=format('NOTICES_PREFLIGHT_OK: 검사 %s개 통과. 의도된 전체 롤백. 실제 Storage API 미검증.',total),detail=original::text;
end;
$$;
