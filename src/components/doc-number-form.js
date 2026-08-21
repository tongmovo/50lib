/*
  doc-number-form.js — ตั้งค่ารูปแบบเลขที่เอกสาร

  รูปแบบเต็มคือ {คำนำหน้า}-{ปี พ.ศ. 4 หลัก}-{ลำดับ 4 หลัก} ตาม Spec.md ข้อ 6.2
  ส่วนที่ผู้ใช้ตั้งค่าได้คือคำนำหน้าเท่านั้น ที่เหลือระบบสร้างให้เอง
*/

import { updateOrganization } from "../lib/org.js";
import { validateDocPrefix } from "../lib/validate.js";
import { textField, showAlert, setSaving, escapeHtml } from "../lib/ui.js";

const SAVE_LABEL = "บันทึกรูปแบบเลขที่";
const DEFAULT_PREFIX = "WHT";

export function createDocNumberForm(org, canEdit) {
  /* ปีในเอกสารใช้ พ.ศ. จึงบวก 543 จากปี ค.ศ. ของเครื่อง */
  const currentYear = new Date().getFullYear() + 543;

  const card = document.createElement("section");
  card.className = "card";
  card.innerHTML = `
    <h2 class="card__subtitle">รูปแบบเลขที่เอกสาร</h2>

    <form id="doc-form" novalidate>
      <div class="form-alert" data-role="alert" role="alert" hidden></div>

      ${textField({
        id: "doc-prefix",
        label: "คำนำหน้าเลขที่เอกสาร",
        value: org.doc_prefix,
        canEdit,
        maxLength: 10,
        hint: "ใช้ได้เฉพาะตัวอักษรอังกฤษพิมพ์ใหญ่ ตัวเลข และขีดกลาง",
      })}

      <div class="doc-preview">
        <span class="doc-preview__label">ตัวอย่างเลขที่เอกสารใบแรกของปีนี้</span>
        <span class="doc-preview__value" data-role="preview">
          ${escapeHtml(org.doc_prefix || DEFAULT_PREFIX)}-${currentYear}-0001
        </span>
      </div>

      <p class="field__hint">ตัวเลขลำดับจะรีเซ็ตเป็น 0001 ใหม่ทุกต้นปีอัตโนมัติ</p>

      ${canEdit ? `<button class="btn btn--primary" type="submit" data-role="submit">${SAVE_LABEL}</button>` : ""}
    </form>
  `;

  if (!canEdit) return card;

  const previewValue = card.querySelector('[data-role="preview"]');
  const prefixInput = card.querySelector("#doc-prefix");
  const form = card.querySelector("#doc-form");
  const alertBox = card.querySelector('[data-role="alert"]');
  const submitButton = card.querySelector('[data-role="submit"]');

  /* พิมพ์ไปเห็นตัวอย่างไปทันที ผู้ใช้จะได้มั่นใจก่อนกดบันทึก */
  prefixInput.addEventListener("input", () => {
    prefixInput.value = prefixInput.value.toUpperCase();
    previewValue.textContent = `${prefixInput.value || DEFAULT_PREFIX}-${currentYear}-0001`;
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const prefix = prefixInput.value.trim().toUpperCase();
    const problem = validateDocPrefix(prefix);

    if (problem) {
      showAlert(alertBox, problem, "error");
      return;
    }

    setSaving(submitButton, true, SAVE_LABEL);
    const result = await updateOrganization(org.id, { doc_prefix: prefix });
    setSaving(submitButton, false, SAVE_LABEL);

    if (!result.ok) {
      showAlert(alertBox, result.error, "error");
      return;
    }

    showAlert(alertBox, "บันทึกรูปแบบเลขที่เอกสารเรียบร้อยแล้ว", "success");
  });

  return card;
}
