-- =====================================================================
-- 001_organizations_profiles.sql
-- ตารางองค์กร (บริษัทผู้จ่ายเงิน) และตารางผู้ใช้ระบบ
-- อ้างอิง Spec.md ข้อ 1.1
--
-- ไฟล์นี้รันซ้ำได้ปลอดภัย (ใช้ if not exists / or replace ทุกจุด)
-- ลำดับการรัน: 001 -> 002 -> 003 -> 004 -> (999 ไว้ตรวจสอบ)
-- =====================================================================

-- ต้องมีส่วนขยายนี้เพื่อใช้ gen_random_uuid() สร้างรหัสสุ่มเป็น PK
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;


-- ---------------------------------------------------------------------
-- ฟังก์ชันช่วย: อัปเดตคอลัมน์ updated_at ให้อัตโนมัติทุกครั้งที่มีการแก้แถว
-- เหตุผล: กันคนลืมอัปเดตเองจากฝั่งเว็บ ทำให้เวลาที่บันทึกไว้เชื่อถือได้เสมอ
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- organizations — ข้อมูลบริษัทผู้มีหน้าที่หักภาษี ณ ที่จ่าย
-- หมายเหตุ: ตารางนี้ไม่มีคอลัมน์ org_id เพราะตัว id ของแถวคือ org_id เอง
-- ---------------------------------------------------------------------
create table if not exists public.organizations (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  tax_id            char(13),                  -- เลขประจำตัวผู้เสียภาษี 13 หลัก
  branch            text default '00000',      -- "00000" = สำนักงานใหญ่
  address           text,
  logo_url          text,                      -- ไฟล์ใน Supabase Storage
  signature_url     text,                      -- รูปลายเซ็นผู้มีอำนาจ
  signer_name       text,
  signer_position   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.organizations is 'บริษัทผู้จ่ายเงิน (ผู้มีหน้าที่หักภาษี ณ ที่จ่าย)';

drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- profiles — ผู้ใช้ระบบ ผูก 1 ต่อ 1 กับตาราง auth.users ของ Supabase
-- ถ้าผู้ใช้ถูกลบออกจากระบบ auth แถวนี้จะถูกลบตามไปด้วย (CASCADE)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  org_id      uuid not null references public.organizations(id) on delete restrict,
  full_name   text,
  role        text not null default 'user',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is 'ผู้ใช้ระบบ (ผูกกับ auth.users) — บอกว่าใครอยู่องค์กรไหน และมีสิทธิ์ระดับใด';

-- บทบาทมีได้แค่ 2 แบบตาม Spec ข้อ 0
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_role_check'
  ) then
    alter table public.profiles
      add constraint profiles_role_check check (role in ('admin', 'user'));
  end if;
end $$;

-- ใช้ค้นหาว่าองค์กรหนึ่งมีผู้ใช้กี่คน (หน้าตั้งค่าผู้ใช้)
create index if not exists profiles_org_id_idx on public.profiles (org_id);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
