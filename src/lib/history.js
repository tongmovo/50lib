/*
  history.js — อ่านและจัดการเอกสารในหน้าประวัติ

  กฎ RLS กรองให้เองว่าเห็นเฉพาะเอกสารขององค์กรตัวเอง
  จึงไม่ต้องส่งเงื่อนไของค์กรไปในทุก query
*/

import { supabase } from "../supabase.js";
import { roundHalfUp } from "./tax.js";

export const PAGE_SIZE = 20;

/* ตัดอักขระที่มีความหมายพิเศษในเงื่อนไขค้นหาของ Supabase ออก */
function sanitizeSearch(text) {
  return String(text ?? "").replace(/[,()%*\\]/g, "").trim();
}

/*
  ประกอบเงื่อนไขการกรองทั้งหมดเข้ากับ query

  ใช้ร่วมกันทั้งตอนดึงรายการมาแสดง ตอนคำนวณแถบสรุป และตอนส่งออก CSV
  เขียนไว้ที่เดียวเพื่อให้ทั้งสามอย่างใช้เงื่อนไขชุดเดียวกันเสมอ
  ไม่งั้นจะเกิดกรณีตัวเลขในแถบสรุปไม่ตรงกับรายการที่เห็นในตาราง
*/
function applyFilters(query, filters) {
  const { dateFrom, dateTo, payeeId, formType, status, search } = filters;

  if (dateFrom) query = query.gte("issue_date", dateFrom);
  if (dateTo) query = query.lte("issue_date", dateTo);
  if (payeeId) query = query.eq("payee_id", payeeId);
  if (formType) query = query.eq("form_type", formType);
  if (status) query = query.eq("status", status);

  const keyword = sanitizeSearch(search);
  if (keyword) {
    /*
      ค้นได้ทั้งเลขที่เอกสาร ชื่อผู้ถูกหัก และเลขผู้เสียภาษี ด้วยช่องเดียว
      ชื่อกับเลขภาษีอยู่ใน payee_snapshot ซึ่งเป็นข้อมูลชนิด jsonb
      จึงต้องแปลงเป็นข้อความก่อนค้น (ใช้ ->> เพื่อดึงค่าออกมาเป็นข้อความ)
    */
    query = query.or(
      `doc_no.ilike.%${keyword}%,` +
        `payee_snapshot->>name.ilike.%${keyword}%,` +
        `payee_snapshot->>tax_id.ilike.%${keyword}%`
    );
  }

  return query;
}

const LIST_COLUMNS =
  "id, doc_no, book_no, form_type, issue_date, status, void_reason, " +
  "total_amount, total_tax, payee_id, payee_snapshot";

/* ดึงรายการเอกสารของหน้าปัจจุบัน */
export async function listCertificates(filters, page = 1) {
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  try {
    let query = supabase.from("wht_certificates").select(LIST_COLUMNS, { count: "exact" });
    query = applyFilters(query, filters);

    const { data, count, error } = await query
      .order("issue_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      console.error("[50bis] ดึงประวัติเอกสารไม่สำเร็จ:", error.message);
      return { certificates: [], total: 0, error: "ดึงประวัติเอกสารไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" };
    }

    return { certificates: data ?? [], total: count ?? 0, error: null };
  } catch (err) {
    console.error("[50bis] ดึงประวัติเอกสารไม่สำเร็จ:", err.message);
    return { certificates: [], total: 0, error: "เชื่อมต่อฐานข้อมูลไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต" };
  }
}

/*
  คำนวณแถบสรุปจาก "ทุกใบที่ผ่านตัวกรอง" ไม่ใช่แค่หน้าที่กำลังดูอยู่

  ดึงเฉพาะ 2 คอลัมน์ที่ต้องใช้บวก เพื่อไม่ให้โหลดข้อมูลหนักเกินจำเป็น
*/
export async function summarizeCertificates(filters) {
  try {
    let query = supabase.from("wht_certificates").select("total_amount, total_tax");
    query = applyFilters(query, filters);

    const { data, error } = await query;

    if (error) {
      console.error("[50bis] คำนวณยอดสรุปไม่สำเร็จ:", error.message);
      return { count: 0, totalAmount: 0, totalTax: 0, error: "คำนวณยอดสรุปไม่สำเร็จ" };
    }

    const rows = data ?? [];
    const totalAmount = rows.reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0);
    const totalTax = rows.reduce((sum, row) => sum + Number(row.total_tax ?? 0), 0);

    return {
      count: rows.length,
      totalAmount: roundHalfUp(totalAmount, 2),
      totalTax: roundHalfUp(totalTax, 2),
      error: null,
    };
  } catch (err) {
    console.error("[50bis] คำนวณยอดสรุปไม่สำเร็จ:", err.message);
    return { count: 0, totalAmount: 0, totalTax: 0, error: "คำนวณยอดสรุปไม่สำเร็จ" };
  }
}

