/*
  doc-no.js — เรื่องเลขที่เอกสารโดยเฉพาะ

  แยกออกจาก certificates.js เพราะเป็นคนละเรื่องกัน
  ไฟล์นี้ดูแลการ "ดูเลขถัดไป" ส่วนการออกเลขจริงทำในฐานข้อมูล (migration 009)
*/

import { supabase } from "../supabase.js";

/* แปลงวันที่เป็นปี พ.ศ. โดยอ่านตัวเลขจากข้อความตรง ๆ กันเรื่องโซนเวลาเพี้ยน */
export function getBuddhistYear(dateText) {
  const match = String(dateText ?? "").match(/^(\d{4})-/);
  const year = match ? Number(match[1]) : new Date().getFullYear();
  return year + 543;
}

/*
  ขอดูเลขที่เอกสารถัดไป "เพื่อแสดงเป็นตัวอย่าง" เท่านั้น
  ยังไม่กินเลขจริง เลขจริงจะถูกออกตอนกดบันทึกและออกเอกสาร (Spec.md ข้อ 6.1)

  ดังนั้นเลขที่เห็นบนหน้าจออาจไม่ตรงกับเลขจริงที่ได้
  ถ้ามีคนอื่นออกเอกสารตัดหน้าไปก่อน ซึ่งเป็นเรื่องปกติและไม่ใช่ข้อผิดพลาด
*/
export async function previewNextDocNo(org, issueDate) {
  const period = String(getBuddhistYear(issueDate));
  const prefix = org?.doc_prefix || "WHT";

  try {
    const { data, error } = await supabase
      .from("doc_counters")
      .select("last_seq")
      .eq("org_id", org.id)
      .eq("period", period)
      .maybeSingle();

    if (error) {
      console.error("[50bis] ดูเลขที่เอกสารถัดไปไม่สำเร็จ:", error.message);
      return `${prefix}-${period}-????`;
    }

    const nextSeq = (data?.last_seq ?? 0) + 1;
    return `${prefix}-${period}-${String(nextSeq).padStart(4, "0")}`;
  } catch (err) {
    console.error("[50bis] ดูเลขที่เอกสารถัดไปไม่สำเร็จ:", err.message);
    return `${prefix}-${period}-????`;
  }
}
