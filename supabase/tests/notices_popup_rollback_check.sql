-- NOTICES_POPUP_PREFLIGHT_OK(P0001)를 확인한 경우에만 별도로 전체 실행한다.
-- 성공 예외 DETAIL의 JSON을 아래 null 대신 $baseline$...$baseline$::jsonb로 붙여 넣는다.
-- 첫 ROLLBACK은 사전 검사의 의도된 예외로 중단된 트랜잭션을 종료한다.
rollback;

create or replace function pg_temp.notices_popup_snapshot()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'rows', (
      select jsonb_build_object(
        'count', count(*),
        'hash', md5(coalesce(string_agg(md5(to_jsonb(n)::text), '' order by n.id::text), ''))
      )
      from public.notices n
    ),
    'table', (
      select jsonb_build_object(
        'count', count(*),
        'hash', md5(coalesce(string_agg(md5(to_jsonb(s)::text), '' order by s.oid::text), ''))
      )
      from (
        select
          c.oid,
          c.relkind,
          c.relrowsecurity,
          c.relforcerowsecurity,
          c.relowner
        from pg_class c
        where c.oid = 'public.notices'::regclass
      ) s
    ),
    'columns', (
      select jsonb_build_object(
        'count', count(*),
        'hash', md5(coalesce(string_agg(md5(to_jsonb(s)::text), '' order by s.attnum::text), ''))
      )
      from (
        select
          a.attnum,
          a.attname,
          format_type(a.atttypid, a.atttypmod) as data_type,
          a.attnotnull,
          a.attidentity,
          a.attgenerated,
          a.attcollation,
          pg_get_expr(d.adbin, d.adrelid) as default_expression
        from pg_attribute a
        left join pg_attrdef d
          on d.adrelid = a.attrelid
          and d.adnum = a.attnum
        where a.attrelid = 'public.notices'::regclass
          and a.attnum > 0
          and not a.attisdropped
      ) s
    ),
    'constraints', (
      select jsonb_build_object(
        'count', count(*),
        'hash', md5(coalesce(string_agg(md5(to_jsonb(s)::text), '' order by s.conname), ''))
      )
      from (
        select
          c.conname,
          c.contype,
          c.condeferrable,
          c.condeferred,
          c.convalidated,
          pg_get_constraintdef(c.oid, true) as definition
        from pg_constraint c
        where c.conrelid = 'public.notices'::regclass
      ) s
    ),
    'indexes', (
      select jsonb_build_object(
        'count', count(*),
        'hash', md5(coalesce(string_agg(md5(to_jsonb(s)::text), '' order by s.indexname), ''))
      )
      from (
        select i.indexname, i.indexdef
        from pg_indexes i
        where i.schemaname = 'public'
          and i.tablename = 'notices'
      ) s
    ),
    'policies', (
      select jsonb_build_object(
        'count', count(*),
        'hash', md5(coalesce(string_agg(md5(to_jsonb(s)::text), '' order by s.policyname), ''))
      )
      from (
        select
          p.policyname,
          p.permissive,
          p.roles,
          p.cmd,
          p.qual,
          p.with_check
        from pg_policies p
        where p.schemaname = 'public'
          and p.tablename = 'notices'
      ) s
    ),
    'table_grants', (
      select jsonb_build_object(
        'count', count(*),
        'hash', md5(coalesce(string_agg(md5(to_jsonb(s)::text), '' order by s.grantee::text || ':' || s.grantor::text || ':' || s.privilege_type || ':' || s.is_grantable::text), ''))
      )
      from (
        select
          x.grantor,
          x.grantee,
          x.privilege_type,
          x.is_grantable
        from pg_class c
        cross join lateral aclexplode(c.relacl) x
        where c.oid = 'public.notices'::regclass
      ) s
    ),
    'column_grants', (
      select jsonb_build_object(
        'count', count(*),
        'hash', md5(coalesce(string_agg(md5(to_jsonb(s)::text), '' order by s.attnum::text || ':' || s.grantee::text || ':' || s.grantor::text || ':' || s.privilege_type || ':' || s.is_grantable::text), ''))
      )
      from (
        select
          a.attnum,
          a.attname,
          x.grantor,
          x.grantee,
          x.privilege_type,
          x.is_grantable
        from pg_attribute a
        cross join lateral aclexplode(a.attacl) x
        where a.attrelid = 'public.notices'::regclass
          and a.attnum > 0
          and not a.attisdropped
      ) s
    ),
    'triggers', (
      select jsonb_build_object(
        'count', count(*),
        'hash', md5(coalesce(string_agg(md5(to_jsonb(s)::text), '' order by s.tgname), ''))
      )
      from (
        select
          t.tgname,
          t.tgenabled,
          pg_get_triggerdef(t.oid, true) as definition
        from pg_trigger t
        where t.tgrelid = 'public.notices'::regclass
          and not t.tgisinternal
      ) s
    )
  );
$$;

do $$
declare
  baseline jsonb := null; -- 예: $baseline${"format":...}$baseline$::jsonb
  current_state jsonb;
  remaining_test_rows bigint;
begin
  if baseline is null
    or baseline->>'format' is distinct from 'notices-popup-preflight-v1'
    or baseline->'eligible' is distinct from 'true'::jsonb
    or jsonb_typeof(baseline->'state') is distinct from 'object'
    or jsonb_typeof(baseline->'test_ids') is distinct from 'array'
  then
    raise exception using
      errcode = 'P0001',
      message = 'NOTICES_POPUP_ROLLBACK_BASELINE_REQUIRED: 지정 성공 예외 DETAIL 원본이 필요합니다.';
  end if;

  if to_regclass('public.notices') is null then
    raise exception using
      errcode = 'P0001',
      message = 'NOTICES_POPUP_ROLLBACK_FAILED: public.notices 없음';
  end if;
  if exists (
    select 1
    from pg_attribute
    where attrelid = 'public.notices'::regclass
      and attname = 'is_popup'
      and not attisdropped
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'NOTICES_POPUP_ROLLBACK_FAILED: public.notices.is_popup 잔존';
  end if;

  select count(*)
  into remaining_test_rows
  from public.notices n
  where n.id in (
    select value::uuid
    from jsonb_array_elements_text(baseline->'test_ids')
  );
  if remaining_test_rows <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'NOTICES_POPUP_ROLLBACK_FAILED: 검사 공지 잔존';
  end if;

  current_state := pg_temp.notices_popup_snapshot();
  if current_state is distinct from baseline->'state' then
    raise exception using
      errcode = 'P0001',
      message = 'NOTICES_POPUP_ROLLBACK_FAILED: 기존 행·구조·정책·권한·트리거 불일치';
  end if;

  raise notice 'NOTICES_POPUP_ROLLBACK_OK: 새 열·검사 공지 없음. 기존 행·구조·정책·권한·트리거 원본 일치.';
end;
$$;

select 'NOTICES_POPUP_ROLLBACK_OK' as result;
