/*
  income-lines.js — ตารางรายการเงินได้ในเอกสาร 50 ทวิ

  กฎสำคัญตาม Spec.md ข้อ 3.2
    - ภาษีคำนวณสดทุกครั้งที่พิมพ์
    - ถ้าผู้ใช้พิมพ์ยอดภาษีเองในบรรทัดใด บรรทัดนั้นจะถูกทำเครื่องหมายว่า "แก้ด้วยมือ"
      แล้วระบบจะหยุดคำนวณทับ จนกว่าจะกดปุ่มคำนวณใหม่ของบรรทัดนั้น
    - กด Enter ที่บรรทัดสุดท้าย = เพิ่มบรรทัดใหม่ทันที (Spec ข้อ 8 เรื่องคีย์บอร์ด)
*/

import { calculateLineTax } from "../lib/tax.js";
import { escapeHtml } from "../lib/ui.js";

export function createIncomeLines({ incomeTypes, onChange, initialLines = null }) {
  /* เก็บสถานะของทุกบรรทัดไว้ในตัวแปรนี้ หน้าจอเป็นเพียงภาพสะท้อนของข้อมูลชุดนี้ */
  /* initialLines ใช้ตอนคัดลอกเอกสารหรือแก้ใบร่าง ถ้าไม่ส่งมาจะเริ่มด้วยบรรทัดว่าง 1 บรรทัด */
  let lines =
    initialLines && initialLines.length > 0
      ? initialLines.map((line, index) => ({ ...createEmptyLine(), ...line, id: index + 1 }))
      : [createEmptyLine()];
  let nextId = lines.length + 1;

  const wrapper = document.createElement("div");
  wrapper.className = "income-lines";
  wrapper.innerHTML = `
    <div class="income-lines__table-wrap">
      <table class="income-lines__table">
        <thead>
          <tr>
            <th scope="col">ประเภทเงินได้</th>
            <th scope="col">วันที่จ่าย</th>
            <th scope="col">จำนวนเงินที่จ่าย</th>
            <th scope="col">อัตรา %</th>
            <th scope="col">ภาษีที่หัก</th>
            <th scope="col"></th>
          </tr>
        </thead>
        <tbody data-role="body"></tbody>
      </table>
    </div>

    <button type="button" class="btn btn--secondary btn--small" data-role="add-line">
      + เพิ่มบรรทัด
    </button>
    <p class="field__hint">เคล็ดลับ: กดปุ่ม Enter ในบรรทัดสุดท้ายเพื่อเพิ่มบรรทัดใหม่ได้ทันที</p>
  `;

  const body = wrapper.querySelector('[data-role="body"]');
  wrapper.querySelector('[data-role="add-line"]').addEventListener("click", () => addLine());

  /*
    ตอนสร้างชิ้นส่วนนี้ ให้ "วาดอย่างเดียว" ห้ามแจ้งกลับไปยังผู้เรียก

    เหตุผล: ผู้เรียกยังสร้างตัวเองไม่เสร็จ ตัวแปรที่ฟังก์ชัน onChange ต้องใช้
    อาจยังประกาศไม่ถึงบรรทัด การแจ้งกลับตอนนี้จะทำให้ทั้งหน้าพังทันที
    หน้าที่แจ้งยอดครั้งแรกเป็นของผู้เรียก ซึ่งจะเรียก getLines() เองเมื่อพร้อมแล้ว
  */
  paint();

  function createEmptyLine() {
    return {
      id: 1,
      incomeTypeCode: "",
      labelOverride: "",
      paidDate: "",
      amount: "",
      rate: "",
      taxAmount: 0,
      isManual: false,
    };
  }

  /* วาดตารางใหม่อย่างเดียว ไม่แจ้งผู้เรียก */
  function paint() {
    body.innerHTML = lines.map(buildRow).join("");
    for (const line of lines) bindRow(line);
  }

  /* วาดใหม่แล้วแจ้งยอดกลับไปให้หน้าจอหลัก ใช้กับทุกการกระทำของผู้ใช้ */
  function render() {
    paint();
    onChange(getLines());
  }

  function buildRow(line) {
    const isOther = line.incomeTypeCode === "other";

    return `
      <tr data-line-id="${line.id}">
        <td data-label="ประเภทเงินได้">
          <select class="field__input income-lines__select" data-role="type">
            <option value="">เลือกประเภท</option>
            ${incomeTypes
              .map(
                (type) =>
                  `<option value="${escapeHtml(type.code)}" ${
                    line.incomeTypeCode === type.code ? "selected" : ""
                  }>${escapeHtml(type.label_th)}</option>`
              )
              .join("")}
          </select>
          ${
            isOther
              ? `<input class="field__input income-lines__other" data-role="label-override"
                   type="text" placeholder="พิมพ์ชื่อประเภทเงินได้"
                   value="${escapeHtml(line.labelOverride)}" />`
              : ""
          }
        </td>
        <td data-label="วันที่จ่าย">
          <input class="field__input" data-role="paid-date" type="date" value="${escapeHtml(line.paidDate)}" />
        </td>
        <td data-label="จำนวนเงินที่จ่าย">
          <input class="field__input income-lines__number" data-role="amount"
                 type="text" inputmode="decimal" value="${escapeHtml(line.amount)}" />
        </td>
        <td data-label="อัตรา %">
          <input class="field__input income-lines__rate" data-role="rate"
                 type="text" inputmode="decimal" value="${escapeHtml(line.rate)}" />
        </td>
        <td data-label="ภาษีที่หัก">
          <input class="field__input income-lines__number ${line.isManual ? "income-lines__number--manual" : ""}"
                 data-role="tax" type="text" inputmode="decimal" value="${line.taxAmount}" />
          ${
            line.isManual
              ? `<button type="button" class="btn btn--small btn--secondary income-lines__recalc" data-role="recalc">คำนวณใหม่</button>
                 <span class="income-lines__manual-tag">แก้ด้วยมือ</span>`
              : ""
          }
        </td>
        <td data-label="">
          <button type="button" class="btn btn--small btn--danger-ghost" data-role="remove"
            ${lines.length === 1 ? "disabled" : ""}>ลบ</button>
        </td>
      </tr>
    `;
  }

  function bindRow(line) {
    const row = body.querySelector(`tr[data-line-id="${line.id}"]`);
    if (!row) return;

    const typeSelect = row.querySelector('[data-role="type"]');
    const amountInput = row.querySelector('[data-role="amount"]');
    const rateInput = row.querySelector('[data-role="rate"]');
    const taxInput = row.querySelector('[data-role="tax"]');

    typeSelect.addEventListener("change", () => {
      line.incomeTypeCode = typeSelect.value;
      const selected = incomeTypes.find((type) => type.code === typeSelect.value);

      /* เติมอัตราแนะนำให้ แต่ไม่ทับค่าที่ผู้ใช้พิมพ์เองไว้แล้ว */
      if (selected?.default_rate != null && !String(line.rate).trim()) {
        line.rate = String(selected.default_rate);
      }
      recalcLine(line);
      render();
    });

    row.querySelector('[data-role="label-override"]')?.addEventListener("input", (event) => {
      line.labelOverride = event.target.value;
      onChange(getLines());
    });

    row.querySelector('[data-role="paid-date"]').addEventListener("change", (event) => {
      line.paidDate = event.target.value;
      onChange(getLines());
    });

    amountInput.addEventListener("input", () => {
      line.amount = amountInput.value;
      recalcLine(line);
      refreshTaxCell(row, line);
      onChange(getLines());
    });

    rateInput.addEventListener("input", () => {
      line.rate = rateInput.value;
      recalcLine(line);
      refreshTaxCell(row, line);
      onChange(getLines());
    });

    /* ผู้ใช้พิมพ์ยอดภาษีเอง = ทำเครื่องหมายว่าแก้ด้วยมือ แล้วหยุดคำนวณทับ */
    taxInput.addEventListener("input", () => {
      line.taxAmount = taxInput.value;
      if (!line.isManual) {
        line.isManual = true;
        render();
        /* วาดใหม่แล้วต้องคืนโฟกัสให้ผู้ใช้พิมพ์ต่อได้ทันที ไม่สะดุด */
        const newInput = body.querySelector(`tr[data-line-id="${line.id}"] [data-role="tax"]`);
        newInput?.focus();
        newInput?.setSelectionRange(newInput.value.length, newInput.value.length);
        return;
      }
      onChange(getLines());
    });

    row.querySelector('[data-role="recalc"]')?.addEventListener("click", () => {
      line.isManual = false;
      recalcLine(line);
      render();
    });

    row.querySelector('[data-role="remove"]').addEventListener("click", () => removeLine(line.id));

    /* กด Enter ที่บรรทัดสุดท้าย = เพิ่มบรรทัดใหม่ทันที */
    row.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      if (lines[lines.length - 1].id === line.id) addLine();
    });
  }

  /* อัปเดตเฉพาะช่องภาษีของบรรทัดนั้น เพื่อไม่ให้ต้องวาดตารางใหม่ขณะผู้ใช้กำลังพิมพ์ */
  function refreshTaxCell(row, line) {
    if (line.isManual) return;
    row.querySelector('[data-role="tax"]').value = line.taxAmount;
  }

  function recalcLine(line) {
    if (line.isManual) return;
    line.taxAmount = calculateLineTax(line.amount, line.rate);
  }

  function addLine() {
    lines.push({ ...createEmptyLine(), id: nextId });
    nextId += 1;
    render();

    /* ย้ายโฟกัสไปบรรทัดใหม่ทันที เพื่อให้กรอกต่อได้โดยไม่ต้องใช้เมาส์ */
    const lastRow = body.querySelector("tr:last-child [data-role='type']");
    lastRow?.focus();
  }

  function removeLine(lineId) {
    if (lines.length === 1) return;
    lines = lines.filter((line) => line.id !== lineId);
    render();
  }

  /* ส่งข้อมูลออกไปให้หน้าจอหลักเอาไปคำนวณยอดรวมและบันทึก */
  function getLines() {
    return lines.map((line) => ({ ...line }));
  }

  return { element: wrapper, getLines };
}
