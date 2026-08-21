-- =====================================================================
-- 999_verify_rls.sql
-- ไฟล์ตรวจสอบ (ไม่ได้สร้างหรือแก้อะไรทั้งสิ้น รันกี่ครั้งก็ปลอดภัย)
--
-- วิธีใช้: รันหลังจากรัน 001 -> 002 -> 003 -> 004 -> 005 ครบแล้ว
-- แล้วดูผลทีละหัวข้อว่าตรงกับที่ควรจะเป็นหรือไม่
--
-- เกณฑ์ผ่านโดยรวม: ข้อ 1 ต้องได้ 8 แถวขึ้น OK ทุกแถว, ข้อ 6 ขึ้น OK ทั้ง 2 แถว,
-- ข้อ 8 ต้องได้ 5 แถว ส่วนข้อ 4, 5, 7 และ 9 ต้องไม่มีข้อมูลออกมาเลย (0 rows)
-- =====================================================================


-- ---------------------------------------------------------------------
-- ตรวจข้อ 1: ทุกตารางเปิด RLS แล้วจริงหรือยัง
-- ผลที่ถูกต้อง: ได้ 8 แถว และช่อง "ผลตรวจ" ต้องขึ้น OK ทุกแถว
-- ---------------------------------------------------------------------
select
  tablename                                        as "ชื่อตาราง",
  rowsecurity                                      as "เปิด RLS แล้ว",
  case when rowsecurity then 'OK' else 'ยังไม่เปิด' end as "ผลตรวจ"
from pg_tables
where schemaname = 'public'
  and tablename in (
    'organizations', 'profiles', 'payees', 'income_types',
    'wht_certificates', 'wht_certificate_items', 'doc_counters', 'audit_logs'
  )
order by tablename;


-- ---------------------------------------------------------------------
-- ตรวจข้อ 2: แต่ละตารางมี policy กี่อัน และครอบคลุมคำสั่งอะไรบ้าง
-- ผลที่ถูกต้อง (ตามที่ออกแบบไว้ในไฟล์ 004):
--   organizations          2 อัน  (SELECT, UPDATE)
--   profiles               4 อัน  (SELECT, INSERT, UPDATE, DELETE)
--   payees                 4 อัน  (SELECT, INSERT, UPDATE, DELETE)
--   income_types           1 อัน  (SELECT อย่างเดียว)
--   wht_certificates       4 อัน  (SELECT, INSERT, UPDATE, DELETE)
--   wht_certificate_items  4 อัน  (SELECT, INSERT, UPDATE, DELETE)
--   doc_counters           4 อัน  (SELECT, INSERT, UPDATE, DELETE)
--   audit_logs             2 อัน  (SELECT, INSERT เท่านั้น — ตั้งใจไม่ให้แก้/ลบ)
-- ---------------------------------------------------------------------
select
  tablename                          as "ชื่อตาราง",
  count(*)                           as "จำนวน policy",
  string_agg(distinct cmd, ', ' order by cmd) as "ครอบคลุมคำสั่ง"
from pg_policies
where schemaname = 'public'
group by tablename
order by tablename;


-- ---------------------------------------------------------------------
-- ตรวจข้อ 3: รายละเอียด policy ทุกอัน (ไว้ดูว่าเงื่อนไขเขียนถูกไหม)
-- ---------------------------------------------------------------------
select
  tablename   as "ชื่อตาราง",
  policyname  as "ชื่อ policy",
  cmd         as "คำสั่ง",
  roles       as "ใช้กับบทบาท",
  qual        as "เงื่อนไขตอนอ่าน (USING)",
  with_check  as "เงื่อนไขตอนเขียน (WITH CHECK)"
from pg_policies
where schemaname = 'public'
order by tablename, cmd, policyname;


-- ---------------------------------------------------------------------
-- ตรวจข้อ 4: หาตารางที่ "เปิด RLS แล้วแต่ยังไม่มี policy เลย"
-- ตารางแบบนี้จะใช้งานไม่ได้เลย (ผู้ใช้จะมองไม่เห็นข้อมูลอะไรเลย)
-- ผลที่ถูกต้อง: ต้องไม่มีแถวใดถูกส่งกลับมา (0 rows)
-- ---------------------------------------------------------------------
select t.tablename as "ตารางที่เปิด RLS แต่ยังไม่มี policy"
from pg_tables t
where t.schemaname = 'public'
  and t.rowsecurity = true
  and not exists (
    select 1 from pg_policies p
    where p.schemaname = t.schemaname
      and p.tablename = t.tablename
  );


