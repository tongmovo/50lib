-- =====================================================================
-- 002_payees_income_types.sql
-- ทะเบียนผู้ถูกหักภาษี ณ ที่จ่าย + ตารางแม่ประเภทเงินได้
-- อ้างอิง Spec.md ข้อ 1.1 และ 2
-- ต้องรันหลัง 001 เพราะอ้างอิงตาราง organizations
-- =====================================================================

-- pg_trgm ใช้ทำ index ค้นหาชื่อแบบ "มีคำนี้อยู่ตรงไหนก็ได้" (ILIKE %คำ%) ให้เร็ว
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;


-- ---------------------------------------------------------------------
-- เลขประจำตัวผู้เสียภาษีของ "ฝั่งบริษัทผู้จ่าย" ต้องเป็นตัวเลข 13 หลักพอดี
-- ยอมให้ว่าง (null) ได้ เพราะตอนเพิ่งสร้างองค์กรใหม่ยังไม่ได้กรอกข้อมูล
-- แต่ถ้ากรอกมาแล้วต้องถูกรูปแบบเสมอ
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'organizations_tax_id_format_check'
  ) then
    alter table public.organizations
      add constraint organizations_tax_id_format_check
      check (tax_id is null or tax_id ~ '^[0-9]{13}$');
  end if;
end $$;


-- ---------------------------------------------------------------------
-- payees — รายชื่อผู้ถูกหักภาษี (ผู้รับเงิน)
-- ---------------------------------------------------------------------
create table if not exists public.payees (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.organizations(id) on delete cascade,
  entity_type           text not null default 'juristic',  -- individual = บุคคลธรรมดา, juristic = นิติบุคคล
  tax_id                char(13) not null,
  title                 text,        -- คำนำหน้า เช่น นาย / บริษัท / ห้างหุ้นส่วนจำกัด
  name                  text not null,
  branch                text default '00000',
  address               text,
  phone                 text,
  email                 text,
  default_income_type   text,        -- ประเภทเงินได้ที่รายนี้ใช้บ่อย (ช่วยกรอกเร็ว)
  default_rate          numeric(5,2),
  note                  text,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid references auth.users(id) on delete set null
);

comment on table public.payees is 'ทะเบียนผู้ถูกหักภาษี ณ ที่จ่าย แยกตามองค์กร';

-- ประเภทผู้เสียภาษีมีได้แค่ 2 แบบ
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'payees_entity_type_check'
  ) then
    alter table public.payees
      add constraint payees_entity_type_check
      check (entity_type in ('individual', 'juristic'));
  end if;
end $$;

-- เลขผู้เสียภาษีของผู้ถูกหัก บังคับกรอก และต้องเป็นตัวเลข 13 หลักพอดี
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'payees_tax_id_format_check'
  ) then
    alter table public.payees
      add constraint payees_tax_id_format_check
      check (tax_id ~ '^[0-9]{13}$');
  end if;
end $$;

-- อัตราภาษีต้องอยู่ระหว่าง 0-100 %
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'payees_default_rate_check'
  ) then
    alter table public.payees
      add constraint payees_default_rate_check
      check (default_rate is null or (default_rate >= 0 and default_rate <= 100));
  end if;
end $$;

-- ห้ามมีเลขผู้เสียภาษีซ้ำกันภายในองค์กรเดียวกัน (คนละองค์กรซ้ำกันได้)
create unique index if not exists payees_org_tax_id_unique
  on public.payees (org_id, tax_id);

-- ใช้เวลากรองรายชื่อในหน้าทะเบียน
create index if not exists payees_org_active_idx
  on public.payees (org_id, is_active);

-- index สำหรับค้นหาชื่อแบบ ILIKE '%คำค้น%'
-- เขียนเป็น DO block เพราะต้องรู้ก่อนว่า pg_trgm ถูกติดตั้งไว้ที่ schema ไหน
do $$
declare
  ext_schema text;
begin
  select n.nspname into ext_schema
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pg_trgm';

  if ext_schema is null then
    raise notice 'ไม่พบส่วนขยาย pg_trgm จึงข้ามการสร้าง index ค้นหาชื่อ (ระบบยังใช้งานได้ แต่ค้นหาช้าลงเมื่อข้อมูลเยอะ)';
    return;
  end if;

  if to_regclass('public.payees_name_trgm_idx') is null then
    execute format(
      'create index payees_name_trgm_idx on public.payees using gin (name %I.gin_trgm_ops)',
      ext_schema
    );
  end if;
end $$;

drop trigger if exists payees_set_updated_at on public.payees;
create trigger payees_set_updated_at
  before update on public.payees
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- income_types — ตารางแม่ประเภทเงินได้ (master data กลาง ใช้ร่วมกันทุกองค์กร)
-- จึงไม่มีคอลัมน์ org_id
--
-- สำคัญ: default_rate เป็นเพียง "ค่าแนะนำ" เท่านั้น
-- หน้าจอต้องให้ผู้ใช้แก้ % ได้ทุกครั้ง (Spec.md ข้อ 1.1 และ 6.3)
-- ---------------------------------------------------------------------
create table if not exists public.income_types (
  code          text primary key,
  section_no    int not null,          -- หมายเลขข้อในแบบฟอร์ม 50 ทวิ (1-6)
  label_th      text not null,         -- ข้อความที่พิมพ์ลงเอกสาร
  default_rate  numeric(5,2),          -- null = ไม่มีค่าแนะนำ ให้ผู้ใช้กรอกเอง
  sort_order    int not null default 0
);

comment on table public.income_types is 'ประเภทเงินได้ที่เลือกได้ในเอกสาร 50 ทวิ (master data กลาง)';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'income_types_section_no_check'
  ) then
    alter table public.income_types
      add constraint income_types_section_no_check
      check (section_no between 1 and 6);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'income_types_default_rate_check'
  ) then
    alter table public.income_types
      add constraint income_types_default_rate_check
      check (default_rate is null or (default_rate >= 0 and default_rate <= 100));
  end if;
end $$;


-- ---------------------------------------------------------------------
-- ข้อมูลตั้งต้น 5 รายการ (ยืนยันจากลูกค้าแล้วว่าใช้จริงเท่านี้)
-- on conflict do nothing = รันซ้ำกี่ครั้งก็ไม่พัง และไม่ทับค่าที่ผู้ใช้แก้ไว้
-- ---------------------------------------------------------------------
insert into public.income_types (code, section_no, label_th, default_rate, sort_order) values
  ('rent',       5, 'ค่าเช่าทรัพย์สิน',          5.00, 1),
  ('service',    5, 'ค่าบริการ',                 3.00, 2),
  ('commission', 2, 'ค่าธรรมเนียม ค่านายหน้า',   null, 3),
  ('transport',  5, 'ค่าขนส่ง',                  1.00, 4),
  ('other',      6, 'อื่น ๆ (พิมพ์เอง)',          null, 5)
on conflict (code) do nothing;
