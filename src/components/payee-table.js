/*
  payee-table.js — ตารางรายชื่อผู้ถูกหักภาษี พร้อมปุ่มแก้ไขและปิด/เปิดการใช้งาน
  แยกออกจากหน้า /payees เพื่อให้แต่ละไฟล์สั้นและดูแลง่าย
*/

import { escapeHtml } from "../lib/ui.js";
import { formatThaiDate } from "../lib/format.js";

const ENTITY_LABEL = {
  individual: "บุคคลธรรมดา",
  juristic: "นิติบุคคล",
};

/*
  - payees      รายชื่อของหน้าปัจจุบัน
  - stats       Map ของสถิติการใช้งาน (รหัสรายชื่อ -> { certificate_count, last_used_date })
  - onEdit      กดปุ่มแก้ไข
  - onToggle    กดปุ่มปิด/เปิดการใช้งาน
*/
export function createPayeeTable({ payees, stats, onEdit, onToggle }) {
  const wrapper = document.createElement("div");
  wrapper.className = "payee-table-wrap";

  wrapper.innerHTML = `
    <table class="payee-table">
      <thead>
        <tr>
          <th scope="col">ชื่อ</th>
          <th scope="col">เลขผู้เสียภาษี</th>
          <th scope="col">ประเภท</th>
          <th scope="col">เอกสารที่เคยออก</th>
          <th scope="col">ใช้ล่าสุดเมื่อ</th>
          <th scope="col">จัดการ</th>
        </tr>
      </thead>
      <tbody>
        ${payees.map((payee) => buildRow(payee, stats.get(payee.id))).join("")}
      </tbody>
    </table>
  `;

  for (const payee of payees) {
    const row = wrapper.querySelector(`tr[data-payee-id="${payee.id}"]`);
    if (!row) continue;

    row.querySelector('[data-role="edit"]').addEventListener("click", () => onEdit(payee));
    row.querySelector('[data-role="toggle"]').addEventListener("click", () => onToggle(payee));
  }

  return wrapper;
}

function buildRow(payee, stat) {
  const count = stat?.certificate_count ?? 0;
  const lastUsed = stat?.last_used_date ? formatThaiDate(stat.last_used_date) : "ยังไม่เคยใช้";
  const fullName = [payee.title, payee.name].filter(Boolean).join(" ");

  return `
    <tr data-payee-id="${payee.id}" class="${payee.is_active ? "" : "payee-table__row--off"}">
      <td data-label="ชื่อ">
        <span class="payee-table__name">${escapeHtml(fullName)}</span>
        ${payee.is_active ? "" : '<span class="badge badge--off">ปิดใช้งาน</span>'}
      </td>
      <td data-label="เลขผู้เสียภาษี">
        <span class="payee-table__taxid">${escapeHtml(payee.tax_id)}</span>
      </td>
      <td data-label="ประเภท">${ENTITY_LABEL[payee.entity_type] ?? "-"}</td>
      <td data-label="เอกสารที่เคยออก">${count} ใบ</td>
      <td data-label="ใช้ล่าสุดเมื่อ">${escapeHtml(lastUsed)}</td>
      <td data-label="จัดการ">
        <div class="btn-group btn-group--tight">
          <button type="button" class="btn btn--small btn--secondary" data-role="edit">แก้ไข</button>
          <button
            type="button"
            class="btn btn--small ${payee.is_active ? "btn--danger-ghost" : "btn--secondary"}"
            data-role="toggle"
          >${payee.is_active ? "ปิดใช้งาน" : "เปิดใช้งาน"}</button>
        </div>
      </td>
    </tr>
  `;
}
