/*
  void-form.js — ฟอร์มยืนยันการยกเลิกเอกสาร (แสดงในกล่องหน้าต่างซ้อน)

  บังคับกรอกเหตุผลก่อนยืนยันเสมอ เพราะเหตุผลการยกเลิกเป็นหลักฐาน
  ที่ต้องอธิบายกับสรรพากรได้เวลาถูกตรวจ ตาม Spec.md ข้อ 4
*/

import { escapeHtml, showAlert, hideAlert } from "../lib/ui.js";
import { formatMoney, formatThaiDate } from "../lib/format.js";

export function createVoidForm({ certificate, onConfirm }) {
  const payeeName = certificate.payee_snapshot?.name ?? "(ไม่พบชื่อผู้ถูกหัก)";

  const form = document.createElement("form");
  form.noValidate = true;
  form.innerHTML = `
    <div class="form-alert" data-role="alert" role="alert" hidden></div>

    <div class="void-form__summary">
      <p class="void-form__warning">
        การยกเลิกจะไม่ลบเอกสารออกจากระบบ เอกสารจะยังอยู่ครบพร้อมประทับคำว่า "ยกเลิก" เวลาพิมพ์
        และ<strong>ย้อนกลับไม่ได้</strong> ถ้าต้องการเอกสารที่ถูกต้อง ให้ออกใบใหม่หลังยกเลิก
      </p>
      <dl class="info-list">
        <div class="info-list__row">
          <dt class="info-list__label">เลขที่เอกสาร</dt>
          <dd class="info-list__value">${escapeHtml(certificate.doc_no ?? "")}</dd>
        </div>
        <div class="info-list__row">
          <dt class="info-list__label">วันที่ออก</dt>
          <dd class="info-list__value">${escapeHtml(formatThaiDate(certificate.issue_date))}</dd>
        </div>
        <div class="info-list__row">
          <dt class="info-list__label">ผู้ถูกหักภาษี</dt>
          <dd class="info-list__value">${escapeHtml(payeeName)}</dd>
        </div>
        <div class="info-list__row">
          <dt class="info-list__label">ยอดภาษีที่หัก</dt>
          <dd class="info-list__value">${formatMoney(certificate.total_tax)} บาท</dd>
        </div>
      </dl>
    </div>

    <div class="field">
      <label class="field__label" for="void-reason">
        เหตุผลในการยกเลิก <span class="field__required">*</span>
      </label>
      <textarea class="field__input field__input--area" id="void-reason" rows="3"
        placeholder="เช่น กรอกจำนวนเงินผิด หรือออกให้ผิดคน"></textarea>
      <p class="field__hint">เหตุผลนี้จะถูกเก็บไว้เป็นหลักฐานถาวร และแสดงในหน้าประวัติเอกสาร</p>
    </div>

    <div class="void-form__actions">
      <button class="btn btn--danger-ghost" type="submit" data-role="confirm">
        ยืนยันยกเลิกเอกสาร
      </button>
    </div>
  `;

  const alertBox = form.querySelector('[data-role="alert"]');
  const reasonInput = form.querySelector("#void-reason");
  const confirmButton = form.querySelector('[data-role="confirm"]');

  reasonInput.focus();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideAlert(alertBox);

    const reason = reasonInput.value.trim();
    if (!reason) {
      showAlert(alertBox, "กรุณาระบุเหตุผลในการยกเลิกเอกสารก่อนยืนยัน", "error");
      reasonInput.focus();
      return;
    }

    confirmButton.disabled = true;
    confirmButton.textContent = "กำลังยกเลิก...";

    const result = await onConfirm(reason);

    confirmButton.disabled = false;
    confirmButton.textContent = "ยืนยันยกเลิกเอกสาร";

    if (result?.error) showAlert(alertBox, result.error, "error");
  });

  return form;
}
