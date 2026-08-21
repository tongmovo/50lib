/*
  payees.js — อ่านและเขียนข้อมูลทะเบียนผู้ถูกหักภาษี

  กฎ RLS กรองให้เองว่าเห็นเฉพาะรายชื่อขององค์กรตัวเอง
  จึงไม่ต้องส่งเงื่อนไของค์กรไปในทุก query
*/

import { supabase } from "../supabase.js";

/* จำนวนรายการต่อหน้า ตาม Spec.md ข้อ 2 */
export const PAGE_SIZE = 20;

/*
  ตัดอักขระที่มีความหมายพิเศษในเงื่อนไขค้นหาของ Supabase ออก
  ถ้าไม่ตัด ผู้ใช้พิมพ์เครื่องหมายจุลภาคหรือวงเล็บ จะทำให้คำสั่งค้นหาเพี้ยนและค้นไม่เจอ
*/
function sanitizeSearch(text) {
  return String(text ?? "").replace(/[,()%*\\]/g, "").trim();
}

/*
  ดึงรายชื่อแบบแบ่งหน้า พร้อมจำนวนทั้งหมดเพื่อคำนวณจำนวนหน้า
  ค้นหาได้ทั้งชื่อและเลขประจำตัวผู้เสียภาษีด้วยช่องเดียว
*/
export async function listPayees({ search = "", page = 1, includeInactive = false } = {}) {
  const keyword = sanitizeSearch(search);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  try {
    let query = supabase
      .from("payees")
      .select(
        "id, entity_type, tax_id, title, name, branch, address, phone, email, default_income_type, default_rate, note, is_active",
        { count: "exact" }
      );

    if (!includeInactive) {
      query = query.eq("is_active", true);
    }

    if (keyword) {
      /* ค้นทั้งช่องชื่อและช่องเลขภาษีพร้อมกัน แบบเจอคำนี้อยู่ตรงไหนก็ได้ */
      query = query.or(`name.ilike.%${keyword}%,tax_id.ilike.%${keyword}%`);
    }

    const { data, count, error } = await query
      .order("name", { ascending: true })
      .range(from, to);

    if (error) {
      console.error("[50bis] ดึงรายชื่อผู้ถูกหักภาษีไม่สำเร็จ:", error.message);
      return { payees: [], total: 0, error: "ดึงรายชื่อไม่สำเร็จ กรุณากดรีเฟรชหน้าจอแล้วลองใหม่" };
    }

    return { payees: data ?? [], total: count ?? 0, error: null };
  } catch (err) {
    console.error("[50bis] ดึงรายชื่อผู้ถูกหักภาษีไม่สำเร็จ:", err.message);
    return { payees: [], total: 0, error: "เชื่อมต่อฐานข้อมูลไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่" };
  }
}

/*
  ดึงสถิติการใช้งานของรายชื่อชุดที่กำลังแสดงอยู่
  คืนเป็น Map เพื่อให้หน้าจอหยิบไปใช้ตามรหัสได้ทันที

  ถ้าดึงไม่สำเร็จจะคืน Map ว่าง ไม่โยน error ออกไป
  เพราะสถิติเป็นข้อมูลประกอบ ไม่ควรทำให้ทั้งหน้าเปิดไม่ได้
*/
export async function getUsageStats(payeeIds) {
  if (!payeeIds || payeeIds.length === 0) return new Map();

  try {
    const { data, error } = await supabase
      .from("payee_usage_stats")
      .select("payee_id, certificate_count, last_used_date")
      .in("payee_id", payeeIds);

    if (error) {
      console.error("[50bis] ดึงสถิติการใช้งานไม่สำเร็จ:", error.message);
      return new Map();
    }

    return new Map((data ?? []).map((row) => [row.payee_id, row]));
  } catch (err) {
    console.error("[50bis] ดึงสถิติการใช้งานไม่สำเร็จ:", err.message);
    return new Map();
  }
}

