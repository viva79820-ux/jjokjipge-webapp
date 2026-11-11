-- 상담사 전체 분야·경력 목록·이미지 경로 형식과 신규 상담사·상품의 기본 비공개를 준비한다.
-- 실제 상담사, 사진, 상품, 계정은 등록하지 않는다. 기존 행의 값과 예약 기록은 유지한다.

create function private.counselor_fields_valid(candidate_fields text[], representative_field text)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  -- CASE는 필요한 분기만 평가한다. 다차원 배열의 array_position은 예외를 던지므로 차원 검사를 먼저 한다.
  select coalesce(
    case
      when candidate_fields is null or representative_field is null then false
      when pg_catalog.cardinality(candidate_fields) not between 1 and 2 then false
      when pg_catalog.array_ndims(candidate_fields) is distinct from 1 then false
      when pg_catalog.array_lower(candidate_fields, 1) is distinct from 1 then false
      else
        pg_catalog.array_position(candidate_fields, null::text) is null
        and candidate_fields <@ array['tarot', 'saju']::text[]
        and representative_field = any (candidate_fields)
        and (
          select pg_catalog.count(*) = pg_catalog.count(distinct item)
          from pg_catalog.unnest(candidate_fields) as item
        )
    end,
    false
  );
$$;

create function private.counselor_careers_valid(candidate_careers text[])
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  -- 빈 배열은 차원·시작 인덱스가 없다. 다차원 배열은 원소 검색 전에 거부한다.
  select coalesce(
    case
      when candidate_careers is null then false
      when pg_catalog.cardinality(candidate_careers) > 20 then false
      when pg_catalog.cardinality(candidate_careers) = 0 then true
      when pg_catalog.array_ndims(candidate_careers) is distinct from 1 then false
      when pg_catalog.array_lower(candidate_careers, 1) is distinct from 1 then false
      when pg_catalog.array_position(candidate_careers, null::text) is not null then false
      else not exists (
        select 1
        from pg_catalog.unnest(candidate_careers) as item
        where item is null
          or item !~ '[^[:space:]]'
          or pg_catalog.char_length(item) > 200
      )
    end,
    false
  );
$$;

create function private.counselor_image_path_valid(candidate_path text)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select coalesce(
    candidate_path is null
    or candidate_path ~ '^counselors/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$',
    false
  );
$$;

revoke all on function private.counselor_fields_valid(text[], text) from public, anon, authenticated, service_role;
revoke all on function private.counselor_careers_valid(text[]) from public, anon, authenticated, service_role;
revoke all on function private.counselor_image_path_valid(text) from public, anon, authenticated, service_role;
grant execute on function private.counselor_fields_valid(text[], text) to anon, authenticated;
grant execute on function private.counselor_careers_valid(text[]) to anon, authenticated;
grant execute on function private.counselor_image_path_valid(text) to anon, authenticated;

-- 기존 값이 규칙과 다르면 변환하지 않고 중단한다. 이후 CHECK와 같은 함수를 쓴다.
do $image_path$
begin
  if exists (
    select 1
    from public.counselors
    where not private.counselor_image_path_valid(image_path)
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'COUNSELORS_IMAGE_PATH_INVALID: 기존 counselors.image_path가 허용 형식과 맞지 않아 중단합니다.';
  end if;
end;
$image_path$;

alter table public.counselors
  add column fields text[],
  add column careers text[] not null default '{}';

-- 기존 updated_at 트리거는 끄지 않는다. 이 이관 UPDATE로 updated_at이 갱신될 수 있다.
update public.counselors
set fields = array[field];

alter table public.counselors
  alter column fields set not null;

alter table public.counselors
  add constraint counselors_fields_check
    check (private.counselor_fields_valid(fields, field)),
  add constraint counselors_careers_check
    check (private.counselor_careers_valid(careers)),
  add constraint counselors_image_path_check
    check (private.counselor_image_path_valid(image_path));

alter table public.counselors
  alter column is_active set default false;

alter table public.consult_products
  alter column is_active set default false;
