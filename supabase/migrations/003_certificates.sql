-- =====================================================================
-- 003_certificates.sql
-- ตารางเอกสาร 50 ทวิ (หัวเอกสาร + รายการเงินได้) ตัวนับเลขที่เอกสาร
-- และตารางบันทึกประวัติการใช้งาน
-- อ้างอิง Spec.md ข้อ 1.1, 6.1, 6.2
-- ต้องรันหลัง 002
-- =====================================================================

-- ---------------------------------------------------------------------
-- wht_certificates — หัวเอกสาร 1 แถว = หนังสือรับรอง 1 ใบ
--
-- payee_snapshot / payer_snapshot คือ "สำเนาข้อมูล ณ วันที่ออกเอกสาร"
-- เก็บไว้เพราะถ้าภายหลังผู้รับเงินย้ายที่อยู่หรือเปลี่ยนชื่อ
-- เอกสารเก่าที่พิมพ์ไปแล้วต้องยังแสดงข้อมูลเดิม ตรงกับกระดาษที่ส่งให้ผู้รับเงิน
-- ---------------------------------------------------------------------
create table if not exists public.wht_certificates (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references public.organizations(id) on delete cascade,
  doc_no                   text,                    -- เลขที่เอกสาร เช่น WHT-2569-0001 (ใบร่างอาจยังไม่มี)
  book_no                  text,                    -- เล่มที่
  form_type                text not null,
  payee_id                 uuid references public.payees(id) on delete set null,
  payee_snapshot           jsonb,
  payer_snapshot           jsonb,
  issue_date               date not null default current_date,
  total_amount             numeric(15,2) not null default 0,
  total_tax                numeric(15,2) not null default 0,
  total_tax_text           text,                    -- ยอดภาษีรวมเป็นตัวอักษรไทย
  pf_gpf_amount            numeric(15,2) not null default 0,   -- กบข./กสจ./กองทุนสงเคราะห์ครูฯ
  sso_amount               numeric(15,2) not null default 0,   -- กองทุนประกันสังคม
  provident_amount         numeric(15,2) not null default 0,   -- กองทุนสำรองเลี้ยงชีพ
  payment_condition        text not null default 'withheld',
  payment_condition_other  text,
  status                   text not null default 'draft',
  void_reason              text,
  note                     text,
  created_by               uuid references auth.users(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

comment on table public.wht_certificates is 'หัวเอกสารหนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ)';

-- สถานะเอกสารมีได้แค่ 3 แบบ (Spec ข้อ 6.1): ร่าง -> ออกแล้ว -> ยกเลิก
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'wht_certificates_status_check'
  ) then
    alter table public.wht_certificates
      add constraint wht_certificates_status_check
      check (status in ('draft', 'issued', 'void'));
  end if;
end $$;

-- ประเภทแบบยื่นภาษีที่รองรับ
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'wht_certificates_form_type_check'
  ) then
    alter table public.wht_certificates
      add constraint wht_certificates_form_type_check
      check (form_type in ('pnd1a', 'pnd1a_special', 'pnd2', 'pnd3', 'pnd2a', 'pnd3a', 'pnd53'));
  end if;
end $$;

-- เงื่อนไขการจ่ายเงิน: หัก ณ ที่จ่าย / ออกให้ครั้งเดียว / ออกให้ตลอดไป / อื่น ๆ
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'wht_certificates_payment_condition_check'
  ) then
    alter table public.wht_certificates
      add constraint wht_certificates_payment_condition_check
      check (payment_condition in ('withheld', 'paid_once', 'paid_always', 'other'));
  end if;
end $$;

-- เลขที่เอกสารห้ามซ้ำภายในองค์กรเดียวกัน
-- ใช้ unique index แบบมีเงื่อนไข เพื่อยอมให้ใบร่างที่ยังไม่มีเลข (ค่าว่าง) มีได้หลายใบ
create unique index if not exists wht_certificates_org_doc_no_unique
  on public.wht_certificates (org_id, doc_no)
  where doc_no is not null;

-- index สำหรับหน้าประวัติเอกสาร (กรองตามช่วงวันที่ และตามสถานะ)
create index if not exists wht_certificates_org_issue_date_idx
  on public.wht_certificates (org_id, issue_date desc);

