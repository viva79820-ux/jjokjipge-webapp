-- 연결 상담사가 있는 매장은 삭제하지 못하게 하고, 상담사 소속은 명시적으로 변경하게 한다.
-- 단일 DO 문은 하나의 트랜잭션에서 실행되므로 실패하면 기존 FK와 데이터가 함께 복원된다.
do $stores_delete_restrict$
declare
  target_constraint record;
  store_id_attnum smallint;
  store_pk_attnum smallint;
  matching_count integer;
begin
  if to_regclass('public.counselors') is null
    or to_regclass('public.stores') is null
  then
    raise exception using
      errcode = 'P0001',
      message = 'STORES_DELETE_RESTRICT_PREREQUISITE_FAILED: public.counselors 또는 public.stores가 없습니다.';
  end if;

  select attnum
  into store_id_attnum
  from pg_attribute
  where attrelid = 'public.counselors'::regclass
    and attname = 'store_id'
    and attnum > 0
    and not attisdropped;

  select attnum
  into store_pk_attnum
  from pg_attribute
  where attrelid = 'public.stores'::regclass
    and attname = 'id'
    and attnum > 0
    and not attisdropped;

  if store_id_attnum is null or store_pk_attnum is null then
    raise exception using
      errcode = 'P0001',
      message = 'STORES_DELETE_RESTRICT_PREREQUISITE_FAILED: counselors.store_id 또는 stores.id가 없습니다.';
  end if;

  select count(*)
  into matching_count
  from pg_constraint
  where conrelid = 'public.counselors'::regclass
    and contype = 'f'
    and conkey = array[store_id_attnum]::smallint[];

  if matching_count <> 1 then
    raise exception using
      errcode = 'P0001',
      message = format(
        'STORES_DELETE_RESTRICT_PREREQUISITE_FAILED: counselors.store_id FK가 1개여야 하지만 %s개입니다.',
        matching_count
      );
  end if;

  select
    c.oid,
    c.conname,
    c.confrelid,
    c.confkey,
    c.confupdtype,
    c.confdeltype,
    c.confmatchtype,
    c.condeferrable,
    c.condeferred,
    c.convalidated
  into target_constraint
  from pg_constraint c
  where c.conrelid = 'public.counselors'::regclass
    and c.contype = 'f'
    and c.conkey = array[store_id_attnum]::smallint[];

  if target_constraint.conname <> 'counselors_store_id_fkey'
    or target_constraint.confrelid <> 'public.stores'::regclass
    or target_constraint.confkey <> array[store_pk_attnum]::smallint[]
    or target_constraint.confupdtype <> 'a'
    or target_constraint.confdeltype <> 'n'
    or target_constraint.confmatchtype <> 's'
    or target_constraint.condeferrable
    or target_constraint.condeferred
    or not target_constraint.convalidated
    or (
      select attnotnull
      from pg_attribute
      where attrelid = 'public.counselors'::regclass
        and attnum = store_id_attnum
    )
  then
    raise exception using
      errcode = 'P0001',
      message = 'STORES_DELETE_RESTRICT_PREREQUISITE_FAILED: counselors_store_id_fkey가 예상한 NULL 허용·SET NULL 구조가 아닙니다.',
      detail = pg_get_constraintdef(target_constraint.oid, true);
  end if;

  execute format(
    'alter table public.counselors drop constraint %I, add constraint %I foreign key (store_id) references public.stores(id) match simple on update no action on delete restrict not deferrable',
    target_constraint.conname,
    target_constraint.conname
  );

  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.counselors'::regclass
      and c.conname = target_constraint.conname
      and c.contype = 'f'
      and c.conkey = array[store_id_attnum]::smallint[]
      and c.confrelid = 'public.stores'::regclass
      and c.confkey = array[store_pk_attnum]::smallint[]
      and c.confupdtype = 'a'
      and c.confdeltype = 'r'
      and c.confmatchtype = 's'
      and not c.condeferrable
      and not c.condeferred
      and c.convalidated
  ) or (
    select attnotnull
    from pg_attribute
    where attrelid = 'public.counselors'::regclass
      and attnum = store_id_attnum
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'STORES_DELETE_RESTRICT_POSTCHECK_FAILED: counselors_store_id_fkey가 예상한 RESTRICT 구조로 만들어지지 않았습니다.';
  end if;
end;
$stores_delete_restrict$;
