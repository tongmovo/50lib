/*
  certificates.js — บันทึกเอกสาร 50 ทวิ ลงฐานข้อมูล

  มี 4 ทางเข้าใช้งาน
    saveDraft            สร้างใบร่างใหม่
    issueCertificate     สร้างใบใหม่แล้วออกเลขที่เอกสารทันที
    updateDraft          บันทึกทับใบร่างเดิม
    issueExistingDraft   บันทึกทับใบร่างเดิมแล้วออกเลขที่เอกสาร

  ส่วนการดูเลขที่ถัดไปอยู่ในไฟล์ doc-no.js

  -------------------------------------------------------------------
  ลำดับการบันทึกออกแบบให้ "เลขที่เอกสารไม่ขาดช่วง"
  -------------------------------------------------------------------
  ถ้าออกเลขก่อนแล้วบันทึกไม่สำเร็จ (เช่น เน็ตหลุดกลางคัน)
  เลขนั้นจะถูกใช้ไปแล้วแต่ไม่มีเอกสารอยู่จริง
  เวลาสรรพากรตรวจจะต้องอธิบายว่าเลขที่หายไปคือใบไหน

  ทุกทางเข้าจึงบันทึกเนื้อหาให้ครบก่อน แล้วค่อยขอเลขเป็นขั้นตอนสุดท้ายเสมอ
  ถ้าพังก่อนถึงขั้นนั้น เอกสารจะค้างเป็นใบร่างและยังไม่มีเลขไหนถูกใช้ทิ้ง
*/

import { supabase } from "../supabase.js";

/* ---------- สร้างใบใหม่ ---------- */

export async function saveDraft(payload) {
  const created = await insertCertificate(payload);
  if (created.error) return created;

  const items = await insertItems(created.certificate.id, payload.lines);
  if (items.error) return { certificate: null, error: items.error };

  await writeAuditLog(payload, "create", created.certificate.id, { status: "draft" });

  return { certificate: created.certificate, error: null };
}

export async function issueCertificate(payload) {
  const created = await insertCertificate(payload);
  if (created.error) return created;

  const items = await insertItems(created.certificate.id, payload.lines);
  if (items.error) return { certificate: null, error: items.error };

  return assignDocNoAndIssue(created.certificate.id, payload);
}

/* ---------- แก้ใบร่างเดิม ---------- */

export async function updateDraft(certificateId, payload) {
  const updated = await updateDraftContent(certificateId, payload);
  if (updated.error) return updated;

  await writeAuditLog(payload, "update", certificateId, { status: "draft" });
  return updated;
}

export async function issueExistingDraft(certificateId, payload) {
  const updated = await updateDraftContent(certificateId, payload);
  if (updated.error) return updated;

  return assignDocNoAndIssue(certificateId, payload);
}

/* ---------- ขั้นตอนสุดท้าย: ออกเลขที่เอกสาร ---------- */

