/*
  history-table.js — ตารางประวัติเอกสาร พร้อมปุ่มจัดการแต่ละแถว

  กฎสำคัญตาม Spec.md ข้อ 4
    - ปุ่ม "แก้ไข" แสดงเฉพาะแถวที่เป็นใบร่างเท่านั้น
    - ปุ่ม "ยกเลิกเอกสาร" แสดงเฉพาะแถวที่ออกแล้ว และเฉพาะผู้ดูแลระบบ
    - เอกสารที่ออกแล้วต้องไม่มีทางกดแก้ไขได้จากหน้านี้ไม่ว่าทางใด
*/

import { escapeHtml } from "../lib/ui.js";
import { formatMoney, formatThaiDate } from "../lib/format.js";
import { FORM_TYPES } from "./certificate-meta.js";

const FORM_LABEL = Object.fromEntries(FORM_TYPES.map((type) => [type.value, type.label]));

const STATUS_LABEL = {
  draft: "ร่าง",
  issued: "ออกแล้ว",
  void: "ยกเลิก",
};

export function createHistoryTable({ certificates, isAdmin, onView, onCopy, onEdit, onVoid }) {
  const wrapper = document.createElement("div");
  wrapper.className = "history-table-wrap";

  wrapper.innerHTML = `
    <table class="history-table">
      <thead>
        <tr>
          <th scope="col">เลขที่เอกสาร</th>
          <th scope="col">วันที่ออก</th>
          <th scope="col">ชื่อผู้ถูกหัก</th>
          <th scope="col">แบบที่ยื่น</th>
          <th scope="col">ยอดเงิน</th>
          <th scope="col">ยอดภาษี</th>
          <th scope="col">สถานะ</th>
          <th scope="col">จัดการ</th>
        </tr>
      </thead>
      <tbody>
        ${certificates.map((cert) => buildRow(cert, isAdmin)).join("")}
      </tbody>
    </table>
  `;

  for (const cert of certificates) {
    const row = wrapper.querySelector(`tr[data-cert-id="${cert.id}"]`);
    if (!row) continue;

    row.querySelector('[data-role="view"]').addEventListener("click", () => onView(cert));
    row.querySelector('[data-role="reprint"]').addEventListener("click", () => onView(cert));
    row.querySelector('[data-role="copy"]').addEventListener("click", () => onCopy(cert));
    row.querySelector('[data-role="edit"]')?.addEventListener("click", () => onEdit(cert));
    row.querySelector('[data-role="void"]')?.addEventListener("click", () => onVoid(cert));
  }

  return wrapper;
}

function buildRow(cert, isAdmin) {
  const payeeName = cert.payee_snapshot?.name ?? "(ไม่พบชื่อผู้ถูกหัก)";
  const status = cert.status;

  /*
    ปุ่มแก้ไขสร้างขึ้นเฉพาะใบร่างเท่านั้น
    ไม่ได้แค่ซ่อนด้วย CSS แต่ไม่สร้างปุ่มขึ้นมาเลย เพื่อไม่ให้มีทางกดได้
    และถึงจะเรียกคำสั่งแก้ไขข้ามหน้าจอ ฐานข้อมูลก็ปฏิเสธอีกชั้น (migration 010)
  */
  const editButton =
    status === "draft"
      ? `<button type="button" class="btn btn--small btn--secondary" data-role="edit">แก้ไข</button>`
      : "";

  /* ยกเลิกได้เฉพาะใบที่ออกแล้ว และเฉพาะผู้ดูแลระบบ ตาม Spec ข้อ 0 */
  const voidButton =
    status === "issued" && isAdmin
      ? `<button type="button" class="btn btn--small btn--danger-ghost" data-role="void">ยกเลิกเอกสาร</button>`
      : "";

  return `
    <tr data-cert-id="${cert.id}" class="${status === "void" ? "history-table__row--void" : ""}">
      <td data-label="เลขที่เอกสาร">
        <span class="history-table__docno">${escapeHtml(cert.doc_no || "ยังไม่ออกเลข")}</span>
        ${cert.book_no ? `<span class="history-table__book">เล่มที่ ${escapeHtml(cert.book_no)}</span>` : ""}
      </td>
      <td data-label="วันที่ออก">${escapeHtml(formatThaiDate(cert.issue_date))}</td>
      <td data-label="ชื่อผู้ถูกหัก">
        <span class="history-table__payee">${escapeHtml(payeeName)}</span>
        <span class="history-table__taxid">${escapeHtml(cert.payee_snapshot?.tax_id ?? "")}</span>
      </td>
      <td data-label="แบบที่ยื่น">${escapeHtml(FORM_LABEL[cert.form_type] ?? cert.form_type)}</td>
      <td data-label="ยอดเงิน" class="history-table__money">${formatMoney(cert.total_amount)}</td>
      <td data-label="ยอดภาษี" class="history-table__money">${formatMoney(cert.total_tax)}</td>
      <td data-label="สถานะ">
        <span class="badge badge--${status}">${STATUS_LABEL[status] ?? status}</span>
        ${
          status === "void" && cert.void_reason
            ? `<span class="history-table__reason">เหตุผล: ${escapeHtml(cert.void_reason)}</span>`
            : ""
        }
      </td>
      <td data-label="จัดการ">
        <div class="btn-group btn-group--tight">
          <button type="button" class="btn btn--small btn--secondary" data-role="view">ดู</button>
          <button type="button" class="btn btn--small btn--secondary" data-role="reprint">พิมพ์ซ้ำ</button>
          <button type="button" class="btn btn--small btn--secondary" data-role="copy">คัดลอกเป็นใบใหม่</button>
          ${editButton}
          ${voidButton}
        </div>
      </td>
    </tr>
  `;
}
