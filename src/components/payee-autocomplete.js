/*
  payee-autocomplete.js — ช่องเลือกผู้ถูกหักภาษีแบบพิมพ์ไปค้นไป

  ตาม Spec.md ข้อ 2: พิมพ์ตั้งแต่ 2 ตัวอักษรขึ้นไปจึงเริ่มค้น
  เลือกแล้วระบบเติมที่อยู่ เลขภาษี และประเภทเงินได้ที่ใช้บ่อยให้อัตโนมัติ
  มีปุ่มเพิ่มรายชื่อใหม่ในหน้าเดียวกัน ไม่ต้องออกจากฟอร์มที่กรอกค้างไว้
*/

import { listPayees, getPayeeById } from "../lib/payees.js";
import { createPayeeForm } from "./payee-form.js";
import { openModal } from "./modal.js";
import { escapeHtml } from "../lib/ui.js";

const MIN_SEARCH_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 300;

/*
  - orgId, userId, incomeTypes  ส่งต่อให้ฟอร์มเพิ่มรายชื่อใหม่
  - onSelect(payee)             ถูกเรียกเมื่อเลือกรายชื่อ หรือยกเลิกการเลือก (ส่ง null)
*/
export function createPayeeAutocomplete({ orgId, userId, incomeTypes, onSelect, initialPayee = null }) {
  let searchTimer = null;
  /* initialPayee ใช้ตอนคัดลอกเอกสารหรือแก้ใบร่าง เพื่อให้ผู้ใช้ไม่ต้องค้นหาซ้ำ */
  let selectedPayee = initialPayee;

  const wrapper = document.createElement("div");
  wrapper.className = "payee-picker";
  wrapper.innerHTML = `
    <div class="payee-picker__row">
      <div class="field payee-picker__field">
        <label class="field__label" for="payee-search-input">
          ผู้ถูกหักภาษี ณ ที่จ่าย <span class="field__required">*</span>
        </label>
        <input
          class="field__input"
          id="payee-search-input"
          type="search"
          autocomplete="off"
          placeholder="พิมพ์ชื่อหรือเลขผู้เสียภาษี อย่างน้อย 2 ตัวอักษร"
        />
        <p class="field__hint" data-role="hint">พิมพ์อย่างน้อย 2 ตัวอักษรเพื่อค้นหา</p>
      </div>
      <button type="button" class="btn btn--secondary payee-picker__add" data-role="add">
        + เพิ่มรายชื่อใหม่
      </button>
    </div>

    <ul class="payee-picker__results" data-role="results" hidden></ul>

    <div class="payee-picker__selected" data-role="selected" hidden></div>
  `;

  const input = wrapper.querySelector("#payee-search-input");
  const results = wrapper.querySelector('[data-role="results"]');
  const selectedBox = wrapper.querySelector('[data-role="selected"]');
  const hint = wrapper.querySelector('[data-role="hint"]');

  input.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    const keyword = input.value.trim();

    if (keyword.length < MIN_SEARCH_LENGTH) {
      hideResults();
      hint.textContent = "พิมพ์อย่างน้อย 2 ตัวอักษรเพื่อค้นหา";
      return;
    }

    hint.textContent = "กำลังค้นหา...";
    searchTimer = window.setTimeout(() => runSearch(keyword), SEARCH_DEBOUNCE_MS);
  });

  /* กด Esc เพื่อปิดรายการที่ค้นเจอ โดยไม่ต้องใช้เมาส์ */
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hideResults();
  });

  wrapper.querySelector('[data-role="add"]').addEventListener("click", openAddModal);

  /* ถ้ามีรายชื่อตั้งต้นมาแล้ว ให้แสดงกล่องสรุปตั้งแต่เปิดหน้า */
  if (selectedPayee) {
    renderSelected();
    hint.textContent = "เลือกไว้แล้ว ถ้าต้องการเปลี่ยนให้พิมพ์ค้นหาใหม่";
  }

  async function runSearch(keyword) {
    /* ค้นเฉพาะรายชื่อที่เปิดใช้งานอยู่ ตามที่กำหนดไว้ในขอบเขตงาน */
    const { payees, error } = await listPayees({ search: keyword, page: 1, includeInactive: false });

    if (error) {
      hint.textContent = error;
      hideResults();
      return;
    }

    if (payees.length === 0) {
      hint.textContent = `ไม่พบรายชื่อที่ตรงกับ "${keyword}" กดปุ่มเพิ่มรายชื่อใหม่ได้เลย`;
      hideResults();
      return;
    }

    hint.textContent = `พบ ${payees.length} รายการ กดเลือกได้เลย`;
    results.innerHTML = payees.map(buildResultItem).join("");
    results.hidden = false;

    for (const payee of payees) {
      results
        .querySelector(`li[data-id="${payee.id}"]`)
        .addEventListener("click", () => selectPayee(payee));
    }
  }

  function buildResultItem(payee) {
    const fullName = [payee.title, payee.name].filter(Boolean).join(" ");
    return `
      <li class="payee-picker__item" data-id="${payee.id}" role="button" tabindex="0">
        <span class="payee-picker__item-name">${escapeHtml(fullName)}</span>
        <span class="payee-picker__item-tax">${escapeHtml(payee.tax_id)}</span>
      </li>
    `;
  }

  function selectPayee(payee) {
    selectedPayee = payee;
    input.value = "";
    hideResults();
    hint.textContent = "เลือกแล้ว ถ้าต้องการเปลี่ยนให้พิมพ์ค้นหาใหม่";
    renderSelected();
    onSelect(payee);
  }

  function renderSelected() {
    if (!selectedPayee) {
      selectedBox.hidden = true;
      selectedBox.innerHTML = "";
      return;
    }

    const fullName = [selectedPayee.title, selectedPayee.name].filter(Boolean).join(" ");
    const entityLabel = selectedPayee.entity_type === "individual" ? "บุคคลธรรมดา" : "นิติบุคคล";

    selectedBox.hidden = false;
    selectedBox.innerHTML = `
      <div class="payee-picker__selected-head">
        <strong class="payee-picker__selected-name">${escapeHtml(fullName)}</strong>
        <button type="button" class="btn btn--small btn--danger-ghost" data-role="clear">เอาออก</button>
      </div>
      <dl class="info-list">
        <div class="info-list__row">
          <dt class="info-list__label">เลขประจำตัวผู้เสียภาษี</dt>
          <dd class="info-list__value">${escapeHtml(selectedPayee.tax_id)}</dd>
        </div>
        <div class="info-list__row">
          <dt class="info-list__label">ประเภท</dt>
          <dd class="info-list__value">${entityLabel} (สาขา ${escapeHtml(selectedPayee.branch || "00000")})</dd>
        </div>
        <div class="info-list__row">
          <dt class="info-list__label">ที่อยู่</dt>
          <dd class="info-list__value">${escapeHtml(selectedPayee.address || "ยังไม่ได้กรอกที่อยู่")}</dd>
        </div>
      </dl>
    `;

    selectedBox.querySelector('[data-role="clear"]').addEventListener("click", () => {
      selectedPayee = null;
      renderSelected();
      hint.textContent = "พิมพ์อย่างน้อย 2 ตัวอักษรเพื่อค้นหา";
      onSelect(null);
    });
  }

  /* เปิดฟอร์มเพิ่มรายชื่อ โดยใช้ฟอร์มตัวเดียวกับหน้าทะเบียน ไม่เขียนซ้ำ */
  function openAddModal() {
    const form = createPayeeForm({
      payee: null,
      orgId,
      userId,
      incomeTypes,
      onSaved: async (message, savedPayee) => {
        modal.close();
        if (!savedPayee?.id) return;

        /* ดึงข้อมูลเต็มของรายชื่อที่เพิ่งเพิ่ม แล้วเลือกเข้าฟอร์มให้ทันที */
        const { payee } = await getPayeeById(savedPayee.id);
        if (payee) selectPayee(payee);
      },
      onOpenDuplicate: async (payeeId) => {
        modal.close();
        const { payee } = await getPayeeById(payeeId);
        if (payee) selectPayee(payee);
      },
    });

    const modal = openModal({ title: "เพิ่มรายชื่อผู้ถูกหักภาษี", content: form });
  }

  function hideResults() {
    results.hidden = true;
    results.innerHTML = "";
  }

  /* ล้างการเลือกจากภายนอก ใช้ตอนกดปุ่มล้างตัวกรองในหน้าประวัติเอกสาร */
  function clearSelection({ notify = false } = {}) {
    selectedPayee = null;
    input.value = "";
    hideResults();
    hint.textContent = "พิมพ์อย่างน้อย 2 ตัวอักษรเพื่อค้นหา";
    renderSelected();
    if (notify) onSelect(null);
  }

  return { element: wrapper, getSelected: () => selectedPayee, clearSelection };
}
