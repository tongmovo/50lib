-- =====================================================================
-- 004_rls_policies.sql
-- เปิด RLS (Row Level Security = กฎกันคนอื่นแอบดู/แก้ข้อมูลข้ามองค์กร)
-- ให้ครบทุกตาราง พร้อมสร้าง policy
-- อ้างอิง Spec.md ข้อ 1.2 และ CLAUDE.md ข้อ 4
-- ต้องรันหลัง 003
--
-- หลักการ: ผู้ใช้เห็นและแก้ได้เฉพาะข้อมูลขององค์กรตัวเองเท่านั้น
-- ไม่มี policy ไหนที่เขียนว่า using (true)
-- =====================================================================


-- =====================================================================
-- ส่วนที่ 1 — ฟังก์ชันช่วยตรวจสิทธิ์
--
-- ทำไมต้องมีฟังก์ชันนี้:
-- ถ้าเขียน policy ของตาราง profiles ให้ไปอ่านตาราง profiles เอง
-- Postgres จะวนตรวจสิทธิ์ซ้ำไม่รู้จบ (infinite recursion) แล้วเว็บจะพังทั้งระบบ
--
-- วิธีแก้: ทำเป็นฟังก์ชันแบบ SECURITY DEFINER
-- ซึ่งทำงานด้วยสิทธิ์ของเจ้าของฟังก์ชัน จึงอ่าน profiles ได้โดยไม่ต้องผ่าน RLS
-- แล้วให้ policy ของทุกตารางเรียกใช้ฟังก์ชันนี้แทนการ query ตรง ๆ
-- =====================================================================

-- คืนค่า org_id ขององค์กรที่ผู้ใช้คนที่ล็อกอินอยู่สังกัด
-- ถ้าบัญชีถูกปิดใช้งาน (is_active = false) จะคืนค่าว่าง = มองไม่เห็นข้อมูลใด ๆ
create or replace function public.get_my_org_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.org_id
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active = true;
$$;

comment on function public.get_my_org_id() is 'คืนรหัสองค์กรของผู้ใช้ที่ล็อกอินอยู่ (ใช้ใน policy ทุกตาราง)';

-- คืนบทบาทของผู้ใช้ที่ล็อกอินอยู่: admin หรือ user
create or replace function public.get_my_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active = true;
$$;

comment on function public.get_my_role() is 'คืนบทบาทของผู้ใช้ที่ล็อกอินอยู่ (admin / user)';

-- ให้เฉพาะผู้ที่ล็อกอินแล้วเรียกใช้ฟังก์ชันได้ ผู้ไม่ล็อกอิน (anon) เรียกไม่ได้
revoke all on function public.get_my_org_id() from public, anon;
revoke all on function public.get_my_role() from public, anon;
grant execute on function public.get_my_org_id() to authenticated, service_role;
grant execute on function public.get_my_role() to authenticated, service_role;


-- =====================================================================
-- ส่วนที่ 2 — เปิด RLS ทุกตาราง
-- เมื่อเปิดแล้ว ถ้าไม่มี policy ครอบคลุม = ทำอะไรไม่ได้เลย (ปลอดภัยไว้ก่อน)
-- =====================================================================
alter table public.organizations        enable row level security;
alter table public.profiles             enable row level security;
alter table public.payees               enable row level security;
alter table public.income_types         enable row level security;
alter table public.wht_certificates     enable row level security;
alter table public.wht_certificate_items enable row level security;
alter table public.doc_counters         enable row level security;
alter table public.audit_logs           enable row level security;


-- =====================================================================
-- ส่วนที่ 3 — สิทธิ์ระดับตาราง
-- RLS จะทำงานได้ ผู้ใช้ต้องมีสิทธิ์แตะตารางก่อน แล้ว RLS จึงกรองแถวอีกชั้น
-- ไม่ให้สิทธิ์ anon (ผู้ยังไม่ล็อกอิน) กับตารางใดเลย
-- =====================================================================
grant select, insert, update, delete on
  public.organizations,
  public.profiles,
  public.payees,
  public.wht_certificates,
  public.wht_certificate_items,
  public.doc_counters,
  public.audit_logs
to authenticated;

grant select on public.income_types to authenticated;


-- =====================================================================
-- ส่วนที่ 4 — Policy รายตาราง
-- =====================================================================

