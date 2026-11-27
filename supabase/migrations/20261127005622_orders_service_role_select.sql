-- 비회원 주문 조회 서버가 service_role로 주문과 주문 상품을 읽게 한다.
-- SELECT만 허용한다. 쓰기와 그 밖의 권한은 주지 않는다.

grant select on public.orders, public.order_items to service_role;
