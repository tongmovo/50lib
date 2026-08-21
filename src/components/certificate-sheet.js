/*
  certificate-sheet.js — วาดกระดาษเอกสาร 50 ทวิ 1 แผ่น

  เรียก 2 ครั้งต่อ 1 เอกสาร คือฉบับที่ 1 และฉบับที่ 2
  ต่างกันแค่ข้อความหัวมุมซ้ายบน เนื้อหาที่เหลือเหมือนกันทุกประการ

  จัดวางตามแบบฟอร์มต้นฉบับของกรมสรรพากร
  ตัวเลขทั้งหมดใช้เลขอารบิก (ยืนยันกับเจ้าของงานแล้วว่าไม่ใช่ข้อบังคับทางกฎหมาย)
*/

import { escapeHtml } from "../lib/ui.js";
import { buildFooter, buildVoidStamp } from "./certificate-footer.js";
import { formatMoney, formatThaiDate } from "../lib/format.js";
import { bahtText } from "../lib/bahtText.js";
import {
  FORM_SECTIONS,
  FORM_TYPE_CHOICES,
  PAYMENT_CHOICES,
  HINT_NAME,
  HINT_ADDRESS,
  FOOTNOTE_TEXT,
  COPY_LABELS,
} from "../lib/form-sections.js";

export function createCertificateSheet({ certificate, items, signatureUrl, logoUrl, copyNo }) {
  const payer = certificate.payer_snapshot ?? {};
  const payee = certificate.payee_snapshot ?? {};

  const sheet = document.createElement("article");
  sheet.className = `sheet sheet--copy${copyNo}`;
  sheet.innerHTML = `
    ${buildHeader(certificate, copyNo)}
    ${buildParty("ผู้มีหน้าที่หักภาษี ณ ที่จ่าย", payer)}
    ${buildParty("ผู้ถูกหักภาษี ณ ที่จ่าย", payee)}
    ${buildFormTypeRow(certificate)}
    ${buildItemsTable(certificate, items)}
    ${buildBahtTextRow(certificate)}
    ${buildFundsRow(certificate)}
    ${buildPaymentRow(certificate)}
    ${buildFooter(certificate, signatureUrl, logoUrl)}
    <p class="sheet__footnote">${escapeHtml(FOOTNOTE_TEXT)}</p>
    ${certificate.status === "void" ? buildVoidStamp(certificate) : ""}
  `;

  return sheet;
}

/* ---------- ส่วนหัว ---------- */

function buildHeader(certificate, copyNo) {
  /* บรรทัดของฉบับที่กำลังพิมพ์จะเข้ม อีกบรรทัดจางลง เพื่อให้ดูออกทันทีว่าถืออยู่ฉบับไหน */
  const copyLines = [1, 2]
    .map(
      (no) =>
        `<div class="sheet__copy-line ${no === copyNo ? "is-active" : ""}">${escapeHtml(
          COPY_LABELS[no]
        )}</div>`
    )
    .join("");

  return `
    <header class="sheet__head">
      <div class="sheet__copy-labels">${copyLines}</div>

      <div class="sheet__titles">
        <h1 class="sheet__title">หนังสือรับรองการหักภาษี ณ ที่จ่าย</h1>
        <p class="sheet__subtitle">ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร</p>
      </div>

      <div class="sheet__docno">
        <div>เล่มที่ <span class="sheet__fill">${escapeHtml(certificate.book_no || "")}</span></div>
        <div>เลขที่ <span class="sheet__fill">${escapeHtml(certificate.doc_no || "")}</span></div>
      </div>
    </header>
  `;
}

/* ---------- กรอบผู้จ่าย / ผู้ถูกหัก ---------- */

function buildParty(label, party) {
  return `
    <section class="party">
      <div class="party__row">
        <span class="party__label">${escapeHtml(label)} :-</span>
        <span class="party__taxid-label">เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)*</span>
        ${buildTaxIdBoxes(party.tax_id)}
      </div>

      <div class="party__field">
        <span class="party__field-label">ชื่อ</span>
        <span class="party__value">${escapeHtml(party.name || "")}</span>
      </div>
      <p class="party__hint">${escapeHtml(HINT_NAME)}</p>

      <div class="party__field">
        <span class="party__field-label">ที่อยู่</span>
        <span class="party__value party__value--address">${escapeHtml(party.address || "")}</span>
      </div>
      <p class="party__hint">${escapeHtml(HINT_ADDRESS)}</p>
    </section>
  `;
}

/* ช่องสี่เหลี่ยมเล็ก 13 ช่อง ใส่เลขทีละหลักตามแบบฟอร์มจริง */
function buildTaxIdBoxes(taxId) {
  const digits = String(taxId ?? "").replace(/\D/g, "").padEnd(13, " ").slice(0, 13);

  const boxes = [...digits]
    .map((digit) => `<span class="taxid__box">${digit.trim()}</span>`)
    .join("");

  return `<span class="taxid">${boxes}</span>`;
}

/* ---------- ลำดับที่ + แบบที่ยื่นรายการ ---------- */

