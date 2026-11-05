-- 사전 검사에서 CUSTOMER_SUPPORT_PREFLIGHT_OK 예외를 확인한 뒤 별도로 실행한다.
-- 같은 연결의 aborted 트랜잭션도 종료한다. 이 파일만으로 사전 검사 성공을 판단하지 않는다.
rollback;
do $$
begin
  if to_regclass('public.faqs') is not null
    or to_regclass('public.inquiries') is not null
    or to_regclass('private.inquiry_counters') is not null
    or to_regprocedure('private.set_inquiry_no()') is not null then
    raise exception 'CUSTOMER_SUPPORT_ROLLBACK_FAILED: 신규 객체가 남아 있습니다.';
  end if;
  raise notice 'CUSTOMER_SUPPORT_ROLLBACK_OK: 신규 테이블/함수 없음. 트랜잭션의 테스트 데이터도 함께 롤백됨.';
end;
$$;