-- ---------------------------------------------------------------------
-- organizations
-- ตารางนี้ไม่มีคอลัมน์ org_id เพราะ id ของแถวคือรหัสองค์กรอยู่แล้ว
-- จึงเทียบด้วย id = get_my_org_id()
--
-- แก้ไขข้อมูลบริษัทได้เฉพาะ admin (Spec.md ข้อ 0 ตารางสิทธิ์)
-- ไม่มี policy INSERT/DELETE โดยตั้งใจ — การสร้างองค์กรใหม่และการลบองค์กร
-- ทำจากฝั่งผู้ดูแลระบบเท่านั้น ไม่เปิดให้ทำผ่านหน้าเว็บ
-- (ถ้าลบองค์กรได้จากหน้าเว็บ เอกสารภาษีทั้งหมดจะหายตามไปด้วย)
-- ---------------------------------------------------------------------
drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations
  for select to authenticated
  using (id = public.get_my_org_id());

drop policy if exists organizations_update on public.organizations;
create policy organizations_update on public.organizations
  for update to authenticated
  using (id = public.get_my_org_id() and public.get_my_role() = 'admin')
  with check (id = public.get_my_org_id() and public.get_my_role() = 'admin');


-- ---------------------------------------------------------------------
-- profiles
-- ทุกคนในองค์กรเห็นรายชื่อเพื่อนร่วมองค์กรได้
-- แต่เพิ่ม/แก้/ลบผู้ใช้ ทำได้เฉพาะ admin (Spec.md ข้อ 0)
-- ---------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (org_id = public.get_my_org_id());

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (org_id = public.get_my_org_id() and public.get_my_role() = 'admin');

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (org_id = public.get_my_org_id() and public.get_my_role() = 'admin')
  with check (org_id = public.get_my_org_id() and public.get_my_role() = 'admin');

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles
  for delete to authenticated
  using (org_id = public.get_my_org_id() and public.get_my_role() = 'admin');


-- ---------------------------------------------------------------------
-- payees — ทะเบียนผู้ถูกหักภาษี
-- ทั้ง admin และ user จัดการได้ (Spec.md ข้อ 0)
-- ---------------------------------------------------------------------
drop policy if exists payees_select on public.payees;
create policy payees_select on public.payees
  for select to authenticated
  using (org_id = public.get_my_org_id());

drop policy if exists payees_insert on public.payees;
create policy payees_insert on public.payees
  for insert to authenticated
  with check (org_id = public.get_my_org_id());

drop policy if exists payees_update on public.payees;
create policy payees_update on public.payees
  for update to authenticated
  using (org_id = public.get_my_org_id())
  with check (org_id = public.get_my_org_id());

drop policy if exists payees_delete on public.payees;
create policy payees_delete on public.payees
  for delete to authenticated
  using (org_id = public.get_my_org_id());


-- ---------------------------------------------------------------------
-- income_types — ตารางแม่กลาง ไม่มี org_id
-- ผู้ที่ล็อกอินแล้วทุกคนอ่านได้ แต่ไม่มีใครเพิ่ม/แก้/ลบผ่านหน้าเว็บได้
-- (ยังไม่สร้าง policy INSERT/UPDATE/DELETE ตามที่ตกลงไว้
--  ถ้าภายหลังต้องการให้ admin แก้รายการเองได้ ค่อยเพิ่มในไฟล์ migration ถัดไป)
-- ---------------------------------------------------------------------
drop policy if exists income_types_select on public.income_types;
create policy income_types_select on public.income_types
  for select to authenticated
  -- เงื่อนไขคือ "ต้องล็อกอินอยู่" ไม่ได้เขียน using (true) แบบเปิดโล่ง
  -- ตารางนี้ไม่มี org_id ให้เทียบ เพราะเป็นข้อมูลกลางที่ทุกองค์กรใช้ร่วมกัน
  using (auth.uid() is not null);


-- ---------------------------------------------------------------------
-- wht_certificates — หัวเอกสาร 50 ทวิ
-- ลบได้เฉพาะใบร่าง (draft) และเฉพาะ admin เท่านั้น (Spec.md ข้อ 1.2)
-- เอกสารที่ออกไปแล้วห้ามลบ ให้เปลี่ยนสถานะเป็น void แทน (กฎหมายภาษีต้องเก็บหลักฐาน)
-- ---------------------------------------------------------------------
drop policy if exists wht_certificates_select on public.wht_certificates;
create policy wht_certificates_select on public.wht_certificates
  for select to authenticated
  using (org_id = public.get_my_org_id());

drop policy if exists wht_certificates_insert on public.wht_certificates;
create policy wht_certificates_insert on public.wht_certificates
  for insert to authenticated
  with check (org_id = public.get_my_org_id());