/* ดึงทุกใบที่ผ่านตัวกรอง สำหรับส่งออกไฟล์ CSV */
export async function listAllForExport(filters) {
  try {
    let query = supabase.from("wht_certificates").select(LIST_COLUMNS);
    query = applyFilters(query, filters);

    const { data, error } = await query
      .order("issue_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[50bis] เตรียมข้อมูลส่งออกไม่สำเร็จ:", error.message);
      return { certificates: [], error: "เตรียมข้อมูลส่งออกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" };
    }

    return { certificates: data ?? [], error: null };
  } catch (err) {
    console.error("[50bis] เตรียมข้อมูลส่งออกไม่สำเร็จ:", err.message);
    return { certificates: [], error: "เชื่อมต่อฐานข้อมูลไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต" };
  }
}

/* ดึงเอกสาร 1 ใบพร้อมรายการเงินได้ ใช้ตอนคัดลอกเป็นใบใหม่และตอนแก้ไขใบร่าง */
export async function getCertificateWithItems(certificateId) {
  try {
    const [certResult, itemsResult] = await Promise.all([
      supabase.from("wht_certificates").select("*").eq("id", certificateId).maybeSingle(),
      supabase
        .from("wht_certificate_items")
        .select("*")
        .eq("certificate_id", certificateId)
        .order("sort_order", { ascending: true }),
    ]);

    if (certResult.error || itemsResult.error) {
      console.error(
        "[50bis] เปิดเอกสารไม่สำเร็จ:",
        certResult.error?.message ?? itemsResult.error?.message
      );
      return { certificate: null, items: [], error: "เปิดเอกสารไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" };
    }

    if (!certResult.data) {
      return { certificate: null, items: [], error: "ไม่พบเอกสารที่ต้องการ อาจถูกลบไปแล้ว" };
    }

    return { certificate: certResult.data, items: itemsResult.data ?? [], error: null };
  } catch (err) {
    console.error("[50bis] เปิดเอกสารไม่สำเร็จ:", err.message);
    return { certificate: null, items: [], error: "เชื่อมต่อฐานข้อมูลไม่ได้ กรุณาลองใหม่อีกครั้ง" };
  }
}

/*
  ยกเลิกเอกสาร

  ไม่ลบข้อมูลจริงเด็ดขาด เพียงเปลี่ยนสถานะและบันทึกเหตุผลไว้
  เพราะกฎหมายภาษีกำหนดให้เก็บหลักฐานเอกสารที่เคยออกไปแล้วทุกใบ
*/
export async function voidCertificate(certificate, reason, { orgId, userId }) {
  const trimmedReason = String(reason ?? "").trim();

  if (!trimmedReason) {
    return { ok: false, error: "กรุณาระบุเหตุผลในการยกเลิกเอกสาร" };
  }

  try {
    const { data, error } = await supabase
      .from("wht_certificates")
      .update({ status: "void", void_reason: trimmedReason })
      .eq("id", certificate.id)
      .select("id, doc_no, status")
      .maybeSingle();

    if (error) {
      console.error("[50bis] ยกเลิกเอกสารไม่สำเร็จ:", error.message);

      if (error.message.includes("เหตุผล")) {
        return { ok: false, error: "กรุณาระบุเหตุผลในการยกเลิกเอกสาร" };
      }
      return { ok: false, error: "ยกเลิกเอกสารไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" };
    }

    if (!data) {
      /* กฎความปลอดภัยของฐานข้อมูลปฏิเสธแบบเงียบ ๆ แปลว่าบัญชีนี้ไม่มีสิทธิ์ */
      return {
        ok: false,
        error: "ยกเลิกเอกสารไม่สำเร็จ เพราะบัญชีของคุณไม่มีสิทธิ์ (ต้องเป็นผู้ดูแลระบบ)",
      };
    }

    await writeVoidLog(orgId, userId, certificate, trimmedReason);
    return { ok: true, error: null };
  } catch (err) {
    console.error("[50bis] ยกเลิกเอกสารไม่สำเร็จ:", err.message);
    return { ok: false, error: "เชื่อมต่อฐานข้อมูลไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่" };
  }
}

/* บันทึกประวัติการยกเลิก ถ้าบันทึกไม่ได้ก็ไม่ย้อนการยกเลิกที่สำเร็จไปแล้ว */
async function writeVoidLog(orgId, userId, certificate, reason) {
  try {
    const { error } = await supabase.from("audit_logs").insert({
      org_id: orgId,
      user_id: userId,
      action: "void",
      entity: "wht_certificates",
      entity_id: certificate.id,
      payload: { doc_no: certificate.doc_no, void_reason: reason },
    });

    if (error) console.error("[50bis] บันทึกประวัติการยกเลิกไม่สำเร็จ:", error.message);
  } catch (err) {
    console.error("[50bis] บันทึกประวัติการยกเลิกไม่สำเร็จ:", err.message);
  }
}
