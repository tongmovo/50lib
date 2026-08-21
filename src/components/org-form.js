/*
  org-form.js — ฟอร์มข้อมูลบริษัทผู้มีหน้าที่หักภาษี ณ ที่จ่าย
  ข้อมูลชุดนี้จะถูกพิมพ์ลงหนังสือรับรองทุกใบ จึงต้องตรวจให้ถูกก่อนบันทึก
*/

import { updateOrganization } from "../lib/org.js";
import { validateTaxId, validateRequired } from "../lib/validate.js";
import { textField, textAreaField, showAlert, setSaving } from "../lib/ui.js";

const SAVE_LABEL = "บันทึกข้อมูลบริษัท";

export function createOrgForm(org, canEdit) {
  const card = document.createElement("section");
  card.className = "card";
  card.innerHTML = `
    <h2 class="card__subtitle">ข้อมูลผู้มีหน้าที่หักภาษี ณ ที่จ่าย</h2>

    <form id="org-form" novalidate>
      <div class="form-alert" data-role="alert" role="alert" hidden></div>

      ${textField({
        id: "org-name",
        label: "ชื่อบริษัท / ชื่อผู้มีหน้าที่หักภาษี",
        value: org.name,
        canEdit,
        required: true,
      })}

      ${textField({
        id: "org-tax-id",
        label: "เลขประจำตัวผู้เสียภาษี (13 หลัก)",
        value: org.tax_id,
        canEdit,
        required: true,
        inputMode: "numeric",
        maxLength: 13,
        hint: "กรอกเฉพาะตัวเลข ไม่ต้องใส่ขีดหรือเว้นวรรค",
      })}

      ${textField({
        id: "org-branch",
        label: "สำนักงานใหญ่ / สาขาที่",
        value: org.branch,
        canEdit,
        hint: "สำนักงานใหญ่ให้กรอก 00000 ถ้าเป็นสาขาให้กรอกเลขสาขา 5 หลัก",
      })}

      ${textAreaField({
        id: "org-address",
        label: "ที่อยู่เต็ม",
        value: org.address,
        canEdit,
        hint: "ที่อยู่นี้จะพิมพ์ลงในเอกสาร ควรกรอกให้ครบตามที่จดทะเบียน",
      })}

      ${textField({
        id: "org-signer-name",
        label: "ชื่อผู้ลงนาม",
        value: org.signer_name,
        canEdit,
      })}

      ${textField({
        id: "org-signer-position",
        label: "ตำแหน่งผู้ลงนาม",
        value: org.signer_position,
        canEdit,
      })}

      ${canEdit ? `<button class="btn btn--primary" type="submit" data-role="submit">${SAVE_LABEL}</button>` : ""}
    </form>
  `;

  if (!canEdit) return card;

  const form = card.querySelector("#org-form");
  const alertBox = card.querySelector('[data-role="alert"]');
  const submitButton = card.querySelector('[data-role="submit"]');

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const values = {
      name: card.querySelector("#org-name").value.trim(),
      tax_id: card.querySelector("#org-tax-id").value.trim(),
      branch: card.querySelector("#org-branch").value.trim() || null,
      address: card.querySelector("#org-address").value.trim() || null,
      signer_name: card.querySelector("#org-signer-name").value.trim() || null,
      signer_position: card.querySelector("#org-signer-position").value.trim() || null,
    };

    /* ตรวจฝั่งเว็บก่อน เพื่อชี้จุดที่ผิดได้ทันทีโดยไม่ต้องรอเซิร์ฟเวอร์ */
    const problem = validateRequired(values.name, "ชื่อบริษัท") || validateTaxId(values.tax_id);

    if (problem) {
      showAlert(alertBox, problem, "error");
      return;
    }

    setSaving(submitButton, true, SAVE_LABEL);
    const result = await updateOrganization(org.id, values);
    setSaving(submitButton, false, SAVE_LABEL);

    if (!result.ok) {
      showAlert(alertBox, result.error, "error");
      return;
    }

    showAlert(alertBox, "บันทึกข้อมูลบริษัทเรียบร้อยแล้ว", "success");
  });

  return card;
}
