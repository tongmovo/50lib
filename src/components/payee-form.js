/*
  payee-form.js — ฟอร์มเพิ่ม/แก้ไขรายชื่อผู้ถูกหักภาษี (ใช้ในกล่องหน้าต่างซ้อน)
  ฟอร์มเดียวใช้ได้ทั้ง 2 งาน ถ้าส่ง payee เข้ามาคือแก้ไข ถ้าไม่ส่งคือเพิ่มใหม่
*/

import { createPayee, updatePayee, findPayeeByTaxId } from "../lib/payees.js";
import { validateTaxId, validateRequired } from "../lib/validate.js";
import { textField, textAreaField, showAlert, hideAlert, setSaving, escapeHtml } from "../lib/ui.js";

export function createPayeeForm({ payee, orgId, userId, incomeTypes, onSaved, onOpenDuplicate }) {
  const isEdit = Boolean(payee);
  const data = payee ?? {};
  const saveLabel = isEdit ? "บันทึกการแก้ไข" : "เพิ่มรายชื่อ";

  const form = document.createElement("form");
  form.className = "payee-form";
  form.noValidate = true;
  form.innerHTML = `
    <div class="form-alert" data-role="alert" role="alert" hidden></div>

    <div class="field">
      <label class="field__label" for="payee-entity-type">ประเภทผู้เสียภาษี <span class="field__required">*</span></label>
      <select class="field__input" id="payee-entity-type">
        <option value="juristic" ${data.entity_type !== "individual" ? "selected" : ""}>นิติบุคคล (บริษัท / ห้างหุ้นส่วน)</option>
        <option value="individual" ${data.entity_type === "individual" ? "selected" : ""}>บุคคลธรรมดา</option>
      </select>
    </div>

    ${textField({
      id: "payee-tax-id",
      label: "เลขประจำตัวผู้เสียภาษี (13 หลัก)",
      value: data.tax_id,
      canEdit: true,
      required: true,
      inputMode: "numeric",
      maxLength: 13,
      hint: "กรอกเฉพาะตัวเลข ไม่ต้องใส่ขีดหรือเว้นวรรค",
    })}

    ${textField({
      id: "payee-title",
      label: "คำนำหน้า",
      value: data.title,
      canEdit: true,
      hint: "เช่น นาย นาง นางสาว บริษัท ห้างหุ้นส่วนจำกัด",
    })}

    ${textField({
      id: "payee-name",
      label: "ชื่อ-นามสกุล หรือ ชื่อนิติบุคคล",
      value: data.name,
      canEdit: true,
      required: true,
    })}

    ${textField({
      id: "payee-branch",
      label: "สำนักงานใหญ่ / สาขาที่",
      value: data.branch ?? "00000",
      canEdit: true,
      hint: "สำนักงานใหญ่ให้กรอก 00000",
    })}

    ${textAreaField({
      id: "payee-address",
      label: "ที่อยู่เต็ม",
      value: data.address,
      canEdit: true,
      hint: "ที่อยู่นี้จะถูกพิมพ์ลงในเอกสาร",
    })}

    <div class="payee-form__row">
      ${textField({ id: "payee-phone", label: "เบอร์โทรศัพท์", value: data.phone, canEdit: true })}
      ${textField({ id: "payee-email", label: "อีเมล", value: data.email, canEdit: true })}
    </div>
    <p class="field__hint payee-form__note">เบอร์โทรและอีเมลใช้สำหรับติดต่อเท่านั้น จะไม่ถูกพิมพ์ลงในเอกสาร</p>

    <div class="payee-form__row">
      <div class="field">
        <label class="field__label" for="payee-income-type">ประเภทเงินได้ที่ใช้บ่อย</label>
        <select class="field__input" id="payee-income-type">
          <option value="">ไม่ระบุ</option>
          ${incomeTypes
            .map(
              (type) =>
                `<option value="${escapeHtml(type.code)}" ${
                  data.default_income_type === type.code ? "selected" : ""
                }>${escapeHtml(type.label_th)}</option>`
            )
            .join("")}
        </select>
      </div>

      ${textField({
        id: "payee-default-rate",
        label: "อัตราภาษีที่ใช้บ่อย (%)",
        value: data.default_rate,
        canEdit: true,
        inputMode: "decimal",
      })}
    </div>
    <p class="field__hint payee-form__note">
      สองช่องนี้เป็นเพียงค่าช่วยกรอกให้เร็วขึ้น ตอนออกเอกสารจริงยังแก้ได้ทุกครั้ง
    </p>

    ${textAreaField({ id: "payee-note", label: "หมายเหตุ", value: data.note, canEdit: true })}

    <div class="btn-group btn-group--end payee-form__actions">
      <button class="btn btn--primary" type="submit" data-role="submit">${saveLabel}</button>
    </div>
  `;

  const alertBox = form.querySelector('[data-role="alert"]');
  const submitButton = form.querySelector('[data-role="submit"]');
  const incomeTypeSelect = form.querySelector("#payee-income-type");
  const rateInput = form.querySelector("#payee-default-rate");

  /* เลือกประเภทเงินได้แล้วเติมอัตราแนะนำให้อัตโนมัติ ถ้าผู้ใช้ยังไม่ได้กรอกเอง */
  incomeTypeSelect.addEventListener("change", () => {
    const selected = incomeTypes.find((type) => type.code === incomeTypeSelect.value);
    if (selected?.default_rate != null && !rateInput.value.trim()) {
      rateInput.value = selected.default_rate;
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideAlert(alertBox);

    const values = readValues(form);

    const problem =
      validateTaxId(values.tax_id) ||
      validateRequired(values.name, "ชื่อ-นามสกุล หรือ ชื่อนิติบุคคล") ||
      validateRate(values.default_rate);

    if (problem) {
      showAlert(alertBox, problem, "error");
      return;
    }

    setSaving(submitButton, true, saveLabel);

    /* ตรวจเลขซ้ำก่อน เพื่อให้ผู้ใช้เห็นชื่อรายการเดิมและกดไปเปิดดูได้ทันที */
    const { payee: duplicate } = await findPayeeByTaxId(values.tax_id, {
      excludeId: isEdit ? payee.id : null,
    });

    if (duplicate) {
      setSaving(submitButton, false, saveLabel);
      showDuplicateWarning(alertBox, duplicate, onOpenDuplicate);
      return;
    }

    const result = isEdit
      ? await updatePayee(payee.id, values)
      : await createPayee(orgId, userId, values);

    setSaving(submitButton, false, saveLabel);

    if (result.error) {
      showAlert(alertBox, result.error, "error");
      return;
    }

    /*
      ส่งรายชื่อที่เพิ่งบันทึกกลับไปด้วย
      เพราะหน้าสร้างเอกสารต้องเอาไปเลือกเข้าฟอร์มต่อทันทีโดยไม่ให้ผู้ใช้พิมพ์ค้นซ้ำ
    */
    onSaved(isEdit ? "แก้ไขรายชื่อเรียบร้อยแล้ว" : "เพิ่มรายชื่อเรียบร้อยแล้ว", result.payee);
  });

  return form;
}

function readValues(form) {
  const value = (id) => form.querySelector(`#${id}`).value.trim();

  return {
    entity_type: value("payee-entity-type"),
    tax_id: value("payee-tax-id"),
    title: value("payee-title") || null,
    name: value("payee-name"),
    branch: value("payee-branch") || null,
    address: value("payee-address") || null,
    phone: value("payee-phone") || null,
    email: value("payee-email") || null,
    default_income_type: value("payee-income-type") || null,
    default_rate: value("payee-default-rate") === "" ? null : Number(value("payee-default-rate")),
    note: value("payee-note") || null,
  };
}

function validateRate(rate) {
  if (rate === null) return null;
  if (Number.isNaN(rate)) return "อัตราภาษีต้องเป็นตัวเลข เช่น 3 หรือ 5.5";
  if (rate < 0 || rate > 100) return "อัตราภาษีต้องอยู่ระหว่าง 0 ถึง 100";
  return null;
}

/*
  แจ้งเตือนเลขซ้ำพร้อมปุ่มไปเปิดรายการเดิม
  ดีกว่าปล่อยให้ฐานข้อมูลปฏิเสธแล้วขึ้นข้อความภาษาอังกฤษที่ผู้ใช้อ่านไม่รู้เรื่อง
*/
function showDuplicateWarning(alertBox, duplicate, onOpenDuplicate) {
  alertBox.className = "form-alert form-alert--error";
  alertBox.hidden = false;
  alertBox.innerHTML = `
    <span>มีรายชื่อนี้อยู่แล้ว: <strong>${escapeHtml(duplicate.name)}</strong>${
      duplicate.is_active ? "" : " (ปิดใช้งานอยู่)"
    }</span>
    <button type="button" class="btn btn--small btn--secondary" data-role="open-duplicate">เปิดรายการเดิม</button>
  `;

  alertBox
    .querySelector('[data-role="open-duplicate"]')
    .addEventListener("click", () => onOpenDuplicate(duplicate.id));
}
