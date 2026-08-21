-- =====================================================================
-- 007_storage_bucket.sql
-- เตรียมที่เก็บไฟล์โลโก้และลายเซ็น + เพิ่มช่องตั้งค่าเลขที่เอกสาร
-- ต้องรันหลัง 006
--
-- ไฟล์นี้ทำ 3 อย่าง
--   ส่วนที่ 1: เพิ่มคอลัมน์ doc_prefix ในตาราง organizations
--   ส่วนที่ 2: สร้างที่เก็บไฟล์ (bucket) ชื่อ org-assets แบบไม่เปิดสาธารณะ
--   ส่วนที่ 3: กำหนดสิทธิ์ว่าใครเข้าถึงไฟล์ไหนได้บ้าง
-- =====================================================================


-- =====================================================================
-- ส่วนที่ 1 — ช่องเก็บคำนำหน้าเลขที่เอกสาร
--
-- เลขที่เอกสารมีรูปแบบ {คำนำหน้า}-{ปี พ.ศ. 4 หลัก}-{ลำดับ 4 หลัก}
-- เช่น WHT-2569-0001 ตาม Spec.md ข้อ 6.2
-- ส่วนที่ตั้งค่าได้คือคำนำหน้าเท่านั้น ที่เหลือระบบสร้างให้เอง
-- =====================================================================
alter table public.organizations
  add column if not exists doc_prefix text not null default 'WHT';

comment on column public.organizations.doc_prefix is
  'คำนำหน้าเลขที่เอกสาร เช่น WHT จะได้เลขที่เป็น WHT-2569-0001';

-- จำกัดให้ใช้ได้เฉพาะตัวอักษรอังกฤษพิมพ์ใหญ่ ตัวเลข และขีดกลาง ยาว 1-10 ตัว
-- เหตุผล: เลขที่เอกสารต้องพิมพ์ลงกระดาษราชการ ถ้าใส่อักขระแปลก ๆ หรือยาวเกินไปจะล้นช่อง
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'organizations_doc_prefix_check'
  ) then
    alter table public.organizations
      add constraint organizations_doc_prefix_check
      check (doc_prefix ~ '^[A-Z0-9-]{1,10}$');
  end if;
end $$;


-- =====================================================================
-- ส่วนที่ 2 — สร้างที่เก็บไฟล์ (bucket)
--
-- ตั้งเป็นแบบ "ไม่เปิดสาธารณะ" (public = false) โดยตั้งใจ
-- เพราะโลโก้และลายเซ็นของบริษัทไม่ควรให้ใครก็ได้บนอินเทอร์เน็ตเปิดดูได้
-- เวลาเว็บจะแสดงรูป จะขอลิงก์ชั่วคราวที่หมดอายุได้ (signed URL) เป็นครั้ง ๆ ไป
--
-- โครงสร้างการเก็บไฟล์: {รหัสองค์กร}/logo.png และ {รหัสองค์กร}/signature.png
-- การแยกโฟลเดอร์ตามรหัสองค์กรแบบนี้ ทำให้เขียนกฎความปลอดภัยในส่วนที่ 3 ได้ง่ายและแม่นยำ
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'org-assets',
  'org-assets',
  false,
  2097152,                  -- จำกัดขนาดไฟล์ไม่เกิน 2 MB ต่อไฟล์ (2097152 ไบต์)
  array['image/png']        -- รับเฉพาะไฟล์ PNG เพราะต้องการพื้นหลังโปร่งใส
)
on conflict (id) do update
  set public = false,
      file_size_limit = 2097152,
      allowed_mime_types = array['image/png'];


-- =====================================================================
-- ส่วนที่ 3 — กฎความปลอดภัยของไฟล์
--
-- ตาราง storage.objects เป็นตารางของ Supabase ที่เปิด RLS ไว้ให้แล้ว
-- เราจึงเพิ่มเฉพาะ policy
--
-- หลักการ:
--   - ดูไฟล์ได้: ทุกคนในองค์กรเดียวกัน (ทั้ง admin และ user)
--     เพราะหน้าเอกสาร 50 ทวิ ต้องแสดงโลโก้ให้ผู้ใช้ทุกคนเห็นตอนพิมพ์
--   - อัปโหลด แก้ไข และลบไฟล์ได้: เฉพาะ admin
--     เพราะเป็นการเปลี่ยนหน้าตาเอกสารที่ออกไปในนามบริษัท
--
-- ใช้ฟังก์ชัน get_my_org_id() และ get_my_role() จากไฟล์ 004 เหมือนตารางอื่น ๆ
-- storage.foldername(name) จะคืนชื่อโฟลเดอร์ของไฟล์ออกมาเป็นรายการ
-- ตัวแรก [1] คือรหัสองค์กรที่เราใช้ตั้งชื่อโฟลเดอร์ไว้
-- =====================================================================

drop policy if exists org_assets_select on storage.objects;
create policy org_assets_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'org-assets'
    and (storage.foldername(name))[1] = public.get_my_org_id()::text
  );

drop policy if exists org_assets_insert on storage.objects;
create policy org_assets_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'org-assets'
    and (storage.foldername(name))[1] = public.get_my_org_id()::text
    and public.get_my_role() = 'admin'
  );

drop policy if exists org_assets_update on storage.objects;
create policy org_assets_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'org-assets'
    and (storage.foldername(name))[1] = public.get_my_org_id()::text
    and public.get_my_role() = 'admin'
  )
  with check (
    bucket_id = 'org-assets'
    and (storage.foldername(name))[1] = public.get_my_org_id()::text
    and public.get_my_role() = 'admin'
  );

drop policy if exists org_assets_delete on storage.objects;
create policy org_assets_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'org-assets'
    and (storage.foldername(name))[1] = public.get_my_org_id()::text
    and public.get_my_role() = 'admin'
  );


-- =====================================================================
-- คำสั่งตรวจสอบ (รันแล้วดูผลได้เลย ไม่ได้แก้อะไร)
-- =====================================================================

-- ตรวจข้อ 1: bucket ถูกสร้างและตั้งเป็นไม่เปิดสาธารณะจริงหรือไม่
-- ผลที่ถูกต้อง: ได้ 1 แถว ช่อง public ต้องเป็น false
select
  id                  as "ชื่อที่เก็บไฟล์",
  public              as "เปิดสาธารณะ (ต้องเป็น false)",
  file_size_limit     as "ขนาดไฟล์สูงสุด (ไบต์)",
  allowed_mime_types  as "ชนิดไฟล์ที่อนุญาต"
from storage.buckets
where id = 'org-assets';

-- ตรวจข้อ 2: มี policy ของไฟล์ครบ 4 ข้อหรือไม่ (SELECT, INSERT, UPDATE, DELETE)
-- ผลที่ถูกต้อง: ได้ 4 แถว
select
  policyname as "ชื่อกฎ",
  cmd        as "คำสั่ง"
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname like 'org_assets%'
order by cmd;

-- ตรวจข้อ 3: คอลัมน์ doc_prefix ถูกเพิ่มแล้วหรือยัง
-- ผลที่ถูกต้อง: ได้ 1 แถว ค่าตั้งต้นเป็น WHT
select
  column_name    as "ชื่อคอลัมน์",
  data_type      as "ชนิดข้อมูล",
  column_default as "ค่าตั้งต้น"
from information_schema.columns
where table_schema = 'public'
  and table_name = 'organizations'
  and column_name = 'doc_prefix';