/*
  หารายชื่อที่ใช้เลขประจำตัวผู้เสียภาษีเดียวกัน
  ใช้เตือนผู้ใช้ก่อนบันทึก แทนที่จะปล่อยให้ฐานข้อมูลปฏิเสธแล้วขึ้น error ภาษาอังกฤษ

  excludeId ใช้ตอนแก้ไข เพื่อไม่ให้รายการนับตัวเองว่าซ้ำ
  ค้นทั้งรายชื่อที่เปิดและปิดใช้งาน เพราะเลขซ้ำกับรายที่ปิดอยู่ก็ยังบันทึกไม่ได้
*/
export async function findPayeeByTaxId(taxId, { excludeId = null } = {}) {
  try {
    let query = supabase
      .from("payees")
      .select("id, name, is_active")
      .eq("tax_id", taxId);

    if (excludeId) {
      query = query.neq("id", excludeId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      console.error("[50bis] ตรวจเลขผู้เสียภาษีซ้ำไม่สำเร็จ:", error.message);
      return { payee: null, error: null };   /* ตรวจไม่ได้ก็ปล่อยผ่าน ให้ฐานข้อมูลกันเป็นชั้นสุดท้าย */
    }

    return { payee: data, error: null };
  } catch (err) {
    console.error("[50bis] ตรวจเลขผู้เสียภาษีซ้ำไม่สำเร็จ:", err.message);
    return { payee: null, error: null };
  }
}

/* เพิ่มรายชื่อใหม่ */
export async function createPayee(orgId, userId, fields) {
  return runWrite(() =>
    supabase
      .from("payees")
      .insert({ ...fields, org_id: orgId, created_by: userId })
      .select("id, name")
      .maybeSingle()
  );
}

/* แก้ไขรายชื่อเดิม */
export async function updatePayee(payeeId, fields) {
  return runWrite(() =>
    supabase.from("payees").update(fields).eq("id", payeeId).select("id, name").maybeSingle()
  );
}

/*
  ปิดหรือเปิดการใช้งานรายชื่อ

  ห้ามลบข้อมูลจริงเด็ดขาด เพราะเอกสารภาษีที่ออกไปแล้วอ้างอิงรายชื่อนี้อยู่
  และกฎหมายภาษีกำหนดให้ต้องเก็บหลักฐานไว้
*/
export async function setPayeeActive(payeeId, isActive) {
  return runWrite(() =>
    supabase
      .from("payees")
      .update({ is_active: isActive })
      .eq("id", payeeId)
      .select("id, name")
      .maybeSingle()
  );
}

/* ดึงประเภทเงินได้ทั้งหมด ไว้ทำตัวเลือกในฟอร์ม */
export async function listIncomeTypes() {
  try {
    const { data, error } = await supabase
      .from("income_types")
      .select("code, label_th, default_rate")
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("[50bis] ดึงประเภทเงินได้ไม่สำเร็จ:", error.message);
      return [];
    }
    return data ?? [];
  } catch (err) {
    console.error("[50bis] ดึงประเภทเงินได้ไม่สำเร็จ:", err.message);
    return [];
  }
}

/*
  ตัวกลางสำหรับคำสั่งเขียนข้อมูลทุกแบบ
  รวมการแปลง error เป็นข้อความไทยไว้ที่เดียว จะได้ไม่ต้องเขียนซ้ำทุกฟังก์ชัน
*/
async function runWrite(action) {
  try {
    const { data, error } = await action();

    if (error) {
      console.error("[50bis] บันทึกรายชื่อไม่สำเร็จ:", error.message);

      if (error.message.includes("payees_org_tax_id_unique")) {
        return { payee: null, error: "เลขประจำตัวผู้เสียภาษีนี้มีอยู่ในทะเบียนแล้ว กรุณาตรวจสอบอีกครั้ง" };
      }
      if (error.message.includes("payees_tax_id_format_check")) {
        return { payee: null, error: "เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลักพอดี" };
      }
      if (error.message.includes("payees_default_rate_check")) {
        return { payee: null, error: "อัตราภาษีต้องอยู่ระหว่าง 0 ถึง 100" };
      }
      return { payee: null, error: "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" };
    }

    if (!data) {
      return { payee: null, error: "บันทึกไม่สำเร็จ เพราะไม่มีสิทธิ์แก้ไขข้อมูลนี้" };
    }

    return { payee: data, error: null };
  } catch (err) {
    console.error("[50bis] บันทึกรายชื่อไม่สำเร็จ:", err.message);
    return { payee: null, error: "เชื่อมต่อฐานข้อมูลไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่" };
  }
}

/* ดึงรายชื่อรายเดียวตามรหัส ใช้ตอนกดปุ่ม "เปิดรายการเดิม" จากคำเตือนเลขซ้ำ */
export async function getPayeeById(payeeId) {
  try {
    const { data, error } = await supabase
      .from("payees")
      .select(
        "id, entity_type, tax_id, title, name, branch, address, phone, email, default_income_type, default_rate, note, is_active"
      )
      .eq("id", payeeId)
      .maybeSingle();

    if (error) {
      console.error("[50bis] เปิดรายชื่อไม่สำเร็จ:", error.message);
      return { payee: null, error: "เปิดรายชื่อไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" };
    }
    return { payee: data, error: null };
  } catch (err) {
    console.error("[50bis] เปิดรายชื่อไม่สำเร็จ:", err.message);
    return { payee: null, error: "เชื่อมต่อฐานข้อมูลไม่ได้ กรุณาลองใหม่อีกครั้ง" };
  }
}
