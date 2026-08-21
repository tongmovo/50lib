/*
  history-filters.js — แถบตัวกรองของหน้าประวัติเอกสาร

  ตัวกรองทุกตัวใช้ร่วมกันได้พร้อมกัน และทุกครั้งที่มีอะไรเปลี่ยน
  จะแจ้งกลับไปให้หน้าจอหลักดึงข้อมูลใหม่ทั้งตาราง แถบสรุป และการแบ่งหน้า
*/

import { createPayeeAutocomplete } from "./payee-autocomplete.js";
import { FORM_TYPES } from "./certificate-meta.js";

const SEARCH_DEBOUNCE_MS = 300;

const STATUS_OPTIONS = [
  { value: "", label: "ทุกสถานะ" },
  { value: "draft", label: "ร่าง" },
  { value: "issued", label: "ออกแล้ว" },
  { value: "void", label: "ยกเลิก" },
];

export function createHistoryFilters({ orgId, userId, incomeTypes, onChange, initialStatus = null }) {
  let searchTimer = null;

  const wrapper = document.createElement("section");
  wrapper.className = "card";
  wrapper.innerHTML = `
    <h2 class="card__subtitle">ค้นหาและกรองข้อมูล</h2>

    <div class="field">
      <label class="field__label" for="history-search">ค้นหา</label>
      <input class="field__input" id="history-search" type="search"
        placeholder="พิมพ์เลขที่เอกสาร ชื่อผู้ถูกหัก หรือเลขประจำตัวผู้เสียภาษี" />
    </div>

    <div class="meta-grid">
      <div class="field">
        <label class="field__label" for="filter-date-from">วันที่ออก ตั้งแต่</label>
        <input class="field__input" id="filter-date-from" type="date" />
      </div>
      <div class="field">
        <label class="field__label" for="filter-date-to">ถึงวันที่</label>
        <input class="field__input" id="filter-date-to" type="date" />
      </div>
      <div class="field">
        <label class="field__label" for="filter-form-type">แบบที่ยื่นรายการ</label>
        <select class="field__input" id="filter-form-type">
          <option value="">ทุกแบบ</option>
          ${FORM_TYPES.map((type) => `<option value="${type.value}">${type.label}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label class="field__label" for="filter-status">สถานะ</label>
        <select class="field__input" id="filter-status">
          ${STATUS_OPTIONS.map(
            (opt) =>
              `<option value="${opt.value}" ${
                opt.value === (initialStatus ?? "") ? "selected" : ""
              }>${opt.label}</option>`
          ).join("")}
        </select>
      </div>
    </div>

    <div class="history-filters__payee" data-role="payee"></div>

    <button type="button" class="btn btn--secondary btn--small" data-role="clear">
      ล้างตัวกรองทั้งหมด
    </button>
  `;

  /*
    ใช้ช่องเลือกผู้ถูกหักภาษีตัวเดียวกับหน้าสร้างเอกสาร ไม่เขียนซ้ำ
    ปุ่ม "เพิ่มรายชื่อใหม่" ที่ติดมาด้วยยังใช้ได้ตามปกติ ไม่ได้เสียหายอะไร
  */
  const payeePicker = createPayeeAutocomplete({
    orgId,
    userId,
    incomeTypes,
    onSelect: () => notify(),
  });
  wrapper.querySelector('[data-role="payee"]').appendChild(payeePicker.element);

  const searchInput = wrapper.querySelector("#history-search");
  const dateFromInput = wrapper.querySelector("#filter-date-from");
  const dateToInput = wrapper.querySelector("#filter-date-to");
  const formTypeSelect = wrapper.querySelector("#filter-form-type");
  const statusSelect = wrapper.querySelector("#filter-status");

  /* ช่องค้นหาต้องหน่วงก่อน ไม่งั้นจะยิงคำสั่งไปฐานข้อมูลทุกตัวอักษรที่พิมพ์ */
  searchInput.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(notify, SEARCH_DEBOUNCE_MS);
  });

  for (const control of [dateFromInput, dateToInput, formTypeSelect, statusSelect]) {
    control.addEventListener("change", notify);
  }

  wrapper.querySelector('[data-role="clear"]').addEventListener("click", () => {
    searchInput.value = "";
    dateFromInput.value = "";
    dateToInput.value = "";
    formTypeSelect.value = "";
    statusSelect.value = "";
    payeePicker.clearSelection();
    notify();
  });

  function getFilters() {
    return {
      search: searchInput.value,
      dateFrom: dateFromInput.value || null,
      dateTo: dateToInput.value || null,
      formType: formTypeSelect.value || null,
      status: statusSelect.value || null,
      payeeId: payeePicker.getSelected()?.id ?? null,
    };
  }

  function notify() {
    onChange(getFilters());
  }

  return { element: wrapper, getFilters };
}
