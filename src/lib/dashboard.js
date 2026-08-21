/*
  dashboard.js — ตัวเลขสรุปสำหรับหน้าแรก

  นับรวมทั้งบริษัท ไม่แยกตามผู้สร้าง (ยืนยันกับเจ้าของงานแล้ว)
  กฎ RLS กรองให้เองว่าเห็นเฉพาะเอกสารขององค์กรตัวเอง จึงไม่ต้องส่งเงื่อนไของค์กรไปเพิ่ม
*/

import { supabase } from "../supabase.js";
import { roundHalfUp } from "./tax.js";

/*
  หาช่วงวันที่ของเดือนปัจจุบัน

  อ่านวันที่จากเวลาเครื่องแบบท้องถิ่น ไม่ใช่เวลามาตรฐานโลก
  เพราะถ้าใช้เวลามาตรฐานโลก ช่วงต้นเดือนกับปลายเดือนอาจคลาดไป 1 วัน
  ทำให้เอกสารของวันที่ 1 หรือวันสุดท้ายของเดือนหลุดออกจากยอดสรุป
*/
export function getCurrentMonthRange(today = new Date()) {
  const year = today.getFullYear();
  const month = today.getMonth();

  const pad = (value) => String(value).padStart(2, "0");
  const lastDay = new Date(year, month + 1, 0).getDate();

  return {
    from: `${year}-${pad(month + 1)}-01`,
    to: `${year}-${pad(month + 1)}-${pad(lastDay)}`,
    /* ปี พ.ศ. และเลขเดือน ใช้แสดงเป็นหัวข้อบนการ์ดสรุป */
    buddhistYear: year + 543,
    monthIndex: month,
  };
}

/*
  ดึงตัวเลขสรุปของเดือนปัจจุบัน

  ดึงเฉพาะ 2 คอลัมน์ที่ต้องใช้บวก เพื่อไม่ให้โหลดข้อมูลหนักเกินจำเป็น
  แล้วบวกที่ฝั่งเว็บ เพราะจำนวนเอกสารต่อเดือนของบริษัทเดียวไม่มาก
*/
export async function getMonthlySummary(range) {
  try {
    const { data, error } = await supabase
      .from("wht_certificates")
      .select("total_amount, total_tax")
      .eq("status", "issued")
      .gte("issue_date", range.from)
      .lte("issue_date", range.to);

    if (error) {
      console.error("[50bis] ดึงยอดสรุปเดือนนี้ไม่สำเร็จ:", error.message);
      return { summary: null, error: "ดึงยอดสรุปของเดือนนี้ไม่สำเร็จ กรุณากดรีเฟรชหน้าจอแล้วลองใหม่" };
    }

    const rows = data ?? [];
    const totalAmount = rows.reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0);
    const totalTax = rows.reduce((sum, row) => sum + Number(row.total_tax ?? 0), 0);

    return {
      summary: {
        issuedCount: rows.length,
        totalAmount: roundHalfUp(totalAmount, 2),
        totalTax: roundHalfUp(totalTax, 2),
      },
      error: null,
    };
  } catch (err) {
    console.error("[50bis] ดึงยอดสรุปเดือนนี้ไม่สำเร็จ:", err.message);
    return { summary: null, error: "เชื่อมต่อฐานข้อมูลไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่" };
  }
}

/*
  นับใบร่างที่ยังค้างอยู่ ไม่จำกัดเดือน
  เพราะใบร่างที่ค้างมาจากเดือนก่อนก็ยังเป็นงานที่ต้องสะสางเหมือนกัน

  ใช้ head + count เพื่อขอแค่จำนวน ไม่ต้องโหลดข้อมูลจริงมาทั้งชุด
*/
export async function countDrafts() {
  try {
    const { count, error } = await supabase
      .from("wht_certificates")
      .select("id", { count: "exact", head: true })
      .eq("status", "draft");

    if (error) {
      console.error("[50bis] นับใบร่างค้างไม่สำเร็จ:", error.message);
      return { count: null, error: "นับใบร่างที่ค้างอยู่ไม่สำเร็จ" };
    }

    return { count: count ?? 0, error: null };
  } catch (err) {
    console.error("[50bis] นับใบร่างค้างไม่สำเร็จ:", err.message);
    return { count: null, error: "นับใบร่างที่ค้างอยู่ไม่สำเร็จ" };
  }
}