function buildFormTypeRow(certificate) {
  /* ลำดับที่คือเลข 4 หลักท้ายของเลขที่เอกสาร ตามที่ตกลงไว้ตั้งแต่ Phase 6 */
  const sequence = String(certificate.doc_no ?? "").match(/(\d+)\s*$/)?.[1] ?? "";

  const choices = FORM_TYPE_CHOICES.map(
    (choice) => `
      <span class="choice">
        <span class="choice__box">${choice.value === certificate.form_type ? "✓" : ""}</span>
        <span class="choice__label">${escapeHtml(choice.label)}</span>
      </span>
    `
  ).join("");

  return `
    <section class="formtype">
      <span class="formtype__seq">ลำดับที่ <span class="sheet__fill">${escapeHtml(sequence)}</span></span>
      <span class="formtype__in">ในแบบ</span>
      <span class="formtype__choices">${choices}</span>
    </section>
  `;
}

/* ---------- ตารางรายการเงินได้ ---------- */

function buildItemsTable(certificate, items) {
  const rows = FORM_SECTIONS.map((section) => buildSectionRows(section, items)).join("");

  return `
    <table class="items">
      <thead>
        <tr>
          <th class="items__col-type">ประเภทเงินได้พึงประเมินที่จ่าย</th>
          <th class="items__col-date">วัน เดือน<br />หรือปีภาษี ที่จ่าย</th>
          <th class="items__col-amount">จำนวนเงินที่จ่าย</th>
          <th class="items__col-tax">ภาษีที่หักและนำส่ง</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        <tr class="items__total">
          <td class="items__total-label">รวมเงินที่จ่ายและภาษีที่หักนำส่ง</td>
          <td></td>
          <td class="items__money">${formatMoney(certificate.total_amount)}</td>
          <td class="items__money">${formatMoney(certificate.total_tax)}</td>
        </tr>
      </tbody>
    </table>
  `;
}

/*
  สร้างแถวของข้อหลัก 1 ข้อ

  ถ้าข้อนั้นมีรายการจริงหลายบรรทัด ตารางจะขยายแถวเพิ่มตามจำนวนจริง
  โดยบรรทัดแรกอยู่บนแถวหัวข้อ ส่วนที่เหลือเป็นแถวย่อยเยื้องเข้าไป
*/
function buildSectionRows(section, items) {
  const matched = items.filter((item) => item.sectionNo === section.no);
  const [first, ...rest] = matched;

  const subLines = section.subs
    .map((sub) => `<div class="items__sub items__sub--l${sub.level}">${escapeHtml(sub.text)}</div>`)
    .join("");

  const headRow = `
    <tr>
      <td class="items__type">
        <div class="items__main">${escapeHtml(section.text)}</div>
        ${subLines}
      </td>
      <td class="items__date">${first ? escapeHtml(formatThaiDate(first.paid_date)) : ""}</td>
      <td class="items__money">${first ? formatMoney(first.amount) : ""}</td>
      <td class="items__money">${first ? formatMoney(first.tax_amount) : ""}</td>
    </tr>
  `;

  const extraRows = rest
    .map(
      (item) => `
      <tr>
        <td class="items__type items__type--extra">${escapeHtml(item.label)}</td>
        <td class="items__date">${escapeHtml(formatThaiDate(item.paid_date))}</td>
        <td class="items__money">${formatMoney(item.amount)}</td>
        <td class="items__money">${formatMoney(item.tax_amount)}</td>
      </tr>
    `
    )
    .join("");

  return headRow + extraRows;
}

/* ---------- แถวใต้ตาราง ---------- */

function buildBahtTextRow(certificate) {
  /* ใช้ค่าที่บันทึกไว้ตอนออกเอกสารก่อน เพื่อให้ตรงกับกระดาษที่เคยพิมพ์ไปแล้ว */
  const text = certificate.total_tax_text || bahtText(certificate.total_tax);

  return `
    <div class="sheet__line">
      รวมเงินภาษีที่หักนำส่ง (ตัวอักษร)
      <span class="sheet__fill sheet__fill--wide">${escapeHtml(text)}</span>
    </div>
  `;
}

function buildFundsRow(certificate) {
  /* ช่องไหนไม่มียอด ให้เว้นว่างไว้ ไม่ใส่ 0.00 ตามที่กำหนดในเค้าโครง */
  const show = (value) => (Number(value) > 0 ? formatMoney(value) : "");

  return `
    <div class="sheet__line sheet__line--funds">
      <span>เงินที่จ่ายเข้า กบข./กสจ./กองทุนสงเคราะห์ครูโรงเรียนเอกชน
        <span class="sheet__fill">${show(certificate.pf_gpf_amount)}</span> บาท</span>
      <span>กองทุนประกันสังคม <span class="sheet__fill">${show(certificate.sso_amount)}</span> บาท</span>
      <span>กองทุนสำรองเลี้ยงชีพ <span class="sheet__fill">${show(certificate.provident_amount)}</span> บาท</span>
    </div>
  `;
}

function buildPaymentRow(certificate) {
  const choices = PAYMENT_CHOICES.map((choice) => {
    const checked = choice.value === certificate.payment_condition;
    const extra =
      choice.value === "other"
        ? ` <span class="sheet__fill">${escapeHtml(certificate.payment_condition_other || "")}</span>`
        : "";

    return `
      <span class="choice">
        <span class="choice__box">${checked ? "✓" : ""}</span>
        <span class="choice__label">${escapeHtml(choice.label)}${extra}</span>
      </span>
    `;
  }).join("");

  return `
    <div class="sheet__line sheet__line--payment">
      <span class="sheet__line-label">ผู้จ่ายเงิน</span>
      ${choices}
    </div>
  `;
}