async function assignDocNoAndIssue(certificateId, payload) {
  /*
    ถ้าผู้ใช้พิมพ์เลขที่เองในช่อง ให้ใช้เลขนั้นตามที่สเปกอนุญาตให้แก้ทับได้
    และไม่ไปกินเลขจากตัวนับ เพื่อไม่ให้ลำดับอัตโนมัติเลื่อนโดยไม่จำเป็น
  */
  let docNo;

  if (payload.isDocNoEdited && payload.docNo) {
    docNo = payload.docNo;
  } else {
    try {
      const { data, error } = await supabase.rpc("issue_doc_no", {
        p_org_id: payload.orgId,
        p_issue_date: payload.issueDate,
      });

      if (error) throw new Error(error.message);
      docNo = data;
    } catch (err) {
      console.error("[50bis] ออกเลขที่เอกสารไม่สำเร็จ:", err.message);
      return {
        certificate: null,
        error:
          "ออกเลขที่เอกสารไม่สำเร็จ ระบบได้บันทึกเอกสารนี้ไว้เป็นใบร่างให้แล้ว กรุณาลองกดออกเอกสารอีกครั้ง",
      };
    }
  }

  try {
    const { data, error } = await supabase
      .from("wht_certificates")
      .update({ doc_no: docNo, status: "issued" })
      .eq("id", certificateId)
      .select("id, doc_no, status")
      .maybeSingle();

    if (error) {
      /* เลขที่ซ้ำเกิดได้เมื่อผู้ใช้พิมพ์เลขเอง แล้วบังเอิญตรงกับใบที่ออกไปแล้ว */
      if (error.message.includes("wht_certificates_org_doc_no_unique")) {
        return {
          certificate: null,
          error:
            `เลขที่เอกสาร ${docNo} ถูกใช้ไปแล้ว กรุณาเปลี่ยนเลขที่แล้วกดออกเอกสารอีกครั้ง ` +
            "(ระบบเก็บใบนี้ไว้เป็นร่างให้แล้ว)",
        };
      }
      throw new Error(error.message);
    }
    if (!data) throw new Error("ไม่มีสิทธิ์แก้ไขเอกสารนี้");

    await writeAuditLog(payload, "create", certificateId, { status: "issued", doc_no: docNo });

    return { certificate: data, error: null };
  } catch (err) {
    console.error("[50bis] บันทึกเลขที่เอกสารไม่สำเร็จ:", err.message);
    return {
      certificate: null,
      error: `บันทึกเลขที่เอกสารไม่สำเร็จ เลขที่ ${docNo} ถูกออกไปแล้วแต่ยังบันทึกไม่ครบ กรุณาแจ้งผู้ดูแลระบบ`,
    };
  }
}

/* ---------- คำสั่งระดับล่าง ---------- */

/* ข้อมูลที่ใช้ร่วมกันทั้งตอนสร้างใหม่และตอนแก้ไข */
function buildRow(payload) {
  return {
    book_no: payload.bookNo || null,
    form_type: payload.formType,
    payee_id: payload.payeeId,
    /* เก็บสำเนาข้อมูล ณ วันที่ออก เผื่อภายหลังมีการแก้ชื่อหรือที่อยู่ */
    payee_snapshot: payload.payeeSnapshot,
    payer_snapshot: payload.payerSnapshot,
    issue_date: payload.issueDate,
    total_amount: payload.totalAmount,
    total_tax: payload.totalTax,
    total_tax_text: payload.totalTaxText,
    pf_gpf_amount: payload.pfGpfAmount,
    sso_amount: payload.ssoAmount,
    provident_amount: payload.providentAmount,
    payment_condition: payload.paymentCondition,
    payment_condition_other: payload.paymentConditionOther || null,
  };
}

async function insertCertificate(payload) {
  try {
    const { data, error } = await supabase
      .from("wht_certificates")
      .insert({
        ...buildRow(payload),
        org_id: payload.orgId,
        doc_no: null,
        note: payload.note || null,
        status: "draft",
        created_by: payload.userId,
      })
      .select("id, doc_no, status")
      .maybeSingle();

    if (error) {
      console.error("[50bis] บันทึกเอกสารไม่สำเร็จ:", error.message);
      return { certificate: null, error: "บันทึกเอกสารไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" };
    }
    if (!data) {
      return { certificate: null, error: "บันทึกเอกสารไม่สำเร็จ เพราะไม่มีสิทธิ์บันทึกข้อมูลนี้" };
    }

    return { certificate: data, error: null };
  } catch (err) {
    console.error("[50bis] บันทึกเอกสารไม่สำเร็จ:", err.message);
    return { certificate: null, error: "เชื่อมต่อฐานข้อมูลไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต" };
  }
}

