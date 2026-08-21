/*
  certificate-prefill.js — เตรียมข้อมูลเดิมเพื่อเติมกลับเข้าฟอร์มสร้างเอกสาร

  ใช้ 2 กรณี
    คัดลอกเป็นใบใหม่ (copy) — เอาข้อมูลเดิมมาทั้งหมด ยกเว้นเลขที่เอกสาร และตั้งวันที่ออกเป็นวันนี้
    แก้ไขใบร่าง (edit)     — เอาข้อมูลเดิมมาทั้งหมดรวมทั้งวันที่ออก แล้วบันทึกทับแถวเดิม
*/

import { getCertificateWithItems } from "./history.js";
import { getPayeeById } from "./payees.js";
import { calculateLineTax } from "./tax.js";

/*
  โหลดเอกสารต้นทางแล้วแปลงเป็นค่าตั้งต้นของฟอร์ม
  คืนค่า { prefill } หรือ { error } พร้อมข้อความไทย
*/
export async function loadPrefill({ mode, certificateId, today }) {
  const { certificate, items, error } = await getCertificateWithItems(certificateId);
  if (error) return { error };

  /* แก้ไขได้เฉพาะใบร่างเท่านั้น ตาม Spec.md ข้อ 4 */
  if (mode === "edit" && certificate.status !== "draft") {
    return {
      error:
        "เอกสารใบนี้ออกไปแล้ว จึงแก้ไขไม่ได้ตามกฎหมายภาษี " +
        'ถ้าข้อมูลผิดให้ยกเลิกเอกสารแล้วใช้ปุ่ม "คัดลอกเป็นใบใหม่" เพื่อออกใบใหม่แทน',
    };
  }

  return {
    prefill: {
      mode,
      certificateId: certificate.id,
      payee: await resolvePayee(certificate),
      meta: {
        bookNo: certificate.book_no ?? "",
        formType: certificate.form_type,
        /* คัดลอกใบใหม่ต้องใช้วันที่วันนี้ ไม่ใช่วันเดิมของใบต้นทาง */
        issueDate: mode === "copy" ? today : certificate.issue_date,
      },
      totals: {
        pfGpfAmount: certificate.pf_gpf_amount,
        ssoAmount: certificate.sso_amount,
        providentAmount: certificate.provident_amount,
        paymentCondition: certificate.payment_condition,
        paymentConditionOther: certificate.payment_condition_other ?? "",
      },
      lines: items.map(toFormLine),
    },
  };
}

/*
  หารายชื่อผู้ถูกหักภาษีสำหรับเติมกลับเข้าช่องเลือก

  พยายามดึงจากทะเบียนก่อน เพราะเป็นข้อมูลล่าสุด
  ถ้าหาไม่เจอ (เช่น ถูกปิดใช้งานหรือลบไปแล้ว) ให้ใช้สำเนาที่เก็บไว้ในเอกสารแทน
  จะได้ไม่เกิดกรณีคัดลอกเอกสารเก่าแล้วช่องผู้ถูกหักภาษีว่างเปล่าโดยไม่มีคำอธิบาย
*/
async function resolvePayee(certificate) {
  if (certificate.payee_id) {
    const { payee } = await getPayeeById(certificate.payee_id);
    if (payee) return payee;
  }

  const snapshot = certificate.payee_snapshot;
  if (!snapshot) return null;

  return {
    id: snapshot.id ?? certificate.payee_id,
    entity_type: snapshot.entity_type,
    tax_id: snapshot.tax_id,
    title: snapshot.title,
    name: snapshot.name,
    branch: snapshot.branch,
    address: snapshot.address,
    default_income_type: null,
    default_rate: null,
  };
}

/*
  แปลงรายการเงินได้จากฐานข้อมูลให้อยู่ในรูปแบบที่ตารางในฟอร์มใช้

  จุดที่ต้องระวัง: ถ้ายอดภาษีที่บันทึกไว้ไม่ตรงกับที่คำนวณได้จากจำนวนเงินและอัตรา
  แปลว่าผู้ใช้เคยพิมพ์ยอดภาษีเองไว้ ต้องคงเครื่องหมาย "แก้ด้วยมือ" ไว้ด้วย
  ไม่งั้นพอเปิดฟอร์มขึ้นมา ระบบจะคำนวณทับแล้วยอดภาษีเปลี่ยนไปเงียบ ๆ โดยผู้ใช้ไม่รู้ตัว
*/
function toFormLine(item) {
  const amount = item.amount == null ? "" : String(item.amount);
  const rate = item.rate == null ? "" : String(item.rate);
  const taxAmount = Number(item.tax_amount ?? 0);

  return {
    incomeTypeCode: item.income_type_code ?? "",
    labelOverride: item.label_override ?? "",
    paidDate: item.paid_date ?? "",
    amount,
    rate,
    taxAmount,
    isManual: calculateLineTax(amount, rate) !== taxAmount,
  };
}

/*
  อ่านโหมดของหน้า /new จากส่วนท้ายของที่อยู่เว็บ แล้วโหลดข้อมูลตั้งต้นให้เสร็จในที่เดียว

  โหมดที่รองรับ
    /new              สร้างใบใหม่
    /new?copy=<รหัส>  คัดลอกใบเดิมเป็นใบใหม่
    /new?edit=<รหัส>  แก้ไขใบร่างเดิม (บันทึกทับแถวเดิม ไม่สร้างแถวใหม่)
*/
export async function resolvePageMode(today) {
  const params = new URLSearchParams(window.location.search);
  const copyId = params.get("copy");
  const editId = params.get("edit");
  const mode = editId ? "edit" : copyId ? "copy" : "create";

  if (mode === "create") {
    return { mode, prefill: null, error: null };
  }

  const { prefill, error } = await loadPrefill({
    mode,
    certificateId: editId ?? copyId,
    today,
  });

  return { mode, prefill: prefill ?? null, error: error ?? null };
}

/* ข้อความหัวข้อของหน้า /new ตามโหมดที่กำลังใช้งาน */
export const MODE_TITLE = {
  create: "สร้างหนังสือรับรองการหักภาษี ณ ที่จ่าย",
  copy: "คัดลอกเป็นใบใหม่",
  edit: "แก้ไขใบร่าง",
};

export const MODE_SUBTITLE = {
  create: "กรอกข้อมูลตามลำดับด้านล่าง ระบบคำนวณยอดรวมและตัวอักษรให้อัตโนมัติ",
  copy: "ระบบเติมข้อมูลจากใบเดิมให้แล้ว ตรวจสอบและแก้ไขได้ก่อนบันทึก เอกสารนี้จะได้เลขที่ใหม่",
  edit: "แก้ไขใบร่างเดิม เมื่อบันทึกจะทับใบเดิม ไม่สร้างใบใหม่",
};
