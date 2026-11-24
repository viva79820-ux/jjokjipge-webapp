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