/*
  บันทึกทับเนื้อหาใบร่างเดิม

  รายการเงินได้ใช้วิธี "ลบของเดิมทิ้งแล้วใส่ชุดใหม่" แทนการไล่แก้ทีละบรรทัด
  เพราะผู้ใช้อาจเพิ่ม ลบ หรือสลับลำดับบรรทัดไปแล้ว การเทียบทีละบรรทัดจะซับซ้อนและพลาดง่าย
  ทำได้เพราะเป็นใบร่างเท่านั้น เอกสารที่ออกไปแล้วถูกฐานข้อมูลล็อกไว้ (migration 010)
*/
async function updateDraftContent(certificateId, payload) {
  try {
    const { data, error } = await supabase
      .from("wht_certificates")
      .update(buildRow(payload))
      .eq("id", certificateId)
      .eq("status", "draft")   /* กันไว้อีกชั้น ต่อให้มีบั๊กก็แก้ใบที่ออกแล้วไม่ได้ */
      .select("id, doc_no, status")
      .maybeSingle();

    if (error) {
      console.error("[50bis] แก้ไขใบร่างไม่สำเร็จ:", error.message);
      return { certificate: null, error: "บันทึกการแก้ไขไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" };
    }
    if (!data) {
      return {
        certificate: null,
        error: "แก้ไขไม่ได้ เอกสารนี้อาจถูกออกเลขที่ไปแล้ว หรือถูกลบไปแล้ว",
      };
    }

    const cleared = await supabase
      .from("wht_certificate_items")
      .delete()
      .eq("certificate_id", certificateId);

    if (cleared.error) {
      console.error("[50bis] ล้างรายการเงินได้เดิมไม่สำเร็จ:", cleared.error.message);
      return { certificate: null, error: "บันทึกการแก้ไขไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" };
    }

    const items = await insertItems(certificateId, payload.lines);
    if (items.error) return { certificate: null, error: items.error };

    return { certificate: data, error: null };
  } catch (err) {
    console.error("[50bis] แก้ไขใบร่างไม่สำเร็จ:", err.message);
    return { certificate: null, error: "เชื่อมต่อฐานข้อมูลไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต" };
  }
}

/* บันทึกรายการเงินได้ทุกบรรทัดในคำสั่งเดียว */
async function insertItems(certificateId, lines) {
  const rows = lines.map((line, index) => ({
    certificate_id: certificateId,
    income_type_code: line.incomeTypeCode || null,
    label_override: line.labelOverride || null,
    paid_date: line.paidDate || null,
    amount: line.amount,
    rate: line.rate,
    tax_amount: line.taxAmount,
    sort_order: index,
  }));

  try {
    const { error } = await supabase.from("wht_certificate_items").insert(rows);

    if (error) {
      console.error("[50bis] บันทึกรายการเงินได้ไม่สำเร็จ:", error.message);
      return { error: "บันทึกรายการเงินได้ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" };
    }
    return { error: null };
  } catch (err) {
    console.error("[50bis] บันทึกรายการเงินได้ไม่สำเร็จ:", err.message);
    return { error: "เชื่อมต่อฐานข้อมูลไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต" };
  }
}

/*
  บันทึกประวัติการใช้งาน

  ถ้าบันทึกประวัติไม่สำเร็จ จะไม่ทำให้การบันทึกเอกสารล้มเหลวตามไปด้วย
  เพราะเอกสารบันทึกสำเร็จไปแล้ว การย้อนกลับจะยุ่งกว่าเดิม
  แต่ต้องบันทึกไว้ใน console เพื่อให้ตามหาสาเหตุได้ภายหลัง
*/
async function writeAuditLog(payload, action, entityId, extra) {
  try {
    const { error } = await supabase.from("audit_logs").insert({
      org_id: payload.orgId,
      user_id: payload.userId ?? null,
      action,
      entity: "wht_certificates",
      entity_id: entityId,
      payload: extra,
    });

    if (error) console.error("[50bis] บันทึกประวัติการใช้งานไม่สำเร็จ:", error.message);
  } catch (err) {
    console.error("[50bis] บันทึกประวัติการใช้งานไม่สำเร็จ:", err.message);
  }
}