create index if not exists wht_certificates_org_status_idx
  on public.wht_certificates (org_id, status);

create index if not exists wht_certificates_payee_idx
  on public.wht_certificates (payee_id);

drop trigger if exists wht_certificates_set_updated_at on public.wht_certificates;
create trigger wht_certificates_set_updated_at
  before update on public.wht_certificates
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- wht_certificate_items — รายการเงินได้ในเอกสาร (1 ใบมีได้หลายบรรทัด)
-- ตารางนี้ไม่มี org_id ของตัวเอง ต้องดูผ่าน certificate_id ว่าอยู่องค์กรไหน
-- ถ้าหัวเอกสารถูกลบ บรรทัดรายการจะถูกลบตามทันที (ON DELETE CASCADE)
-- ---------------------------------------------------------------------
create table if not exists public.wht_certificate_items (
  id                uuid primary key default gen_random_uuid(),
  certificate_id    uuid not null references public.wht_certificates(id) on delete cascade,
  income_type_code  text references public.income_types(code) on delete restrict,
  label_override    text,          -- ใช้เมื่อเลือก "อื่น ๆ" แล้วผู้ใช้พิมพ์ข้อความเอง
  paid_date         date,
  amount            numeric(15,2) not null default 0,
  rate              numeric(5,2),
  tax_amount        numeric(15,2) not null default 0,
  sort_order        int not null default 0
);

comment on table public.wht_certificate_items is 'บรรทัดรายการเงินได้ในเอกสาร 50 ทวิ';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'wht_certificate_items_amount_check'
  ) then
    alter table public.wht_certificate_items
      add constraint wht_certificate_items_amount_check
      check (amount >= 0 and tax_amount >= 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'wht_certificate_items_rate_check'
  ) then
    alter table public.wht_certificate_items
      add constraint wht_certificate_items_rate_check
      check (rate is null or (rate >= 0 and rate <= 100));
  end if;
end $$;

create index if not exists wht_certificate_items_certificate_idx
  on public.wht_certificate_items (certificate_id, sort_order);


-- ---------------------------------------------------------------------
-- doc_counters — ตัวนับเลขที่เอกสาร แยกตามองค์กรและปีภาษี
-- period เก็บเป็นข้อความ เช่น ปี พ.ศ. 4 หลัก เพื่อให้รีเซ็ตทุกปีได้ตาม Spec ข้อ 6.2
-- ---------------------------------------------------------------------
create table if not exists public.doc_counters (
  org_id     uuid not null references public.organizations(id) on delete cascade,
  period     text not null,
  last_seq   int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (org_id, period)
);

comment on table public.doc_counters is 'ตัวนับลำดับเลขที่เอกสาร แยกตามองค์กรและปีภาษี';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'doc_counters_last_seq_check'
  ) then
    alter table public.doc_counters
      add constraint doc_counters_last_seq_check check (last_seq >= 0);
  end if;
end $$;


-- ---------------------------------------------------------------------
-- audit_logs — บันทึกว่าใครทำอะไรกับเอกสารเมื่อไหร่
-- ใช้เป็นหลักฐานย้อนหลัง จึงต้องเขียนเพิ่มได้อย่างเดียว ห้ามแก้ ห้ามลบ
-- (กำหนดสิทธิ์ส่วนนี้ไว้ในไฟล์ 004)
-- ---------------------------------------------------------------------
create table if not exists public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  action      text not null,
  entity      text not null,        -- ชื่อตารางหรือชนิดข้อมูลที่ถูกกระทำ
  entity_id   uuid,
  payload     jsonb,
  created_at  timestamptz not null default now()
);

comment on table public.audit_logs is 'ประวัติการใช้งาน (สร้าง/แก้ไข/ยกเลิก/พิมพ์เอกสาร)';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'audit_logs_action_check'
  ) then
    alter table public.audit_logs
      add constraint audit_logs_action_check
      check (action in ('create', 'update', 'void', 'print'));
  end if;
end $$;

create index if not exists audit_logs_org_created_idx
  on public.audit_logs (org_id, created_at desc);

create index if not exists audit_logs_entity_idx
  on public.audit_logs (entity, entity_id);
