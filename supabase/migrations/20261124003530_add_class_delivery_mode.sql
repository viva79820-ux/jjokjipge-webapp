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
