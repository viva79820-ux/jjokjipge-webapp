-- 기존 공지의 콘텐츠를 홈 팝업으로 표시할지 설정한다.
alter table public.notices
add column is_popup boolean not null default false;
