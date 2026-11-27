-- 강의 2단계 작업 1. 차시, 웹훅 수신 기록, 시청 진도, 저장 용량 한 행.
-- 1단계 마이그레이션(20261125120000_lectures_schema.sql)은 고치지 않는다.
-- 영상 바이트는 이 데이터베이스에 두지 않는다. 상태·provider·용량은 서버 비밀 키만 기록한다.
-- 주문 테이블에서 service_role 권한을 거둔 뒤 서버 조회가 42501로 실패한 적이 있다.
-- 새 네 테이블은 revoke 뒤에 service_role 권한을 준다. lectures는 1단계에서 거둔 권한을 여기서 되돌린다.
do $prerequisite$
declare
  missing text[] := '{}';
begin
  if to_regclass('public.lecture_lessons') is not null
    or to_regclass('public.lecture_webhook_events') is not null
    or to_regclass('public.lecture_storage_state') is not null
    or to_regclass('public.lecture_progress') is not null
  then
    raise exception using
      errcode = 'P0001',
      message = 'LECTURE_LESSONS_SCHEMA_ALREADY_EXISTS: lecture_lessons, lecture_webhook_events, lecture_storage_state, lecture_progress';
  end if;

  if to_regclass('public.teachers') is null then
    missing := array_append(missing, 'public.teachers');
  end if;
  if to_regclass('public.lectures') is null then
    missing := array_append(missing, 'public.lectures');
  end if;
  if to_regclass('public.lecture_upload_consents') is null then
    missing := array_append(missing, 'public.lecture_upload_consents');
  end if;
  if to_regprocedure('private.is_admin()') is null then
    missing := array_append(missing, 'private.is_admin()');
  end if;
  if to_regprocedure('private.set_updated_at()') is null then
    missing := array_append(missing, 'private.set_updated_at()');
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
      message = 'LECTURE_LESSONS_SCHEMA_PREREQUISITE_FAILED: ' || array_to_string(missing, ', ');
  end if;

  if not (
    select relrowsecurity
    from pg_class
    where oid = 'public.lectures'::regclass
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'LECTURE_LESSONS_SCHEMA_PREREQUISITE_FAILED: lectures RLS 비활성';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'lectures'
      and policyname = 'lectures_delete_owner'
  ) or not has_table_privilege('authenticated', 'public.lectures', 'DELETE') then
    raise exception using
      errcode = 'P0001',
      message = 'LECTURE_LESSONS_SCHEMA_PREREQUISITE_FAILED: lectures 클라이언트 delete 정책과 권한 필요';
  end if;
end;
$prerequisite$;

