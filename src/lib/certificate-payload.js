/*
  certificate-payload.js — รวบรวมข้อมูลจากฟอร์มสร้างเอกสาร แล้วตรวจความครบถ้วนก่อนบันทึก

  แยกออกจากหน้าจอเพราะเป็นตรรกะล้วน ๆ ไม่ยุ่งกับการวาดหน้า
  ทำให้หน้า /new เหลือหน้าที่แค่ประกอบร่างและควบคุมปุ่ม
*/

import { summarizeLines } from "./tax.js";
import { bahtText } from "./bahtText.js";

/*
  คืนค่า { payload } ถ้าข้อมูลครบ หรือ { error } พร้อมข้อความไทยบอกว่าขาดอะไร
*/
export function buildCertificatePayload({ profile, org, metaValues, totalValues, payee, lines }) {
  if (!payee) return { error: "กรุณาเลือกผู้ถูกหักภาษี ณ ที่จ่ายก่อนบันทึก" };
  if (!metaValues.issueDate) return { error: "กรุณาระบุวันที่ออกหนังสือรับรอง" };

  const summary = summarizeLines(lines);

  /* นับเฉพาะบรรทัดที่กรอกจริง บรรทัดว่างที่ค้างอยู่ไม่ต้องบันทึกลงเอกสาร */
  const filledLines = summary.lines.filter(
    (line) => line.incomeTypeCode && Number(line.amount) > 0
  );

  if (filledLines.length === 0) {
    return { error: "กรุณากรอกรายการเงินได้อย่างน้อย 1 บรรทัด (ต้องเลือกประเภทและใส่จำนวนเงิน)" };
  }

  const missingLabel = filledLines.find(
    (line) => line.incomeTypeCode === "other" && !String(line.labelOverride).trim()
  );
  if (missingLabel) {
    return { error: 'มีบรรทัดที่เลือกประเภท "อื่น ๆ" แต่ยังไม่ได้พิมพ์ชื่อประเภทเงินได้' };
  }

  if (totalValues.paymentCondition === "other" && !totalValues.paymentConditionOther) {
    return { error: 'เลือกผู้จ่ายเงินเป็น "อื่น ๆ" แล้ว กรุณาพิมพ์เงื่อนไขให้ครบ' };
  }

  /* คำนวณยอดรวมใหม่จากเฉพาะบรรทัดที่กรอกจริง กันยอดเพี้ยนจากบรรทัดว่าง */
  const finalSummary = summarizeLines(filledLines);

  return {
    payload: {
      orgId: profile.org_id,
      userId: profile.id,
      payeeId: payee.id,
      payeeSnapshot: buildPayeeSnapshot(payee),
      payerSnapshot: buildPayerSnapshot(org),
      bookNo: metaValues.bookNo,
      docNo: metaValues.docNo,
      isDocNoEdited: metaValues.isDocNoEdited,
      formType: metaValues.formType,
      issueDate: metaValues.issueDate,
      totalAmount: finalSummary.totalAmount,
      totalTax: finalSummary.totalTax,
      totalTaxText: bahtText(finalSummary.totalTax),
      ...totalValues,
      lines: finalSummary.lines.map((line) => ({
        incomeTypeCode: line.incomeTypeCode,
        labelOverride: line.labelOverride,
        paidDate: line.paidDate,
        amount: Number(line.amount),
        rate: line.rate === "" || line.rate === null ? null : Number(line.rate),
        taxAmount: line.taxAmount,
      })),
    },
  };
}

/*
  สำเนาข้อมูลผู้ถูกหักภาษี ณ วันที่ออกเอกสาร (Spec.md ข้อ 1.1)
  เก็บไว้เพราะถ้าภายหลังผู้รับเงินย้ายที่อยู่หรือเปลี่ยนชื่อ
  เอกสารเก่าที่ส่งให้เขาไปแล้วต้องยังแสดงข้อมูลเดิม ตรงกับกระดาษที่ถืออยู่
*/
function buildPayeeSnapshot(payee) {
  return {
    id: payee.id,
    entity_type: payee.entity_type,
    tax_id: payee.tax_id,
    title: payee.title,
    name: payee.name,
    branch: payee.branch,
    address: payee.address,
  };
}

/* สำเนาข้อมูลผู้จ่ายเงิน ณ วันที่ออกเอกสาร ด้วยเหตุผลเดียวกัน */
function buildPayerSnapshot(org) {
  return {
    id: org.id,
    name: org.name,
    tax_id: org.tax_id,
    branch: org.branch,
    address: org.address,
    signer_name: org.signer_name,
    signer_position: org.signer_position,
    logo_url: org.logo_url,
    signature_url: org.signature_url,
  };
}
