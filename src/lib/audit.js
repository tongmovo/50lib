/*
  audit.js — อ่านประวัติการใช้งานสำหรับหน้าผู้ดูแลระบบ

  กฎ RLS หลังไฟล์ migration 011 อนุญาตให้อ่านตารางนี้ได้เฉพาะผู้ดูแลระบบเท่านั้น
  ต่อให้ผู้ใช้ทั่วไปเรียกคำสั่งตรง ๆ ก็จะได้ผลลัพธ์ว่างเปล่า
*/

import { supabase } from "../supabase.js";

export const PAGE_SIZE = 30;

/* คำแปลของการกระทำแต่ละแบบ ให้ผู้ใช้อ่านเข้าใจโดยไม่ต้องรู้ศัพท์ระบบ */
export const ACTION_LABELS = {
  create: "สร้างเอกสาร",
  update: "แก้ไขร่าง",
  void: "ยกเลิกเอกสาร",
  print: "พิมพ์เอกสาร",
};

/*
  ดึงประวัติการใช้งานตามตัวกรอง พร้อมเติมชื่อผู้ทำรายการและเลขที่เอกสารให้ครบ

  ทำไมต้องดึง 3 รอบ:
  ตาราง audit_logs เก็บไว้แค่รหัสผู้ใช้และรหัสเอกสาร ไม่ได้เก็บชื่อกับเลขที่
  และรหัสผู้ใช้ชี้ไปที่ระบบล็อกอินของ Supabase ซึ่งเชื่อมตรงกับตาราง profiles ไม่ได้
  จึงต้องดึงรายชื่อผู้ใช้และเลขที่เอกสารมาจับคู่เองที่ฝั่งเว็บ
  ทั้งสองอย่างเป็นข้อมูลชุดเล็ก และดึงเฉพาะเท่าที่หน้านั้นใช้จริง
*/
export async function listAuditLogs(filters, page = 1) {
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  try {
    let query = supabase
      .from("audit_logs")
      .select("id, user_id, action, entity, entity_id, payload, created_at", { count: "exact" });

    if (filters.dateFrom) query = query.gte("created_at", `${filters.dateFrom}T00:00:00`);
    if (filters.dateTo) query = query.lte("created_at", `${filters.dateTo}T23:59:59`);
    if (filters.action) query = query.eq("action", filters.action);
    if (filters.userId) query = query.eq("user_id", filters.userId);

    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      console.error("[50bis] ดึงประวัติการใช้งานไม่สำเร็จ:", error.message);
      return { logs: [], total: 0, error: "ดึงประวัติการใช้งานไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" };
    }

    const rows = data ?? [];
    const [nameById, docNoById] = await Promise.all([
      loadUserNames(),
      loadDocNumbers(rows),
    ]);

    const logs = rows.map((row) => ({
      ...row,
      userName: nameById.get(row.user_id) ?? "(ผู้ใช้ที่ถูกลบไปแล้ว)",
      /* เลขที่เอกสารบางรายการถูกเก็บไว้ในบันทึกอยู่แล้ว ถ้าไม่มีจึงค่อยไปดูจากตารางเอกสาร */
      docNo: row.payload?.doc_no ?? docNoById.get(row.entity_id) ?? null,
    }));

    return { logs, total: count ?? 0, error: null };
  } catch (err) {
    console.error("[50bis] ดึงประวัติการใช้งานไม่สำเร็จ:", err.message);
    return { logs: [], total: 0, error: "เชื่อมต่อฐานข้อมูลไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต" };
  }
}

/* รายชื่อผู้ใช้ในองค์กร ใช้ทั้งแปลงรหัสเป็นชื่อ และทำตัวเลือกในตัวกรอง */
export async function listOrgUserOptions() {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name")
      .order("full_name", { ascending: true });

    if (error) {
      console.error("[50bis] ดึงรายชื่อผู้ใช้ไม่สำเร็จ:", error.message);
      return [];
    }
    return data ?? [];
  } catch (err) {
    console.error("[50bis] ดึงรายชื่อผู้ใช้ไม่สำเร็จ:", err.message);
    return [];
  }
}

async function loadUserNames() {
  const users = await listOrgUserOptions();
  return new Map(users.map((user) => [user.id, user.full_name || "(ยังไม่ได้ตั้งชื่อ)"]));
}

/* ดึงเลขที่เอกสารเฉพาะรายการที่แสดงอยู่ในหน้านี้ ไม่ดึงทั้งตาราง */
async function loadDocNumbers(rows) {
  const ids = [...new Set(rows.map((row) => row.entity_id).filter(Boolean))];
  if (ids.length === 0) return new Map();

  try {
    const { data, error } = await supabase
      .from("wht_certificates")
      .select("id, doc_no")
      .in("id", ids);

    if (error) {
      console.error("[50bis] ดึงเลขที่เอกสารไม่สำเร็จ:", error.message);
      return new Map();
    }

    return new Map((data ?? []).map((row) => [row.id, row.doc_no]));
  } catch (err) {
    console.error("[50bis] ดึงเลขที่เอกสารไม่สำเร็จ:", err.message);
    return new Map();
  }
}
