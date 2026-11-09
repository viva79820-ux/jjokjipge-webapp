-- NOTICES_PREFLIGHT_OK(P0001)를 확인한 경우에만 실행한다.
-- 그 예외 DETAIL의 원본 JSON을 아래 null 대신 $baseline$...$baseline$::jsonb로 붙여 넣는다.
-- 기존 객체 때문에 NOTICES_PREFLIGHT_NOT_INITIAL로 중단됐다면 이 파일로 설치 전 상태를 판정하지 않는다.
-- SQL Editor는 사전 검사 -> 지정 성공 예외 및 DETAIL 복사 -> 이 파일 전체 별도 실행 순서다.
rollback;
do $$
declare
  baseline jsonb := null; -- 예: $baseline${"format":...}$baseline$::jsonb (실제 DETAIL 전체를 사용)
  current_bucket jsonb;
  current_policies jsonb;
begin
  if baseline is null or baseline->>'format' is distinct from 'notices-preflight-v1'
    or baseline->'eligible' is distinct from 'true'::jsonb
    or jsonb_typeof(baseline->'policies') is distinct from 'array'
    or baseline->'bucket' is distinct from 'null'::jsonb then
    raise exception 'NOTICES_ROLLBACK_BASELINE_REQUIRED: 초기 설치 사전 검사의 지정 성공 예외 DETAIL 원본이 필요합니다.';
  end if;
  if to_regclass('public.notices') is not null then raise exception 'NOTICES_ROLLBACK_FAILED: public.notices'; end if;
  if to_regclass('public.notices_published_sort_idx') is not null then raise exception 'NOTICES_ROLLBACK_FAILED: notices_published_sort_idx'; end if;
  select to_jsonb(b) into current_bucket from storage.buckets b where id='public-images';
  if coalesce(current_bucket,'null'::jsonb) is distinct from baseline->'bucket' then
    raise exception 'NOTICES_ROLLBACK_FAILED: storage.buckets public-images 원본 불일치';
  end if;
  select coalesce(jsonb_agg(to_jsonb(p) order by policyname),'[]'::jsonb) into current_policies
  from pg_policies p where schemaname='storage' and tablename='objects';
  if current_policies is distinct from baseline->'policies' then
    raise exception 'NOTICES_ROLLBACK_FAILED: storage.objects 정책 전체 정의 불일치(신규 정책 잔존 또는 기존 정책 변경)';
  end if;
  raise notice 'NOTICES_ROLLBACK_OK: 신규 공지 테이블·인덱스·트리거·정책·버킷 없음. 기존 Storage 정책 원본 일치.';
end;
$$;
select 'NOTICES_ROLLBACK_OK' as result;
