-- =====================================================================
-- 010_protect_issued_certificates.sql
-- ล็อกเอกสารที่ออกไปแล้วไม่ให้ถูกแก้ และจำกัดสิทธิ์การยกเลิกเอกสารไว้ที่ admin
-- ต้องรันหลัง 009
--
-- -------------------------------------------------------------------
-- ช่องโหว่ที่ตรวจพบและไฟล์นี้แก้
-- -------------------------------------------------------------------
-- กฎเดิมในไฟล์ 004 เขียนไว้ว่า
--     using (org_id = get_my_org_id()) with check (org_id = get_my_org_id())
-- ซึ่งแปลว่า "ใครก็ได้ในองค์กร แก้เอกสารใบไหนก็ได้ รวมถึงใบที่ออกไปแล้ว"
--
-- ขัดกับกฎสำคัญ 2 ข้อ
--   1) Spec.md ข้อ 4 และ 6.1: เอกสารที่ออกแล้ว (issued) ห้ามแก้ตัวเลขใด ๆ
--      ถ้าผิดต้องยกเลิกแล้วออกใบใหม่ เพราะกฎหมายภาษีต้องเก็บหลักฐานตามจริง
--   2) Spec.md ข้อ 0 ตารางสิทธิ์: การยกเลิกเอกสารทำได้เฉพาะ admin
--
-- -------------------------------------------------------------------
-- วิธีปิดช่องโหว่ ใช้ 2 ชั้นประกอบกัน
-- -------------------------------------------------------------------
-- ชั้นที่ 1 (RLS) กำหนดว่า "ใครแตะแถวไหนได้บ้าง"
-- ชั้นที่ 2 (trigger) กำหนดว่า "แตะได้แล้วเปลี่ยนค่าอะไรได้บ้าง"
--
-- ต้องมีสองชั้น เพราะกฎ RLS ตรวจได้แค่ว่าแถวก่อนและหลังแก้มีหน้าตาอย่างไร
-- แต่บอกไม่ได้ว่า "ห้ามแก้คอลัมน์นี้ ให้แก้ได้เฉพาะคอลัมน์นั้น"
-- ถ้ามีแต่ RLS ผู้ดูแลระบบจะยังแอบแก้ยอดเงินไปพร้อมกับการยกเลิกได้ในคำสั่งเดียว
-- =====================================================================


-- =====================================================================
-- ชั้นที่ 1 — กฎ RLS
--
-- แยกเป็น 2 ข้อ เพราะเป็นคนละสถานการณ์กันโดยสิ้นเชิง
-- เมื่อมีหลาย policy สำหรับคำสั่งเดียวกัน ฐานข้อมูลจะถือว่า "ผ่านข้อใดข้อหนึ่งก็พอ"
-- =====================================================================

/* กฎเดิมที่กว้างเกินไป ต้องเอาออกก่อน */
drop policy if exists wht_certificates_update on public.wht_certificates;

/*
  ข้อที่ 1 — แก้ไขใบร่าง
  ทุกคนในองค์กรแก้ใบร่างของตัวเองได้ (ทั้ง admin และผู้ใช้ทั่วไป ตาม Spec ข้อ 0)
  และเปลี่ยนสถานะจากร่างเป็นออกแล้วได้ ซึ่งคือการกดปุ่ม "บันทึกและออกเอกสาร"
  แต่จะข้ามไปเป็นสถานะยกเลิกโดยตรงไม่ได้ เพราะยังไม่เคยออกให้ใคร
*/
drop policy if exists wht_certificates_update_draft on public.wht_certificates;
create policy wht_certificates_update_draft on public.wht_certificates
  for update to authenticated
  using (
    org_id = public.get_my_org_id()
    and status = 'draft'
  )
  with check (
    org_id = public.get_my_org_id()
    and status in ('draft', 'issued')
  );

/*
  ข้อที่ 2 — ยกเลิกเอกสารที่ออกไปแล้ว
  ทำได้เฉพาะ admin และผลลัพธ์ต้องเป็นสถานะยกเลิกเท่านั้น
  จะแก้เป็นสถานะอื่นหรือย้อนกลับไปเป็นใบร่างไม่ได้
*/
drop policy if exists wht_certificates_void on public.wht_certificates;
create policy wht_certificates_void on public.wht_certificates
  for update to authenticated
  using (
    org_id = public.get_my_org_id()
    and status = 'issued'
    and public.get_my_role() = 'admin'
  )
  with check (
    org_id = public.get_my_org_id()
    and status = 'void'
  );


-- =====================================================================
-- ชั้นที่ 2 — trigger คุมว่าเปลี่ยนค่าอะไรได้บ้าง
-- =====================================================================