create table public.lecture_lessons (
  id uuid primary key default gen_random_uuid(),
  lecture_id uuid not null references public.lectures(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete restrict,
  title text not null constraint lecture_lessons_title_check
    check (title ~ '[^[:space:]]' and char_length(title) <= 100),
  sort_order integer not null constraint lecture_lessons_sort_order_check
    check (sort_order >= 0),
  provider text not null default 'mock' constraint lecture_lessons_provider_check
    check (provider in ('mock', 'bunny')),
  provider_video_id text constraint lecture_lessons_provider_video_id_check
    check (
      provider_video_id is null
      or (
        provider_video_id ~ '[^[:space:]]'
        and char_length(provider_video_id) <= 200
      )
    ),
  status text not null default 'created' constraint lecture_lessons_status_check
    check (status in ('created', 'uploading', 'processing', 'ready', 'failed')),
  duration_seconds integer constraint lecture_lessons_duration_seconds_check
    check (duration_seconds is null or duration_seconds >= 0),
  storage_bytes bigint constraint lecture_lessons_storage_bytes_check
    check (storage_bytes is null or storage_bytes >= 0),
  provider_status text constraint lecture_lessons_provider_status_check
    check (
      provider_status is null
      or (
        provider_status ~ '[^[:space:]]'
        and char_length(provider_status) <= 40
      )
    ),
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lecture_webhook_events (
  event_id text primary key constraint lecture_webhook_events_event_id_check
    check (event_id ~ '[^[:space:]]' and char_length(event_id) <= 200),
  provider_video_id text not null constraint lecture_webhook_events_video_id_check
    check (
      provider_video_id ~ '[^[:space:]]'
      and char_length(provider_video_id) <= 200
    ),
  status integer not null,
  happened_at timestamptz not null
);

create table public.lecture_storage_state (
  id smallint primary key default 1 constraint lecture_storage_state_singleton_check
    check (id = 1),
  used_bytes bigint not null default 0 constraint lecture_storage_state_used_bytes_check
    check (used_bytes >= 0),
  limit_bytes bigint constraint lecture_storage_state_limit_bytes_check
    check (limit_bytes is null or limit_bytes >= 0),
  alerted_80_at timestamptz
);

create table public.lecture_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null references public.lecture_lessons(id) on delete cascade,
  position_seconds integer not null constraint lecture_progress_position_seconds_check
    check (position_seconds >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

alter table public.lecture_lessons enable row level security;
alter table public.lecture_webhook_events enable row level security;
alter table public.lecture_storage_state enable row level security;
alter table public.lecture_progress enable row level security;

create index lecture_lessons_lecture_sort_idx
on public.lecture_lessons (lecture_id, sort_order, id);
create index lecture_lessons_teacher_idx
on public.lecture_lessons (teacher_id);
create unique index lecture_lessons_provider_video_uidx
on public.lecture_lessons (provider, provider_video_id)
where provider_video_id is not null;
create index lecture_lessons_ready_idx
on public.lecture_lessons (lecture_id)
where status = 'ready';
create index lectures_published_idx
on public.lectures (created_at desc, id desc)
where is_published;
create index lecture_webhook_events_video_idx
on public.lecture_webhook_events (provider_video_id, happened_at);
create index lecture_progress_lesson_idx
on public.lecture_progress (lesson_id);

create function private.guard_lecture_lesson_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.lectures
    where id = new.lecture_id
      and teacher_id = new.teacher_id
  ) or not exists (
    select 1
    from public.teachers
    where user_id = new.teacher_id
  ) or not exists (
    select 1
    from public.lecture_upload_consents
    where user_id = new.teacher_id
  ) then
    raise exception using
      errcode = '42501',
      message = 'LECTURE_LESSON_OWNER_REQUIRED';
  end if;

  if current_user is distinct from 'service_role' then
    if (select auth.uid()) is distinct from new.teacher_id then
      raise exception using
        errcode = '42501',
        message = 'LECTURE_LESSON_INSERT_TEACHER_REQUIRED';
    end if;
    new.provider := 'mock';
    new.provider_video_id := null;
    new.status := 'created';
    new.duration_seconds := null;
    new.storage_bytes := null;
    new.provider_status := null;
    new.last_event_at := null;
  end if;

  return new;
end;
$$;

create function private.guard_lecture_lesson_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.lecture_id is distinct from old.lecture_id
    or new.teacher_id is distinct from old.teacher_id
    or new.created_at is distinct from old.created_at
  then
    raise exception using
      errcode = '42501',
      message = 'LECTURE_LESSON_IDENTITY_IMMUTABLE';
  end if;

  if current_user = 'service_role' then
    return new;
  end if;

  if (select auth.uid()) is distinct from old.teacher_id
    or not exists (
      select 1
      from public.teachers
      where user_id = (select auth.uid())
    )
  then
    raise exception using
      errcode = '42501',
      message = 'LECTURE_LESSON_UPDATE_TEACHER_REQUIRED';
  end if;

  if new.provider is distinct from old.provider
    or new.provider_video_id is distinct from old.provider_video_id
    or new.status is distinct from old.status
    or new.duration_seconds is distinct from old.duration_seconds
    or new.storage_bytes is distinct from old.storage_bytes
    or new.provider_status is distinct from old.provider_status
    or new.last_event_at is distinct from old.last_event_at
  then
    raise exception using
      errcode = '42501',
      message = 'LECTURE_LESSON_SERVER_FIELDS_IMMUTABLE';
  end if;

  return new;
end;
$$;

create function private.guard_lecture_progress_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and (
      new.user_id is distinct from old.user_id
      or new.lesson_id is distinct from old.lesson_id
    )
  then
    raise exception using
      errcode = '42501',
      message = 'LECTURE_PROGRESS_IDENTITY_IMMUTABLE';
  end if;

  if current_user = 'service_role' then
    return new;
  end if;

  if (select auth.uid()) is distinct from new.user_id then
    raise exception using
      errcode = '42501',
      message = 'LECTURE_PROGRESS_OWNER_REQUIRED';
  end if;

  if tg_op = 'INSERT' and not exists (
    select 1
    from public.lecture_lessons lesson
    join public.lectures lecture on lecture.id = lesson.lecture_id
    where lesson.id = new.lesson_id
      and (
        (lecture.is_published and lesson.status = 'ready')
        or (
          lesson.teacher_id = (select auth.uid())
          and exists (
            select 1
            from public.teachers
            where user_id = (select auth.uid())
          )
        )
      )
  ) then
    raise exception using
      errcode = '42501',
      message = 'LECTURE_PROGRESS_LESSON_NOT_VISIBLE';
  end if;

  return new;
end;
$$;

create trigger lecture_lessons_guard_insert
before insert on public.lecture_lessons
for each row execute function private.guard_lecture_lesson_insert();

create trigger lecture_lessons_guard_update
before update on public.lecture_lessons
for each row execute function private.guard_lecture_lesson_update();

create trigger lecture_lessons_set_updated_at
before update on public.lecture_lessons
for each row execute function private.set_updated_at();

create trigger lecture_progress_guard_write
before insert or update on public.lecture_progress
for each row execute function private.guard_lecture_progress_write();

create trigger lecture_progress_set_updated_at
before update on public.lecture_progress
for each row execute function private.set_updated_at();

create policy lectures_select_published on public.lectures
for select to anon, authenticated
using (is_published);

drop policy lectures_delete_owner on public.lectures;

create policy lecture_lessons_select_owner on public.lecture_lessons
for select to authenticated
using (
  teacher_id = (select auth.uid())
  and exists (
    select 1
    from public.teachers
    where user_id = (select auth.uid())
  )
);
create policy lecture_lessons_select_admin on public.lecture_lessons
for select to authenticated
using ((select private.is_admin()));
create policy lecture_lessons_select_published_ready on public.lecture_lessons
for select to anon, authenticated
using (
  status = 'ready'
  and exists (
    select 1
    from public.lectures
    where id = lecture_id
      and is_published
  )
);
create policy lecture_lessons_insert_owner on public.lecture_lessons
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
  and exists (
    select 1
    from public.lectures
    where id = lecture_id
      and teacher_id = (select auth.uid())
  )
);
create policy lecture_lessons_update_owner on public.lecture_lessons
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

create policy lecture_storage_state_select_admin on public.lecture_storage_state
for select to authenticated
using ((select private.is_admin()));

create policy lecture_progress_select_own on public.lecture_progress
for select to authenticated
using (user_id = (select auth.uid()));
create policy lecture_progress_insert_own on public.lecture_progress
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.lecture_lessons lesson
    join public.lectures lecture on lecture.id = lesson.lecture_id
    where lesson.id = lesson_id
      and (
        (lecture.is_published and lesson.status = 'ready')
        or (
          lesson.teacher_id = (select auth.uid())
          and exists (
            select 1
            from public.teachers
            where user_id = (select auth.uid())
          )
        )
      )
  )
);
create policy lecture_progress_update_own on public.lecture_progress
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- limit_bytes null은 한도를 아직 기록하지 않은 상태다. 0으로 두면 업로드가 막힌 것처럼 보인다.
insert into public.lecture_storage_state (id, used_bytes, limit_bytes)
values (1, 0, null);

