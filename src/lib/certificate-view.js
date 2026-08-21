/*
  certificate-view.js — เตรียมข้อมูลทั้งหมดที่หน้าพิมพ์เอกสารต้องใช้

  แยกออกจากหน้าจอ เพื่อให้หน้า /doc/:id มีหน้าที่แค่วาดกระดาษ
*/

import { supabase } from "../supabase.js";
import { getCertificateWithItems } from "./history.js";
import { listIncomeTypes } from "./payees.js";
import { getAssetSignedUrl } from "./org.js";

/*
  โหลดเอกสาร 1 ใบพร้อมทุกอย่างที่ต้องใช้พิมพ์

  รูปลายเซ็นและตราประทับใช้ที่อยู่ไฟล์จาก payer_snapshot เป็นหลัก
  เพราะเป็นสำเนา ณ วันที่ออกเอกสาร ถ้าบริษัทเปลี่ยนโลโก้ทีหลัง
  เอกสารเก่าที่พิมพ์ซ้ำต้องยังได้โลโก้เดิมตรงกับกระดาษที่ส่งให้ผู้รับเงินไปแล้ว
*/
export async function loadCertificateForPrint(certificateId) {
  const { certificate, items, error } = await getCertificateWithItems(certificateId);
  if (error) return { error };

  const incomeTypes = await listIncomeTypes();

  /* แผนที่จากรหัสประเภทเงินได้ ไปเป็นหมายเลขข้อในแบบฟอร์ม (1-6) */
  const sectionByCode = new Map(incomeTypes.map((type) => [type.code, type.section_no]));
  const labelByCode = new Map(incomeTypes.map((type) => [type.code, type.label_th]));

  const payer = certificate.payer_snapshot ?? {};

  const [signatureUrl, logoUrl] = await Promise.all([
    resolveAsset(payer.signature_url),
    resolveAsset(payer.logo_url),
  ]);

  return {
    certificate,
    items: items.map((item) => ({
      ...item,
      sectionNo: sectionByCode.get(item.income_type_code) ?? 6,
      label: item.label_override || labelByCode.get(item.income_type_code) || "",
    })),
    signatureUrl,
    logoUrl,
    error: null,
  };
}

/* ที่เก็บไฟล์เป็นแบบไม่เปิดสาธารณะ จึงต้องขอลิงก์ชั่วคราวก่อนแสดงรูปทุกครั้ง */
async function resolveAsset(path) {
  if (!path) return null;
  const { url } = await getAssetSignedUrl(path);
  return url ?? null;
}

/*
  บันทึกประวัติการพิมพ์

  ใช้ตัวกันเวลาสั้น ๆ เพราะเบราว์เซอร์อาจส่งสัญญาณพิมพ์มามากกว่า 1 ครั้ง
  ต่อการกดพิมพ์จริง 1 ครั้ง ถ้าไม่กันไว้ ประวัติจะรกด้วยรายการซ้ำ
*/
let lastPrintLoggedAt = 0;
const PRINT_LOG_GAP_MS = 3000;

export async function logPrint(certificate, { orgId, userId, copies }) {
  const now = Date.now();
  if (now - lastPrintLoggedAt < PRINT_LOG_GAP_MS) return;
  lastPrintLoggedAt = now;

  try {
    const { error } = await supabase.from("audit_logs").insert({
      org_id: orgId,
      user_id: userId,
      action: "print",
      entity: "wht_certificates",
      entity_id: certificate.id,
      payload: { doc_no: certificate.doc_no, copies },
    });

    if (error) console.error("[50bis] บันทึกประวัติการพิมพ์ไม่สำเร็จ:", error.message);
  } catch (err) {
    console.error("[50bis] บันทึกประวัติการพิมพ์ไม่สำเร็จ:", err.message);
  }
}
