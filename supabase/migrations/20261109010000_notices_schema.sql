-- 공지사항 기반만 생성한다. 실제 공지·이미지·팝업 데이터는 넣지 않는다.
create table public.notices (
  id uuid primary key default gen_random_uuid(),
  title text not null constraint notices_title_check check (title ~ '[^[:space:]]' and char_length(title) <= 100),
  body text not null constraint notices_body_check check (body ~ '[^[:space:]]' and char_length(body) <= 5000),
  image_path text constraint notices_image_path_check check (
    image_path ~ '^notices/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
  ),
  image_alt text constraint notices_image_alt_check check (image_alt ~ '[^[:space:]]' and char_length(image_alt) <= 200),
  is_pinned boolean not null default false,
  is_published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notices_image_requires_alt_check check (image_path is null or image_alt is not null),
  constraint notices_published_at_check check (not is_published or published_at is not null)
);
alter table public.notices enable row level security;
create index notices_published_sort_idx on public.notices (is_published, is_pinned desc, published_at desc, id desc);
create trigger notices_set_updated_at before update on public.notices
for each row execute function private.set_updated_at();

create policy notices_select_published_or_admin on public.notices
for select to anon, authenticated using (is_published or (select private.is_admin()));
create policy notices_insert_admin on public.notices
for insert to authenticated with check ((select private.is_admin()));
create policy notices_update_admin on public.notices
for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy notices_delete_admin on public.notices
for delete to authenticated using ((select private.is_admin()));

revoke all on public.notices from public, anon, authenticated, service_role;
grant select on public.notices to anon, authenticated;
grant insert, update, delete on public.notices to authenticated;

-- BEGIN EXACT BUCKET
do $bucket$
declare
  existing storage.buckets%rowtype;
  mismatch text[] := '{}';
  expected_mimes text[] := array['image/jpeg','image/png','image/webp'];
begin
  -- 경쟁 삽입도 오류로 중단한다. ON CONFLICT로 불일치를 숨기지 않는다.
  select * into existing from storage.buckets where id = 'public-images' for update;
  if not found then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('public-images', 'public-images', true, 5242880, expected_mimes);
  else
    if existing.name is distinct from 'public-images' then mismatch := array_append(mismatch, 'name'); end if;
    if existing.public is distinct from true then mismatch := array_append(mismatch, 'public'); end if;
    if existing.file_size_limit is distinct from 5242880 then mismatch := array_append(mismatch, 'file_size_limit'); end if;
    -- 집합 비교: 배열 순서·중복에는 영향받지 않으며 NULL 원소는 거부한다.
    if existing.allowed_mime_types is null
      or array_position(existing.allowed_mime_types, null) is not null
      or not (existing.allowed_mime_types @> expected_mimes and existing.allowed_mime_types <@ expected_mimes)
    then mismatch := array_append(mismatch, 'allowed_mime_types'); end if;
    if cardinality(mismatch) > 0 then
      raise exception using errcode = 'P0001',
        message = 'NOTICES_BUCKET_CONFIG_MISMATCH: ' || array_to_string(mismatch, ',');
    end if;
  end if;
end;
$bucket$;
-- END EXACT BUCKET

-- Storage 전역 GRANT/구조/기존 정책은 변경하지 않는다.
create policy public_images_select_admin on storage.objects
for select to authenticated using (bucket_id = 'public-images' and (select private.is_admin()));
create policy public_images_insert_admin on storage.objects
for insert to authenticated with check (bucket_id = 'public-images' and (select private.is_admin()));
create policy public_images_update_admin on storage.objects
for update to authenticated using (bucket_id = 'public-images' and (select private.is_admin()))
with check (bucket_id = 'public-images' and (select private.is_admin()));
create policy public_images_delete_admin on storage.objects
for delete to authenticated using (bucket_id = 'public-images' and (select private.is_admin()));
