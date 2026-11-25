-- 강의 업로드 1단계. 선생님 권한, 강의 정보, 업로드 동의만 만든다.
-- 기존 classes는 바꾸지 않는다. 영상 파일, 차시, 고객용 목록은 만들지 않는다.
-- 조회수는 나중에 올릴 자리만 두고 0으로 고정한다. 차시 수는 테이블에 두지 않는다.
do $prerequisite$
declare
  missing text[] := '{}';
begin
  if to_regclass('public.teachers') is not null
    or to_regclass('public.lectures') is not null
    or to_regclass('public.lecture_upload_consents') is not null
  then
    raise exception using
      errcode = 'P0001',
      message = 'LECTURES_SCHEMA_ALREADY_EXISTS: teachers, lectures, lecture_upload_consents';
  end if;

  if to_regclass('public.profiles') is null then
    missing := array_append(missing, 'public.profiles');
  end if;
  if to_regclass('public.classes') is null then
    missing := array_append(missing, 'public.classes');
  end if;
  if to_regclass('storage.objects') is null then
    missing := array_append(missing, 'storage.objects');
  end if;
  if to_regprocedure('private.is_admin()') is null then
    missing := array_append(missing, 'private.is_admin()');
  end if;
  if to_regprocedure('private.set_updated_at()') is null then
    missing := array_append(missing, 'private.set_updated_at()');
  end if;
  if to_regprocedure('storage.foldername(text)') is null then
    missing := array_append(missing, 'storage.foldername(text)');
  end if;
  if to_regrole('anon') is null then
    missing := array_append(missing, 'anon');
  end if;
  if to_regrole('authenticated') is null then
    missing := array_append(missing, 'authenticated');
  end if;
  if to_regrole('service_role') is null then
    missing := array_append(missing, 'service_role');
  end if;

  if cardinality(missing) > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'LECTURES_SCHEMA_PREREQUISITE_FAILED: ' || array_to_string(missing, ', ');
  end if;

  if not (
    select relrowsecurity
    from pg_class
    where oid = 'public.profiles'::regclass
  ) or not (
    select relrowsecurity
    from pg_class
    where oid = 'public.classes'::regclass
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'LECTURES_SCHEMA_PREREQUISITE_FAILED: profiles 또는 classes RLS 비활성';
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
  ) is not true then
    raise exception using
      errcode = 'P0001',
      message = 'LECTURES_SCHEMA_PREREQUISITE_FAILED: public-images 관리자 Storage 정책 4개 필요';
  end if;
end;
$prerequisite$;

create table public.teachers (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  granted_by uuid not null references public.profiles(id) on delete restrict,
  granted_at timestamptz not null
);

create table public.lecture_upload_consents (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  agreed_at timestamptz not null,
  statement text not null constraint lecture_upload_consents_statement_check
    check (statement = '본인이 권리를 가진 영상만 올린다')
);

create table public.lectures (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete restrict,
  title text not null constraint lectures_title_check
    check (title ~ '[^[:space:]]' and char_length(title) <= 100),
  description text not null constraint lectures_description_check
    check (description ~ '[^[:space:]]' and char_length(description) <= 5000),
  thumbnail_path text constraint lectures_thumbnail_path_check
    check (
      thumbnail_path is null
      or (
        thumbnail_path ~ '^lectures/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
        and split_part(thumbnail_path, '/', 2) = teacher_id::text
      )
    ),
  field text not null constraint lectures_field_check
    check (field in ('saju', 'tarot')),
  is_published boolean not null default false,
  view_count integer not null default 0 constraint lectures_view_count_check
    check (view_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.teachers enable row level security;
alter table public.lecture_upload_consents enable row level security;
alter table public.lectures enable row level security;

create index teachers_granted_by_idx on public.teachers (granted_by);
create index lectures_teacher_created_idx
on public.lectures (teacher_id, created_at desc, id desc);

create function private.assign_teacher_grant()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not (select private.is_admin()) then
    raise exception using
      errcode = '42501',
      message = 'TEACHER_GRANT_ADMIN_REQUIRED';
  end if;
  new.granted_by := (select auth.uid());
  new.granted_at := pg_catalog.now();
  return new;
end;
$$;

create function private.assign_lecture_consent()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is distinct from new.user_id
    or not exists (
      select 1
      from public.teachers
      where user_id = new.user_id
    )
  then
    raise exception using
      errcode = '42501',
      message = 'LECTURE_CONSENT_TEACHER_REQUIRED';
  end if;
  new.agreed_at := pg_catalog.now();
  return new;
end;
$$;

create function private.guard_lecture_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is distinct from new.teacher_id
    or not exists (
      select 1
      from public.teachers
      where user_id = new.teacher_id
    )
    or not exists (
      select 1
      from public.lecture_upload_consents
      where user_id = new.teacher_id
    )
  then
    raise exception using
      errcode = '42501',
      message = 'LECTURE_INSERT_TEACHER_CONSENT_REQUIRED';
  end if;
  new.view_count := 0;
  return new;
end;
$$;

create function private.guard_lecture_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.teacher_id is distinct from old.teacher_id
    or new.view_count is distinct from old.view_count
    or new.created_at is distinct from old.created_at
  then
    raise exception using
      errcode = '42501',
      message = 'LECTURE_IDENTITY_IMMUTABLE';
  end if;

  if (select auth.uid()) is distinct from old.teacher_id then
    if not (select private.is_admin())
      or new.is_published
      or new.title is distinct from old.title
      or new.description is distinct from old.description
      or new.thumbnail_path is distinct from old.thumbnail_path
      or new.field is distinct from old.field
    then
      raise exception using
        errcode = '42501',
        message = 'LECTURE_ADMIN_UNPUBLISH_ONLY';
    end if;
    return new;
  end if;

  if not exists (
    select 1
    from public.teachers
    where user_id = (select auth.uid())
  ) then
    raise exception using
      errcode = '42501',
      message = 'LECTURE_UPDATE_TEACHER_REQUIRED';
  end if;
  return new;
end;
$$;

create trigger teachers_assign_grant
before insert on public.teachers
for each row execute function private.assign_teacher_grant();

create trigger lecture_upload_consents_assign
before insert on public.lecture_upload_consents
for each row execute function private.assign_lecture_consent();

create trigger lectures_guard_insert
before insert on public.lectures
for each row execute function private.guard_lecture_insert();

create trigger lectures_guard_update
before update on public.lectures
for each row execute function private.guard_lecture_update();

create trigger lectures_set_updated_at
before update on public.lectures
for each row execute function private.set_updated_at();

create policy teachers_select_own_or_admin on public.teachers
for select to authenticated
using (
  user_id = (select auth.uid())
  or (select private.is_admin())
);
create policy teachers_insert_admin on public.teachers
for insert to authenticated
with check ((select private.is_admin()));
create policy teachers_delete_admin on public.teachers
for delete to authenticated
using ((select private.is_admin()));

create policy lecture_upload_consents_select_own_or_admin
on public.lecture_upload_consents
for select to authenticated
using (
  user_id = (select auth.uid())
  or (select private.is_admin())
);
create policy lecture_upload_consents_insert_own
on public.lecture_upload_consents
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.teachers
    where user_id = (select auth.uid())
  )
);

