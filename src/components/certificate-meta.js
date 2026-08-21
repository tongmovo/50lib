/*
  certificate-meta.js — ส่วนหัวของฟอร์มสร้างเอกสาร 50 ทวิ
  ครอบคลุมข้อ 1, 3, 4 และ 10 ของ Spec.md ข้อ 3.1
*/

import { escapeHtml, textField } from "../lib/ui.js";

/* แบบที่ยื่นรายการ เรียงตามลำดับในสเปก */
export const FORM_TYPES = [
  { value: "pnd1a", label: "ภ.ง.ด.1ก" },
  { value: "pnd1a_special", label: "ภ.ง.ด.1ก พิเศษ" },
  { value: "pnd2", label: "ภ.ง.ด.2" },
  { value: "pnd3", label: "ภ.ง.ด.3" },
  { value: "pnd2a", label: "ภ.ง.ด.2ก" },
  { value: "pnd3a", label: "ภ.ง.ด.3ก" },
  { value: "pnd53", label: "ภ.ง.ด.53" },
];

/*
  initial ใช้ตอนคัดลอกเอกสารเดิมหรือแก้ใบร่าง เพื่อเติมค่าที่เคยกรอกไว้กลับเข้าฟอร์ม
  ไม่มีเลขที่เอกสารอยู่ในชุดนี้โดยตั้งใจ เพราะทั้งสองกรณีต้องได้เลขใหม่เสมอ
*/
export function createCertificateMeta({ org, today, onIssueDateChange, initial = {} }) {
  const initialBookNo = initial.bookNo ?? "";
  const initialFormType = initial.formType ?? "pnd3";
  const initialIssueDate = initial.issueDate ?? today;

  const wrapper = document.createElement("div");

  wrapper.innerHTML = `
    <section class="card">
      <h2 class="card__subtitle">1. ผู้มีหน้าที่หักภาษี ณ ที่จ่าย</h2>
      <p class="card__text card__text--muted">
        ข้อมูลชุดนี้ดึงมาจากหน้าตั้งค่าโดยอัตโนมัติ แก้ไขในฟอร์มนี้ไม่ได้
        <a href="/settings" data-link>แก้ที่หน้าตั้งค่าองค์กร</a>
      </p>
      <dl class="info-list">
        <div class="info-list__row">
          <dt class="info-list__label">ชื่อผู้หักภาษี</dt>
          <dd class="info-list__value">${escapeHtml(org.name)}</dd>
        </div>
        <div class="info-list__row">
          <dt class="info-list__label">เลขประจำตัวผู้เสียภาษี</dt>
          <dd class="info-list__value">${escapeHtml(org.tax_id || "ยังไม่ได้กรอก")}</dd>
        </div>
        <div class="info-list__row">
          <dt class="info-list__label">ที่อยู่</dt>
          <dd class="info-list__value">${escapeHtml(org.address || "ยังไม่ได้กรอกที่อยู่")}</dd>
        </div>
      </dl>
    </section>

    <section class="card">
      <h2 class="card__subtitle">3. ลำดับที่ / เล่มที่ / เลขที่</h2>

      <div class="meta-grid">
        <div class="field">
          <label class="field__label" for="cert-seq">ลำดับที่</label>
          <input class="field__input" id="cert-seq" type="text" readonly />
          <p class="field__hint">ระบบออกให้ตามเลขที่เอกสาร แก้ไม่ได้</p>
        </div>

        ${textField({ id: "cert-book-no", label: "เล่มที่", value: initialBookNo, canEdit: true })}

        <div class="field">
          <label class="field__label" for="cert-doc-no">เลขที่</label>
          <input class="field__input" id="cert-doc-no" type="text" />
          <p class="field__hint" data-role="doc-hint">กำลังดูเลขที่ถัดไป...</p>
        </div>
      </div>

      <div class="notice">
        <strong class="notice__title">เรื่องเลขที่เอกสาร</strong>
        <p class="notice__text">
          เลขที่ด้านบนเป็นเพียงตัวอย่างของเลขถัดไป <strong>ยังไม่ถูกจองไว้</strong>
          ระบบจะออกเลขจริงตอนกดปุ่ม "บันทึกและออกเอกสาร" เท่านั้น
          ถ้ามีคนอื่นออกเอกสารตัดหน้าไปก่อน เลขจริงที่ได้อาจไม่ตรงกับตัวอย่างนี้ ซึ่งเป็นเรื่องปกติ
        </p>
        <p class="notice__text notice__text--muted">
          การกด "บันทึกร่าง" จะไม่กินเลขที่เอกสาร จึงลบใบร่างทิ้งได้โดยเลขไม่ขาดช่วง
        </p>
      </div>
    </section>

    <section class="card">
      <h2 class="card__subtitle">4. แบบที่ยื่นรายการ</h2>
      <div class="field">
        <label class="field__label" for="cert-form-type">
          แบบที่ยื่นรายการ <span class="field__required">*</span>
        </label>
        <select class="field__input" id="cert-form-type">
          ${FORM_TYPES.map(
            (type) =>
              `<option value="${type.value}" ${
                type.value === initialFormType ? "selected" : ""
              }>${type.label}</option>`
          ).join("")}
        </select>
        <p class="field__hint">
          ค่าตั้งต้นคือ ภ.ง.ด.3 ซึ่งใช้กับผู้รับเงินที่เป็นบุคคลธรรมดา
          ถ้าผู้รับเงินเป็นนิติบุคคลให้เลือก ภ.ง.ด.53
        </p>
      </div>
    </section>

    <section class="card">
      <h2 class="card__subtitle">10. วันที่ออกหนังสือรับรอง</h2>
      <div class="field">
        <label class="field__label" for="cert-issue-date">
          วันที่ออกหนังสือรับรอง <span class="field__required">*</span>
        </label>
        <input class="field__input" id="cert-issue-date" type="date" value="${initialIssueDate}" />
        <p class="field__hint">ปีของเลขที่เอกสารจะอิงตามวันที่นี้</p>
      </div>
    </section>
  `;

  const seqInput = wrapper.querySelector("#cert-seq");
  const docNoInput = wrapper.querySelector("#cert-doc-no");
  const docHint = wrapper.querySelector('[data-role="doc-hint"]');
  const issueDateInput = wrapper.querySelector("#cert-issue-date");
  const bookNoInput = wrapper.querySelector("#cert-book-no");
  const formTypeSelect = wrapper.querySelector("#cert-form-type");

  /* ถ้าผู้ใช้แก้เลขที่เอง ต้องไม่ให้ระบบเขียนทับตอนโหลดตัวอย่างเลขใหม่ */
  let userEditedDocNo = false;
  docNoInput.addEventListener("input", () => {
    userEditedDocNo = true;
    docHint.textContent = "คุณแก้เลขที่เอง ระบบจะใช้เลขนี้แทนเลขที่ออกอัตโนมัติ";
    seqInput.value = extractSequence(docNoInput.value);
  });

  issueDateInput.addEventListener("change", () => onIssueDateChange(issueDateInput.value));

  /* หน้าจอหลักเรียกเมธอดนี้เมื่อได้ตัวอย่างเลขถัดไปมาแล้ว */
  function setPreviewDocNo(docNo) {
    if (userEditedDocNo) return;
    docNoInput.value = docNo;
    seqInput.value = extractSequence(docNo);
    docHint.textContent = "ตัวอย่างเลขถัดไป แก้ทับได้ถ้าต้องการ";
  }

  function getValues() {
    return {
      bookNo: bookNoInput.value.trim(),
      docNo: docNoInput.value.trim(),
      formType: formTypeSelect.value,
      issueDate: issueDateInput.value,
      isDocNoEdited: userEditedDocNo,
    };
  }

  return { element: wrapper, setPreviewDocNo, getValues };
}

/* ดึงเฉพาะส่วนลำดับ 4 หลักท้ายของเลขที่เอกสารมาแสดงในช่อง "ลำดับที่" */
function extractSequence(docNo) {
  const match = String(docNo ?? "").match(/(\d+)\s*$/);
  return match ? match[1] : "";
}
