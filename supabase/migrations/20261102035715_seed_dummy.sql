-- 1차 시안용 더미 데이터. 오픈 전에 삭제 마이그레이션으로 지운다.
insert into public.stores (slug, name, address, hours, description, sort_order)
values
  ('a', '매장 A', '대구 중구 동성로 (예시 주소)', '예시 영업시간: 매일 12:00~22:00', '더미 소개 문구입니다. 매장 A를 소개하는 예시입니다.', 0),
  ('b', '매장 B', '대구 중구 동성로 (예시 주소)', '예시 영업시간: 매일 12:00~22:00', '더미 소개 문구입니다. 매장 B를 소개하는 예시입니다.', 1);

insert into public.counselors (slug, store_id, name, field, tags, intro, description, is_recommended, is_new, affiliation, approval_status)
values
  ('a', (select id from public.stores where slug = 'a'), '상담사 A', 'tarot', array['타로', '연애운', '재회운'], '더미 소개 문구입니다. 타로 상담을 합니다.', '더미 소개 문구입니다. 타로 카드로 지금의 흐름을 함께 살펴봅니다. 실제 소개는 상담사 자료를 받은 뒤 바꿉니다.', true, false, 'store', 'approved'),
  ('b', (select id from public.stores where slug = 'a'), '상담사 B', 'saju', array['사주', '진로운', '금전운'], '더미 소개 문구입니다. 사주 상담을 합니다.', '더미 소개 문구입니다. 사주로 타고난 흐름과 앞으로의 방향을 함께 살펴봅니다. 실제 소개는 상담사 자료를 받은 뒤 바꿉니다.', true, true, 'store', 'approved'),
  ('c', (select id from public.stores where slug = 'a'), '상담사 C', 'tarot', array['타로', '고민상담'], '더미 소개 문구입니다. 타로 상담을 합니다.', '더미 소개 문구입니다. 타로 카드로 지금의 흐름을 함께 살펴봅니다. 실제 소개는 상담사 자료를 받은 뒤 바꿉니다.', true, false, 'store', 'approved'),
  ('d', (select id from public.stores where slug = 'b'), '상담사 D', 'saju', array['사주', '신년운'], '더미 소개 문구입니다. 사주 상담을 합니다.', '더미 소개 문구입니다. 사주로 타고난 흐름과 앞으로의 방향을 함께 살펴봅니다. 실제 소개는 상담사 자료를 받은 뒤 바꿉니다.', false, true, 'store', 'approved'),
  ('e', (select id from public.stores where slug = 'b'), '상담사 E', 'tarot', array['타로', '진로운'], '더미 소개 문구입니다. 타로 상담을 합니다.', '더미 소개 문구입니다. 타로 카드로 지금의 흐름을 함께 살펴봅니다. 실제 소개는 상담사 자료를 받은 뒤 바꿉니다.', false, true, 'store', 'approved'),
  ('f', (select id from public.stores where slug = 'b'), '상담사 F', 'saju', array['사주', '연애운'], '더미 소개 문구입니다. 사주 상담을 합니다.', '더미 소개 문구입니다. 사주로 타고난 흐름과 앞으로의 방향을 함께 살펴봅니다. 실제 소개는 상담사 자료를 받은 뒤 바꿉니다.', true, false, 'store', 'approved');

insert into public.consult_products (counselor_id, name, minutes, price)
values
  ((select id from public.counselors where slug = 'a'), '타로 상담 20분', 20, 20000),
  ((select id from public.counselors where slug = 'a'), '타로 상담 30분', 30, 30000),
  ((select id from public.counselors where slug = 'b'), '사주 상담 20분', 20, 20000),
  ((select id from public.counselors where slug = 'b'), '사주 상담 30분', 30, 30000),
  ((select id from public.counselors where slug = 'c'), '타로 상담 20분', 20, 20000),
  ((select id from public.counselors where slug = 'c'), '타로 상담 30분', 30, 30000),
  ((select id from public.counselors where slug = 'd'), '사주 상담 20분', 20, 20000),
  ((select id from public.counselors where slug = 'd'), '사주 상담 30분', 30, 30000),
  ((select id from public.counselors where slug = 'e'), '타로 상담 20분', 20, 20000),
  ((select id from public.counselors where slug = 'e'), '타로 상담 30분', 30, 30000),
  ((select id from public.counselors where slug = 'f'), '사주 상담 20분', 20, 20000),
  ((select id from public.counselors where slug = 'f'), '사주 상담 30분', 30, 30000);
