/*
  certificate-footer.js — ส่วนล่างของกระดาษเอกสาร 50 ทวิ

  ครอบคลุม 3 อย่างที่แบบฟอร์มต้นฉบับกำหนดไว้
    คำเตือนทางกฎหมาย / ข้อความรับรองและช่องลงชื่อ / ตราประทับเมื่อเอกสารถูกยกเลิก
*/

import { escapeHtml } from "../lib/ui.js";
import { formatThaiDate } from "../lib/format.js";
import { WARNING_TEXT, CERTIFY_TEXT } from "../lib/form-sections.js";

export function buildFooter(certificate, signatureUrl, logoUrl) {
  /* แยกวัน เดือน ปี ออกจากกัน เพราะแบบฟอร์มมีช่องคั่นด้วยเครื่องหมาย / */
  const issueDate = String(certificate.issue_date ?? "");
  const [year, month, day] = issueDate.split("-");
  const buddhistYear = year ? String(Number(year) + 543) : "";

  return `
    <section class="sheet__footer">
      <div class="sheet__warning">
        <strong class="sheet__warning-title">คำเตือน</strong>
        <p class="sheet__warning-text">${escapeHtml(WARNING_TEXT)}</p>
      </div>

      <div class="sheet__sign">
        <p class="sheet__certify">${escapeHtml(CERTIFY_TEXT)}</p>

        <div class="sheet__sign-area">
          <div class="sheet__sign-main">
            <div class="sheet__sign-image">
              ${signatureUrl ? `<img src="${signatureUrl}" alt="ลายเซ็นผู้จ่ายเงิน" />` : ""}
            </div>
            <div class="sheet__sign-line">
              ลงชื่อ <span class="sheet__dots"></span> ผู้จ่ายเงิน
            </div>

            <div class="sheet__sign-date">
              <span class="sheet__fill sheet__fill--sm">${escapeHtml(day ?? "")}</span> /
              <span class="sheet__fill sheet__fill--sm">${escapeHtml(month ?? "")}</span> /
              <span class="sheet__fill sheet__fill--sm">${escapeHtml(buddhistYear)}</span>
            </div>
            <p class="sheet__sign-hint">(วัน เดือน ปี ที่ออกหนังสือรับรองฯ)</p>
          </div>

          <div class="sheet__stamp-box">
            ${logoUrl ? `<img src="${logoUrl}" alt="ตราประทับนิติบุคคล" />` : ""}
            <span class="sheet__stamp-text">ประทับตรานิติบุคคล (ถ้ามี)</span>
          </div>
        </div>
      </div>
    </section>
  `;
}

/*
  ตราประทับยกเลิก วางเฉียงคาดกลางหน้ากระดาษ
  ความทึบต่ำโดยตั้งใจ เพื่อให้ยังอ่านตัวเลขที่อยู่ข้างใต้ได้
*/
export function buildVoidStamp(certificate) {
  return `
    <div class="sheet__void" aria-hidden="true">ยกเลิก</div>
    <div class="sheet__void-note">
      <strong>เอกสารนี้ถูกยกเลิกแล้ว</strong>
      ${certificate.void_reason ? `<span>เหตุผล: ${escapeHtml(certificate.void_reason)}</span>` : ""}
      ${
        certificate.updated_at
          ? `<span>วันที่ยกเลิก: ${escapeHtml(formatThaiDate(certificate.updated_at))}</span>`
          : ""
      }
    </div>
  `;
}
