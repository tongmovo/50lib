/*
  ui.js — ตัวช่วยเล็ก ๆ ที่หลายหน้าจอใช้ร่วมกัน

  รวมไว้ที่เดียวเพื่อไม่ให้แต่ละหน้าเขียนซ้ำ และเวลาปรับหน้าตาจะได้เปลี่ยนที่เดียว
*/

/*
  แปลงอักขระพิเศษให้ปลอดภัยก่อนเอาไปวางในหน้าเว็บ
  ข้อมูลจากฐานข้อมูลอาจมีอักขระอย่าง < > ที่ทำให้หน้าเว็บเพี้ยนหรือเกิดช่องโหว่ได้
*/
export function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/* ช่องกรอกข้อความ 1 บรรทัด */
export function textField({
  id,
  label,
  value,
  canEdit,
  required = false,
  hint = "",
  inputMode = "",
  maxLength = 0,
}) {
  return `
    <div class="field">
      <label class="field__label" for="${id}">${label}${
        required ? ' <span class="field__required">*</span>' : ""
      }</label>
      <input
        class="field__input"
        id="${id}"
        type="text"
        value="${escapeHtml(value)}"
        ${inputMode ? `inputmode="${inputMode}"` : ""}
        ${maxLength ? `maxlength="${maxLength}"` : ""}
        ${canEdit ? "" : "readonly"}
      />
      ${hint ? `<p class="field__hint">${hint}</p>` : ""}
    </div>
  `;
}

/* ช่องกรอกข้อความหลายบรรทัด เช่น ที่อยู่ */
export function textAreaField({ id, label, value, canEdit, hint = "" }) {
  return `
    <div class="field">
      <label class="field__label" for="${id}">${label}</label>
      <textarea
        class="field__input field__input--area"
        id="${id}"
        rows="3"
        ${canEdit ? "" : "readonly"}
      >${escapeHtml(value)}</textarea>
      ${hint ? `<p class="field__hint">${hint}</p>` : ""}
    </div>
  `;
}

/* แสดงกล่องแจ้งผลในฟอร์ม kind รับ "error" หรือ "success" */
export function showAlert(box, text, kind) {
  box.textContent = text;
  box.className = `form-alert form-alert--${kind}`;
  box.hidden = false;
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

export function hideAlert(box) {
  box.hidden = true;
  box.textContent = "";
}

/* ระหว่างรอเซิร์ฟเวอร์ ต้องกันกดซ้ำและบอกผู้ใช้ว่ากำลังทำงานอยู่ */
export function setSaving(button, isSaving, normalText) {
  button.disabled = isSaving;
  button.textContent = isSaving ? "กำลังบันทึก..." : normalText;
}

/*
  ข้อความแจ้งผลข้ามหน้า

  ใช้ตอนบันทึกสำเร็จแล้วต้องพาผู้ใช้ไปหน้าอื่น
  ถ้าแสดงข้อความก่อนเปลี่ยนหน้า ผู้ใช้จะไม่ทันเห็นเพราะหน้าถูกวาดใหม่ทันที
  จึงฝากข้อความไว้ตรงนี้ แล้วให้หน้าปลายทางมาหยิบไปแสดงเอง
*/
let pendingFlash = null;

export function setFlash(text, kind = "success") {
  pendingFlash = { text, kind };
}

/* หยิบข้อความไปแสดง แล้วล้างทิ้งทันที เพื่อไม่ให้ค้างไปแสดงซ้ำในหน้าถัดไป */
export function takeFlash() {
  const flash = pendingFlash;
  pendingFlash = null;
  return flash;
}
