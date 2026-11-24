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