create or replace function public.protect_issued_certificate()
returns trigger
language plpgsql
as $$
begin
  /* เอกสารที่ยกเลิกไปแล้วถือว่าจบเรื่อง ห้ามแตะอีกไม่ว่ากรณีใด */
  if old.status = 'void' then
    raise exception 'เอกสารที่ยกเลิกแล้วแก้ไขไม่ได้อีก';
  end if;

  if old.status = 'issued' then
    /* ออกไปแล้วทำได้อย่างเดียวคือยกเลิก */
    if new.status is distinct from 'void' then
      raise exception 'เอกสารที่ออกแล้วแก้ไขไม่ได้ ทำได้เพียงยกเลิกเอกสารเท่านั้น';
    end if;

    /* ต้องระบุเหตุผลเสมอ เพราะเป็นหลักฐานที่ต้องอธิบายกับสรรพากรได้ */
    if new.void_reason is null or btrim(new.void_reason) = '' then
      raise exception 'ต้องระบุเหตุผลในการยกเลิกเอกสาร';
    end if;

    /*
      ตรวจว่าไม่มีการแก้ข้อมูลอื่นแฝงมาพร้อมกับการยกเลิก
      เทียบทุกคอลัมน์ที่เป็นสาระสำคัญของเอกสารว่าต้องเหมือนเดิมเป๊ะ
    */
    if (new.org_id, new.doc_no, new.book_no, new.form_type, new.payee_id,
        new.payee_snapshot, new.payer_snapshot, new.issue_date,
        new.total_amount, new.total_tax, new.total_tax_text,
        new.pf_gpf_amount, new.sso_amount, new.provident_amount,
        new.payment_condition, new.payment_condition_other, new.created_by)
       is distinct from
       (old.org_id, old.doc_no, old.book_no, old.form_type, old.payee_id,
        old.payee_snapshot, old.payer_snapshot, old.issue_date,
        old.total_amount, old.total_tax, old.total_tax_text,
        old.pf_gpf_amount, old.sso_amount, old.provident_amount,
        old.payment_condition, old.payment_condition_other, old.created_by)
    then
      raise exception 'เอกสารที่ออกแล้วห้ามแก้ไขข้อมูลใด ๆ ยกเลิกได้อย่างเดียว';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.protect_issued_certificate() is
  'กันไม่ให้เอกสารที่ออกแล้วถูกแก้ตัวเลข อนุญาตเพียงการยกเลิกพร้อมเหตุผล';

drop trigger if exists wht_certificates_protect_issued on public.wht_certificates;
create trigger wht_certificates_protect_issued
  before update on public.wht_certificates
  for each row execute function public.protect_issued_certificate();


-- =====================================================================
-- ชั้นที่ 2 (ต่อ) — ล็อกรายการเงินได้ของเอกสารที่ออกแล้วด้วย
--
-- ถ้าล็อกแต่หัวเอกสาร ยอดในหัวจะยังเดิมก็จริง
-- แต่บรรทัดรายการข้างในยังถูกแก้หรือลบได้ ทำให้ยอดรวมไม่ตรงกับรายละเอียด
-- ซึ่งเป็นสิ่งแรกที่สรรพากรจะเห็นเวลาตรวจ
-- =====================================================================

create or replace function public.protect_issued_certificate_items()
returns trigger
language plpgsql
as $$
declare
  v_status text;
  v_certificate_id uuid;
begin
  v_certificate_id := coalesce(new.certificate_id, old.certificate_id);

  select c.status into v_status
  from public.wht_certificates c
  where c.id = v_certificate_id;

  /*
    หาหัวเอกสารไม่เจอ เกิดได้ตอนลบทั้งใบ ซึ่งรายการจะถูกลบตามอัตโนมัติ
    กรณีนั้นปล่อยผ่าน ไม่ต้องขัด
  */
  if v_status is null then
    return coalesce(new, old);
  end if;

  if v_status <> 'draft' then
    raise exception 'เอกสารนี้ออกไปแล้ว แก้ไขรายการเงินได้ไม่ได้';
  end if;

  return coalesce(new, old);
end;
$$;

comment on function public.protect_issued_certificate_items() is
  'อนุญาตให้เพิ่ม แก้ หรือลบรายการเงินได้ เฉพาะตอนที่เอกสารยังเป็นใบร่าง';

drop trigger if exists wht_certificate_items_protect on public.wht_certificate_items;
create trigger wht_certificate_items_protect
  before insert or update or delete on public.wht_certificate_items
  for each row execute function public.protect_issued_certificate_items();


-- =====================================================================
-- คำสั่งตรวจสอบ (รันแล้วดูผลได้เลย)
-- =====================================================================

-- ตรวจข้อ 1: policy ของ wht_certificates ต้องมี 5 ข้อ
-- ผลที่ถูกต้อง: SELECT, INSERT, DELETE อย่างละ 1 และ UPDATE 2 ข้อ
select
  policyname as "ชื่อกฎ",
  cmd        as "คำสั่ง"
from pg_policies
where schemaname = 'public'
  and tablename = 'wht_certificates'
order by cmd, policyname;

-- ตรวจข้อ 2: ต้องไม่มี policy ชื่อเดิมที่กว้างเกินไปหลงเหลืออยู่
-- ผลที่ถูกต้อง: ต้องไม่มีแถวใดถูกส่งกลับมา (0 rows)
select policyname as "กฎเดิมที่ควรถูกลบไปแล้ว"
from pg_policies
where schemaname = 'public'
  and tablename = 'wht_certificates'
  and policyname = 'wht_certificates_update';

-- ตรวจข้อ 3: trigger ป้องกันถูกติดตั้งครบ 2 ตัวหรือยัง
-- ผลที่ถูกต้อง: ได้ 2 แถว
select
  c.relname as "ตาราง",
  t.tgname  as "ชื่อ trigger"
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and t.tgname in ('wht_certificates_protect_issued', 'wht_certificate_items_protect')
order by c.relname;
