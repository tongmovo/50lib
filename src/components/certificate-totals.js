/*
  certificate-totals.js — ส่วนท้ายของฟอร์มสร้างเอกสาร 50 ทวิ
  ครอบคลุมข้อ 6, 7, 8 และ 9 ของ Spec.md ข้อ 3.1
*/

import { formatMoney } from "../lib/format.js";
import { textField, escapeHtml } from "../lib/ui.js";

/* เงื่อนไขการจ่ายเงิน ตรงกับค่าที่ฐานข้อมูลยอมรับในไฟล์ migration 003 */
const PAYMENT_CONDITIONS = [
  { value: "withheld", label: "หัก ณ ที่จ่าย" },
  { value: "paid_always", label: "ออกให้ตลอดไป" },
  { value: "paid_once", label: "ออกให้ครั้งเดียว" },
  { value: "other", label: "อื่น ๆ (ระบุ)" },
];

/* initial ใช้ตอนคัดลอกเอกสารเดิมหรือแก้ใบร่าง เพื่อเติมค่าที่เคยกรอกไว้กลับเข้าฟอร์ม */
export function createCertificateTotals({ initial = {} } = {}) {
  const moneyOrEmpty = (value) => (value == null || Number(value) === 0 ? "" : String(value));
  const initialCondition = initial.paymentCondition ?? "withheld";

  const wrapper = document.createElement("div");

  wrapper.innerHTML = `
    <section class="card">
      <h2 class="card__subtitle">6. รวมเงินที่จ่ายและภาษีที่หักนำส่ง</h2>
      <div class="totals">
        <div class="totals__item">
          <span class="totals__label">รวมเงินที่จ่าย</span>
          <span class="totals__value" data-role="total-amount">0.00</span>
          <span class="totals__unit">บาท</span>
        </div>
        <div class="totals__item totals__item--highlight">
          <span class="totals__label">รวมภาษีที่หักและนำส่ง</span>
          <span class="totals__value" data-role="total-tax">0.00</span>
          <span class="totals__unit">บาท</span>
        </div>
      </div>

      <h3 class="totals__subhead">7. รวมภาษีที่หักนำส่ง (ตัวอักษร)</h3>
      <div class="totals__text" data-role="total-text">ศูนย์บาทถ้วน</div>
      <p class="field__hint">ช่องนี้ระบบแปลงให้อัตโนมัติ แก้ไม่ได้ เพื่อกันการพิมพ์ผิด</p>
    </section>

    <section class="card">
      <h2 class="card__subtitle">8. เงินที่จ่ายเข้ากองทุน</h2>
      <p class="card__text card__text--muted">ไม่บังคับกรอก ถ้าไม่มีให้เว้นว่างไว้</p>
      <div class="meta-grid">
        ${textField({ id: "fund-pf-gpf", label: "กบข. / กสจ. / กองทุนสงเคราะห์ครูฯ", value: moneyOrEmpty(initial.pfGpfAmount), canEdit: true, inputMode: "decimal" })}
        ${textField({ id: "fund-sso", label: "กองทุนประกันสังคม", value: moneyOrEmpty(initial.ssoAmount), canEdit: true, inputMode: "decimal" })}
        ${textField({ id: "fund-provident", label: "กองทุนสำรองเลี้ยงชีพ", value: moneyOrEmpty(initial.providentAmount), canEdit: true, inputMode: "decimal" })}
      </div>
    </section>

    <section class="card">
      <h2 class="card__subtitle">9. ผู้จ่ายเงิน</h2>
      <div class="radio-group" data-role="conditions">
        ${PAYMENT_CONDITIONS.map(
          (condition) => `
          <label class="radio-group__option">
            <input type="radio" name="payment-condition" value="${condition.value}"
              ${condition.value === initialCondition ? "checked" : ""} />
            <span>${condition.label}</span>
          </label>
        `
        ).join("")}
      </div>

      <div class="field" data-role="other-wrap" ${initialCondition === "other" ? "" : "hidden"}>
        <label class="field__label" for="condition-other">ระบุเงื่อนไขอื่น ๆ</label>
        <input class="field__input" id="condition-other" type="text" placeholder="พิมพ์เงื่อนไขการจ่ายเงิน"
          value="${escapeHtml(initial.paymentConditionOther ?? "")}" />
      </div>
    </section>
  `;

  const totalAmountBox = wrapper.querySelector('[data-role="total-amount"]');
  const totalTaxBox = wrapper.querySelector('[data-role="total-tax"]');
  const totalTextBox = wrapper.querySelector('[data-role="total-text"]');
  const otherWrap = wrapper.querySelector('[data-role="other-wrap"]');
  const otherInput = wrapper.querySelector("#condition-other");

  /* เลือก "อื่น ๆ" จึงจะแสดงช่องให้พิมพ์ ไม่งั้นหน้าจอจะรกโดยไม่จำเป็น */
  wrapper.querySelectorAll('input[name="payment-condition"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      const isOther = getSelectedCondition() === "other";
      otherWrap.hidden = !isOther;
      if (isOther) otherInput.focus();
    });
  });

  function getSelectedCondition() {
    return wrapper.querySelector('input[name="payment-condition"]:checked')?.value ?? "withheld";
  }

  /* หน้าจอหลักเรียกทุกครั้งที่ยอดเปลี่ยน เพื่ออัปเดตยอดรวมและตัวอักษรแบบสด */
  function setTotals({ totalAmount, totalTax, totalTaxText }) {
    totalAmountBox.textContent = formatMoney(totalAmount);
    totalTaxBox.textContent = formatMoney(totalTax);
    totalTextBox.textContent = totalTaxText || "ศูนย์บาทถ้วน";
  }

  function getValues() {
    const numberOf = (id) => {
      const raw = wrapper.querySelector(`#${id}`).value.trim().replace(/,/g, "");
      const value = Number(raw);
      return raw === "" || Number.isNaN(value) ? 0 : value;
    };

    return {
      pfGpfAmount: numberOf("fund-pf-gpf"),
      ssoAmount: numberOf("fund-sso"),
      providentAmount: numberOf("fund-provident"),
      paymentCondition: getSelectedCondition(),
      paymentConditionOther: getSelectedCondition() === "other" ? otherInput.value.trim() : "",
    };
  }

  return { element: wrapper, setTotals, getValues };
}