-- ---------------------------------------------------------------------
-- ตรวจข้อ 5: ต้องไม่มี policy ไหนเขียนแบบเปิดกว้าง using (true)
-- ตามกฎใน CLAUDE.md ข้อ 4
-- ผลที่ถูกต้อง: ต้องไม่มีแถวใดถูกส่งกลับมา (0 rows)
-- ---------------------------------------------------------------------
select
  tablename  as "ชื่อตาราง",
  policyname as "ชื่อ policy",
  qual       as "เงื่อนไข"
from pg_policies
where schemaname = 'public'
  and (qual = 'true' or with_check = 'true');


-- ---------------------------------------------------------------------
-- ตรวจข้อ 6: ฟังก์ชันช่วยตรวจสิทธิ์ถูกสร้างแบบ SECURITY DEFINER หรือไม่
-- ผลที่ถูกต้อง: ได้ 2 แถว (get_my_org_id, get_my_role) และ "ผลตรวจ" ขึ้น OK ทั้งคู่
-- ---------------------------------------------------------------------
select
  p.proname                                          as "ชื่อฟังก์ชัน",
  p.prosecdef                                        as "เป็น SECURITY DEFINER",
  case when p.prosecdef then 'OK' else 'ผิด' end     as "ผลตรวจ"
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('get_my_org_id', 'get_my_role')
order by p.proname;


-- ---------------------------------------------------------------------
-- ตรวจข้อ 7: ผู้ที่ยังไม่ล็อกอิน (บทบาท anon) ต้องไม่มีสิทธิ์แตะตารางใดเลย
-- ผลที่ถูกต้อง: ต้องไม่มีแถวใดถูกส่งกลับมา (0 rows)
--
-- หมายเหตุ: ถ้ายังไม่ได้รันไฟล์ 005 ข้อนี้จะมีข้อมูลออกมาเต็มไปหมด
-- ซึ่งเป็นค่าตั้งต้นของ Supabase เอง ไม่ใช่ความผิดพลาดของไฟล์ 001-004
-- ให้รัน 005_revoke_anon_grants.sql แล้วกลับมาตรวจข้อ 9 ท้ายไฟล์นี้อีกครั้ง
-- ---------------------------------------------------------------------
select
  table_name    as "ชื่อตาราง",
  privilege_type as "สิทธิ์ที่หลุดให้ anon"
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'anon'
  and table_name in (
    'organizations', 'profiles', 'payees', 'income_types',
    'wht_certificates', 'wht_certificate_items', 'doc_counters', 'audit_logs'
  )
order by table_name, privilege_type;


-- ---------------------------------------------------------------------
-- ตรวจข้อ 8: ข้อมูลตั้งต้นประเภทเงินได้ครบ 5 รายการหรือไม่
-- ผลที่ถูกต้อง: 5 แถว เรียงตาม sort_order 1-5
-- ---------------------------------------------------------------------
select
  code         as "รหัส",
  section_no   as "ข้อในฟอร์ม",
  label_th     as "ข้อความในเอกสาร",
  default_rate as "อัตราแนะนำ %",
  sort_order   as "ลำดับ"
from public.income_types
order by sort_order;


-- ---------------------------------------------------------------------
-- ตรวจข้อ 9: หลังรัน 005 แล้ว anon role ต้องไม่มีสิทธิ์อะไรเหลือเลยในทุกตาราง
-- ผลที่ถูกต้อง: ต้องไม่มีแถวใดถูกส่งกลับมา (0 rows) -- เหมือนข้อ 7 แต่เช็คซ้ำหลังแก้
--
-- ข้อนี้กว้างกว่าข้อ 7 ตรงที่ไม่ได้ไล่ชื่อตารางทีละตาราง
-- แต่กวาดดูทุกตารางใน schema public เผื่อมีตารางอื่นที่สร้างเพิ่มภายหลัง
-- ---------------------------------------------------------------------
select
  table_name     as "ชื่อตาราง",
  privilege_type as "สิทธิ์ที่ยังหลุดให้ anon"
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'anon'
order by table_name, privilege_type;
