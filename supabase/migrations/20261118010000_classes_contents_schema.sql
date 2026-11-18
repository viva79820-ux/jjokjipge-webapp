-- 외부 링크로 열람하는 클래스와 콘텐츠의 DB 기반만 만든다. 실제 강의·채널 자료는 넣지 않는다.
do $prerequisite$
declare
  missing text[] := '{}';
begin
  if to_regclass('public.classes') is not null then
    raise exception using
      errcode = 'P0001',
      message = 'CLASSES_CONTENTS_SCHEMA_ALREADY_EXISTS: public.classes';
  end if;
  if to_regclass('public.contents') is not null then
    raise exception using
      errcode = 'P0001',
      message = 'CLASSES_CONTENTS_SCHEMA_ALREADY_EXISTS: public.contents';
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
      message = 'CLASSES_CONTENTS_SCHEMA_PREREQUISITE_FAILED: ' || array_to_string(missing, ', ');
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname = 'is_admin'
      and pg_get_function_identity_arguments(p.oid) = ''
      and pg_get_function_result(p.oid) = 'boolean'
      and p.prosecdef
      and p.provolatile = 's'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'CLASSES_CONTENTS_SCHEMA_PREREQUISITE_FAILED: private.is_admin() 정의가 예상과 다릅니다.';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname = 'set_updated_at'
      and pg_get_function_identity_arguments(p.oid) = ''
      and pg_get_function_result(p.oid) = 'trigger'
      and not p.prosecdef
      and p.provolatile = 'v'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'CLASSES_CONTENTS_SCHEMA_PREREQUISITE_FAILED: private.set_updated_at() 정의가 예상과 다릅니다.';
  end if;
end;
$prerequisite$;

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  title text not null constraint classes_title_check
    check (title ~ '[^[:space:]]' and char_length(title) <= 100),
  description text not null constraint classes_description_check
    check (description ~ '[^[:space:]]' and char_length(description) <= 5000),
  field text not null constraint classes_field_check
    check (field in ('saju', 'tarot')),
  video_url text constraint classes_video_url_check
    check (
      video_url is null
      or (
        char_length(video_url) <= 2048
        and video_url ~ '^https://(\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?)(:[0-9]{1,5})?([/?#][^[:space:][:cntrl:]]*)?$'
      )
    ),
  is_published boolean not null default false,
  sort_order integer not null default 0 constraint classes_sort_order_check
    check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint classes_published_video_url_check
    check (not is_published or video_url is not null)
);

create table public.contents (
  id uuid primary key default gen_random_uuid(),
  title text not null constraint contents_title_check
    check (title ~ '[^[:space:]]' and char_length(title) <= 100),
  description text constraint contents_description_check
    check (
      description is null
      or (
        description ~ '[^[:space:]]'
        and char_length(description) <= 1000
      )
    ),
  channel text not null constraint contents_channel_check
    check (channel in ('blog', 'instagram', 'youtube')),
  external_url text constraint contents_external_url_check
    check (
      external_url is null
      or (
        char_length(external_url) <= 2048
        and external_url ~ '^https://(\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?)(:[0-9]{1,5})?([/?#][^[:space:][:cntrl:]]*)?$'
      )
    ),
  is_published boolean not null default false,
  sort_order integer not null default 0 constraint contents_sort_order_check
    check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contents_published_external_url_check
    check (not is_published or external_url is not null)
);

alter table public.classes enable row level security;
alter table public.contents enable row level security;

create index classes_published_sort_idx
on public.classes (is_published, sort_order, created_at desc, id desc);
create index contents_published_sort_idx
on public.contents (is_published, sort_order, created_at desc, id desc);

create trigger classes_set_updated_at
before update on public.classes
for each row execute function private.set_updated_at();
create trigger contents_set_updated_at
before update on public.contents
for each row execute function private.set_updated_at();

create policy classes_select_published_or_admin on public.classes
for select to anon, authenticated
using (is_published or (select private.is_admin()));
create policy classes_insert_admin on public.classes
for insert to authenticated
with check ((select private.is_admin()));
create policy classes_update_admin on public.classes
for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));
create policy classes_delete_admin on public.classes
for delete to authenticated
using ((select private.is_admin()));

create policy contents_select_published_or_admin on public.contents
for select to anon, authenticated
using (is_published or (select private.is_admin()));
create policy contents_insert_admin on public.contents
for insert to authenticated
with check ((select private.is_admin()));
create policy contents_update_admin on public.contents
for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));
create policy contents_delete_admin on public.contents
for delete to authenticated
using ((select private.is_admin()));

revoke all on public.classes, public.contents
from public, anon, authenticated, service_role;
grant select on public.classes, public.contents to anon, authenticated;
grant insert, update, delete on public.classes, public.contents to authenticated;