create policy lectures_select_owner_or_admin on public.lectures
for select to authenticated
using (
  (
    teacher_id = (select auth.uid())
    and exists (
      select 1
      from public.teachers
      where user_id = (select auth.uid())
    )
  )
  or (select private.is_admin())
);
create policy lectures_insert_owner on public.lectures
for insert to authenticated
with check (
  teacher_id = (select auth.uid())
  and exists (
    select 1
    from public.teachers
    where user_id = (select auth.uid())
  )
  and exists (
    select 1
    from public.lecture_upload_consents
    where user_id = (select auth.uid())
  )
);
create policy lectures_update_owner on public.lectures
for update to authenticated
using (
  teacher_id = (select auth.uid())
  and exists (
    select 1
    from public.teachers
    where user_id = (select auth.uid())
  )
)
with check (teacher_id = (select auth.uid()));
create policy lectures_update_admin_unpublish on public.lectures
for update to authenticated
using ((select private.is_admin()))
with check (
  (select private.is_admin())
  and is_published = false
);
create policy lectures_delete_owner on public.lectures
for delete to authenticated
using (
  teacher_id = (select auth.uid())
  and exists (
    select 1
    from public.teachers
    where user_id = (select auth.uid())
  )
);

create policy public_images_select_teacher_lecture on storage.objects
for select to authenticated
using (
  bucket_id = 'public-images'
  and name ~ '^lectures/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
  and (storage.foldername(name))[1] = 'lectures'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (
    select 1
    from public.teachers
    where user_id = (select auth.uid())
  )
);
create policy public_images_insert_teacher_lecture on storage.objects
for insert to authenticated
with check (
  bucket_id = 'public-images'
  and name ~ '^lectures/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
  and (storage.foldername(name))[1] = 'lectures'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (
    select 1
    from public.teachers
    where user_id = (select auth.uid())
  )
);
create policy public_images_update_teacher_lecture on storage.objects
for update to authenticated
using (
  bucket_id = 'public-images'
  and (storage.foldername(name))[1] = 'lectures'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (
    select 1
    from public.teachers
    where user_id = (select auth.uid())
  )
)
with check (
  bucket_id = 'public-images'
  and name ~ '^lectures/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
  and (storage.foldername(name))[1] = 'lectures'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (
    select 1
    from public.teachers
    where user_id = (select auth.uid())
  )
);
create policy public_images_delete_teacher_lecture on storage.objects
for delete to authenticated
using (
  bucket_id = 'public-images'
  and (storage.foldername(name))[1] = 'lectures'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (
    select 1
    from public.teachers
    where user_id = (select auth.uid())
  )
);

revoke all on public.teachers, public.lecture_upload_consents, public.lectures
from public, anon, authenticated, service_role;
grant select on public.teachers, public.lecture_upload_consents, public.lectures
to authenticated;
grant insert (user_id) on public.teachers to authenticated;
grant delete on public.teachers to authenticated;
grant insert (user_id, statement) on public.lecture_upload_consents to authenticated;
grant insert (
  id,
  teacher_id,
  title,
  description,
  thumbnail_path,
  field,
  is_published
) on public.lectures to authenticated;
grant update (
  title,
  description,
  thumbnail_path,
  field,
  is_published
) on public.lectures to authenticated;
grant delete on public.lectures to authenticated;

revoke all on function private.assign_teacher_grant()
from public, anon, authenticated, service_role;
revoke all on function private.assign_lecture_consent()
from public, anon, authenticated, service_role;
revoke all on function private.guard_lecture_insert()
from public, anon, authenticated, service_role;
revoke all on function private.guard_lecture_update()
from public, anon, authenticated, service_role;