revoke all on public.lecture_lessons,
  public.lecture_webhook_events,
  public.lecture_storage_state,
  public.lecture_progress
from public, anon, authenticated, service_role;

grant select, insert, update, delete on public.lecture_lessons to service_role;
grant select, insert, update, delete on public.lecture_webhook_events to service_role;
grant select, insert, update, delete on public.lecture_storage_state to service_role;
grant select, insert, update, delete on public.lecture_progress to service_role;
grant select, insert, update, delete on public.lectures to service_role;

grant select on public.lectures to anon;
revoke delete on public.lectures from authenticated;

grant select on public.lecture_lessons to anon, authenticated;
grant insert (
  id,
  lecture_id,
  teacher_id,
  title,
  sort_order
) on public.lecture_lessons to authenticated;
grant update (title, sort_order) on public.lecture_lessons to authenticated;

grant select on public.lecture_storage_state to authenticated;

grant select on public.lecture_progress to authenticated;
grant insert (user_id, lesson_id, position_seconds)
on public.lecture_progress to authenticated;
grant update (position_seconds) on public.lecture_progress to authenticated;

revoke all on function private.guard_lecture_lesson_insert()
from public, anon, authenticated, service_role;
revoke all on function private.guard_lecture_lesson_update()
from public, anon, authenticated, service_role;
revoke all on function private.guard_lecture_progress_write()
from public, anon, authenticated, service_role;