drop policy if exists wht_certificates_update on public.wht_certificates;
create policy wht_certificates_update on public.wht_certificates
  for update to authenticated
  using (org_id = public.get_my_org_id())
  with check (org_id = public.get_my_org_id());

drop policy if exists wht_certificates_delete on public.wht_certificates;
create policy wht_certificates_delete on public.wht_certificates
  for delete to authenticated
  using (
    org_id = public.get_my_org_id()
    and status = 'draft'
    and public.get_my_role() = 'admin'
  );


-- ---------------------------------------------------------------------
-- wht_certificate_items — บรรทัดรายการเงินได้
-- ตารางนี้ไม่มีคอลัมน์ org_id จึงต้องวิ่งไปดูที่หัวเอกสาร (certificate_id)
-- ว่าใบนั้นเป็นขององค์กรเดียวกับผู้ใช้หรือไม่
-- ---------------------------------------------------------------------
drop policy if exists wht_certificate_items_select on public.wht_certificate_items;
create policy wht_certificate_items_select on public.wht_certificate_items
  for select to authenticated
  using (
    exists (
      select 1 from public.wht_certificates c
      where c.id = wht_certificate_items.certificate_id
        and c.org_id = public.get_my_org_id()
    )
  );

drop policy if exists wht_certificate_items_insert on public.wht_certificate_items;
create policy wht_certificate_items_insert on public.wht_certificate_items
  for insert to authenticated
  with check (
    exists (
      select 1 from public.wht_certificates c
      where c.id = wht_certificate_items.certificate_id
        and c.org_id = public.get_my_org_id()
    )
  );

drop policy if exists wht_certificate_items_update on public.wht_certificate_items;
create policy wht_certificate_items_update on public.wht_certificate_items
  for update to authenticated
  using (
    exists (
      select 1 from public.wht_certificates c
      where c.id = wht_certificate_items.certificate_id
        and c.org_id = public.get_my_org_id()
    )
  )
  with check (
    exists (
      select 1 from public.wht_certificates c
      where c.id = wht_certificate_items.certificate_id
        and c.org_id = public.get_my_org_id()
    )
  );

drop policy if exists wht_certificate_items_delete on public.wht_certificate_items;
create policy wht_certificate_items_delete on public.wht_certificate_items
  for delete to authenticated
  using (
    exists (
      select 1 from public.wht_certificates c
      where c.id = wht_certificate_items.certificate_id
        and c.org_id = public.get_my_org_id()
    )
  );


-- ---------------------------------------------------------------------
-- doc_counters — ตัวนับเลขที่เอกสาร
-- ต้องให้ทั้งอ่าน เพิ่ม และแก้ไขได้ เพราะทุกครั้งที่ออกเอกสารจะบวกเลขเพิ่ม 1
-- ---------------------------------------------------------------------
drop policy if exists doc_counters_select on public.doc_counters;
create policy doc_counters_select on public.doc_counters
  for select to authenticated
  using (org_id = public.get_my_org_id());

drop policy if exists doc_counters_insert on public.doc_counters;
create policy doc_counters_insert on public.doc_counters
  for insert to authenticated
  with check (org_id = public.get_my_org_id());

drop policy if exists doc_counters_update on public.doc_counters;
create policy doc_counters_update on public.doc_counters
  for update to authenticated
  using (org_id = public.get_my_org_id())
  with check (org_id = public.get_my_org_id());

drop policy if exists doc_counters_delete on public.doc_counters;
create policy doc_counters_delete on public.doc_counters
  for delete to authenticated
  using (org_id = public.get_my_org_id() and public.get_my_role() = 'admin');


-- ---------------------------------------------------------------------
-- audit_logs — ประวัติการใช้งาน
--
-- ตั้งใจให้มีแค่ 2 policy คือ อ่าน กับ เขียนเพิ่ม
-- ไม่มี policy UPDATE และ DELETE เพราะสมุดบันทึกหลักฐานที่ลบหรือแก้ย้อนหลังได้
-- จะใช้เป็นหลักฐานไม่ได้เลย
-- ---------------------------------------------------------------------
drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (org_id = public.get_my_org_id());

drop policy if exists audit_logs_insert on public.audit_logs;
create policy audit_logs_insert on public.audit_logs
  for insert to authenticated
  with check (org_id = public.get_my_org_id());

-- ถอนสิทธิ์แก้/ลบออกจากตัวตารางไปเลยอีกชั้น เพื่อความแน่นอน
revoke update, delete on public.audit_logs from authenticated;
