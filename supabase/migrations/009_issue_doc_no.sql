-- =====================================================================
-- 009_issue_doc_no.sql
-- ฟังก์ชันออกเลขที่เอกสารแบบกันเลขชนกัน
-- ต้องรันหลัง 008
--
-- -------------------------------------------------------------------
-- ปัญหาที่ไฟล์นี้แก้
-- -------------------------------------------------------------------
-- ถ้าให้หน้าเว็บอ่านเลขล่าสุดมาบวกหนึ่งเอง จะเกิดปัญหาเมื่อมีคนกดพร้อมกัน
-- เช่น พนักงาน 2 คนกด "บันทึกและออกเอกสาร" ห่างกันเสี้ยววินาที
-- ทั้งคู่จะอ่านได้เลขล่าสุดเป็นตัวเดียวกัน แล้วได้เลขที่เอกสารซ้ำกัน
-- ซึ่งกับเอกสารภาษีถือเป็นความผิดพลาดร้ายแรง แก้ย้อนหลังยากมาก
--
-- ไฟล์นี้จึงย้ายการออกเลขไปทำในฐานข้อมูล ด้วยคำสั่งเดียวที่ทำงานแบบแยกกันไม่ได้
-- (insert ... on conflict do update ... returning) ฐานข้อมูลจะล็อกแถวให้เอง
-- ใครมาก่อนได้ก่อน คนที่มาทีหลังจะได้เลขถัดไปเสมอ ไม่มีทางซ้ำกันได้
--
-- -------------------------------------------------------------------
-- รูปแบบเลขที่เอกสาร (Spec.md ข้อ 6.2)
--   {คำนำหน้า}-{ปี พ.ศ. 4 หลัก}-{ลำดับ 4 หลัก}   เช่น WHT-2569-0001
--   ตัวนับเริ่มที่ 0001 ใหม่ทุกปี
-- =====================================================================

create or replace function public.issue_doc_no(
  p_org_id uuid,
  p_issue_date date default current_date
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_period text;
  v_prefix text;
  v_seq    int;
begin
  /*
    ฟังก์ชันนี้ทำงานด้วยสิทธิ์เจ้าของ (SECURITY DEFINER) จึงข้ามกฎ RLS ได้
    ต้องตรวจสิทธิ์เองตรงนี้ ไม่งั้นผู้ใช้จะสั่งออกเลขขององค์กรอื่นได้
  */
  if p_org_id is null or p_org_id is distinct from public.get_my_org_id() then
    raise exception 'ไม่มีสิทธิ์ออกเลขที่เอกสารขององค์กรนี้';
  end if;

  /*
    ใช้ปีจากวันที่ออกหนังสือรับรอง ไม่ใช่วันที่ในเครื่องผู้ใช้
    เพื่อให้เอกสารที่ลงวันที่ 31 ธ.ค. ได้เลขของปีนั้น ไม่ข้ามไปปีถัดไป
    บวก 543 เพื่อแปลงเป็นปี พ.ศ. ตามที่ใช้ในเอกสารราชการไทย
  */
  v_period := (extract(year from coalesce(p_issue_date, current_date))::int + 543)::text;

  select coalesce(o.doc_prefix, 'WHT')
    into v_prefix
  from public.organizations o
  where o.id = p_org_id;

  if v_prefix is null then
    raise exception 'ไม่พบข้อมูลบริษัท กรุณาตั้งค่าข้อมูลบริษัทก่อนออกเอกสาร';
  end if;

  /*
    หัวใจของการกันเลขชน: ทำทุกอย่างในคำสั่งเดียว
    - ถ้ายังไม่มีตัวนับของปีนี้ ให้สร้างใหม่เริ่มที่ 1
    - ถ้ามีอยู่แล้ว ให้บวกเพิ่มทีละ 1
    ฐานข้อมูลรับประกันว่าคำสั่งนี้จะไม่ถูกแทรกกลางคัน
  */
  insert into public.doc_counters (org_id, period, last_seq, updated_at)
  values (p_org_id, v_period, 1, now())
  on conflict (org_id, period)
  do update set last_seq = doc_counters.last_seq + 1,
                updated_at = now()
  returning last_seq into v_seq;

  return v_prefix || '-' || v_period || '-' || lpad(v_seq::text, 4, '0');
end;
$$;

comment on function public.issue_doc_no(uuid, date) is
  'ออกเลขที่เอกสาร 50 ทวิ ถัดไปแบบกันเลขชนกัน เรียกเฉพาะตอนกดบันทึกและออกเอกสาร';

-- ให้เฉพาะผู้ที่ล็อกอินแล้วเรียกใช้ได้ ผู้ที่ยังไม่ล็อกอินเรียกไม่ได้
revoke all on function public.issue_doc_no(uuid, date) from public, anon;
grant execute on function public.issue_doc_no(uuid, date) to authenticated;


-- =====================================================================
-- คำสั่งตรวจสอบ (รันแล้วดูผลได้เลย)
-- =====================================================================

-- ตรวจข้อ 1: ฟังก์ชันถูกสร้างแบบ SECURITY DEFINER แล้วหรือยัง
-- ผลที่ถูกต้อง: ได้ 1 แถว ช่อง "ผลตรวจ" ขึ้น OK
select
  p.proname                                      as "ชื่อฟังก์ชัน",
  p.prosecdef                                    as "เป็น SECURITY DEFINER",
  case when p.prosecdef then 'OK' else 'ผิด' end as "ผลตรวจ"
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'issue_doc_no';

-- ตรวจข้อ 2: ผู้ที่ยังไม่ล็อกอิน (anon) ต้องเรียกฟังก์ชันนี้ไม่ได้
-- ผลที่ถูกต้อง: ต้องไม่มีแถวใดถูกส่งกลับมา (0 rows)
select grantee as "บทบาทที่เรียกได้"
from information_schema.role_routine_grants
where routine_schema = 'public'
  and routine_name = 'issue_doc_no'
  and grantee = 'anon';

-- ตรวจข้อ 3: ดูตัวนับปัจจุบัน (ยังไม่เคยออกเอกสารจะได้ 0 แถว ซึ่งถูกต้อง)
select
  period   as "ปี พ.ศ.",
  last_seq as "ออกไปแล้วถึงลำดับที่"
from public.doc_counters
order by period desc;
