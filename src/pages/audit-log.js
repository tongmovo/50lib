/*
  audit-log.js — หน้าประวัติการใช้งาน (path: /audit-log)

  เห็นได้เฉพาะผู้ดูแลระบบเท่านั้น กันไว้ 2 ชั้นเหมือนหน้าจัดการผู้ใช้
    ชั้นที่ 1  หน้าจอไม่สร้างเนื้อหาขึ้นมาเลยถ้าไม่ใช่ผู้ดูแลระบบ
    ชั้นที่ 2  กฎ RLS ในไฟล์ migration 011 ไม่ให้ผู้ใช้ทั่วไปอ่านตารางนี้
*/

import "../styles/audit-log.css";
import { createNavbar } from "../components/navbar.js";
import { getMyProfile } from "../lib/auth.js";
import { listAuditLogs, listOrgUserOptions, ACTION_LABELS, PAGE_SIZE } from "../lib/audit.js";
import { escapeHtml } from "../lib/ui.js";
import { navigate } from "../lib/router.js";

export async function renderAuditLogPage(root) {
  root.innerHTML = `<div class="page-loading">กำลังโหลดข้อมูล...</div>`;

  const { profile, error: profileError } = await getMyProfile();

  root.innerHTML = "";
  root.appendChild(await createNavbar({ profile }));

  const main = document.createElement("main");
  main.className = "page";
  root.appendChild(main);

  if (profileError) {
    main.innerHTML = `
      <div class="card card--warning">
        <h1 class="card__title">เปิดหน้าประวัติการใช้งานไม่ได้</h1>
        <p class="card__text">${escapeHtml(profileError)}</p>
      </div>
    `;
    return;
  }

  /* ผู้ใช้ทั่วไปเปิดที่อยู่เว็บนี้ตรง ๆ จะไม่มีการสร้างตารางขึ้นมาเลย */
  if (profile.role !== "admin") {
    main.innerHTML = `
      <div class="card card--warning">
        <h1 class="card__title">หน้านี้สำหรับผู้ดูแลระบบเท่านั้น</h1>
        <p class="card__text">
          ประวัติการใช้งานเป็นข้อมูลที่บอกได้ว่าใครทำอะไรเมื่อไหร่ จึงจำกัดให้เฉพาะผู้ดูแลระบบดูได้
        </p>
        <a class="btn btn--primary" href="/" data-link>กลับหน้าแรก</a>
      </div>
    `;
    return;
  }

  const users = await listOrgUserOptions();
  let filters = { dateFrom: null, dateTo: null, action: null, userId: null };
  let page = 1;

  main.innerHTML = `
    <section class="audit__head">
      <h1 class="audit__title">ประวัติการใช้งาน</h1>
      <p class="audit__subtitle">
        บันทึกว่าใครสร้าง แก้ไข ยกเลิก หรือพิมพ์เอกสารเมื่อไหร่ ข้อมูลนี้แก้ไขและลบไม่ได้
      </p>
    </section>

    <section class="card">
      <h2 class="card__subtitle">ตัวกรอง</h2>
      <div class="meta-grid">
        <div class="field">
          <label class="field__label" for="audit-from">ตั้งแต่วันที่</label>
          <input class="field__input" id="audit-from" type="date" />
        </div>
        <div class="field">
          <label class="field__label" for="audit-to">ถึงวันที่</label>
          <input class="field__input" id="audit-to" type="date" />
        </div>
        <div class="field">
          <label class="field__label" for="audit-action">ประเภทการกระทำ</label>
          <select class="field__input" id="audit-action">
            <option value="">ทุกประเภท</option>
            ${Object.entries(ACTION_LABELS)
              .map(([value, label]) => `<option value="${value}">${label}</option>`)
              .join("")}
          </select>
        </div>
        <div class="field">
          <label class="field__label" for="audit-user">ผู้ทำรายการ</label>
          <select class="field__input" id="audit-user">
            <option value="">ทุกคน</option>
            ${users
              .map(
                (user) =>
                  `<option value="${user.id}">${escapeHtml(user.full_name || "(ยังไม่ได้ตั้งชื่อ)")}</option>`
              )
              .join("")}
          </select>
        </div>
      </div>
      <button class="btn btn--secondary btn--small" type="button" data-role="clear">ล้างตัวกรอง</button>
    </section>

    <section class="card" data-role="list">
      <p class="page-loading">กำลังโหลดประวัติ...</p>
    </section>
  `;

  const listBox = main.querySelector('[data-role="list"]');
  const fromInput = main.querySelector("#audit-from");
  const toInput = main.querySelector("#audit-to");
  const actionSelect = main.querySelector("#audit-action");
  const userSelect = main.querySelector("#audit-user");

  for (const control of [fromInput, toInput, actionSelect, userSelect]) {
    control.addEventListener("change", () => {
      filters = readFilters();
      page = 1;   /* เปลี่ยนตัวกรองแล้วต้องกลับไปหน้าแรกเสมอ */
      refresh();
    });
  }

  main.querySelector('[data-role="clear"]').addEventListener("click", () => {
    fromInput.value = "";
    toInput.value = "";
    actionSelect.value = "";
    userSelect.value = "";
    filters = readFilters();
    page = 1;
    refresh();
  });

  await refresh();

  function readFilters() {
    return {
      dateFrom: fromInput.value || null,
      dateTo: toInput.value || null,
      action: actionSelect.value || null,
      userId: userSelect.value || null,
    };
  }

  async function refresh() {
    listBox.innerHTML = `<p class="page-loading">กำลังโหลดประวัติ...</p>`;

    const { logs, total, error } = await listAuditLogs(filters, page);

    if (error) {
      listBox.innerHTML = `<p class="page-loading">${escapeHtml(error)}</p>`;
      return;
    }

    if (logs.length === 0) {
      listBox.innerHTML = `
        <div class="empty-state">
          <p class="empty-state__text">ไม่พบประวัติที่ตรงกับเงื่อนไขที่เลือก</p>
          <p class="empty-state__hint">ลองล้างตัวกรอง หรือขยายช่วงวันที่แล้วดูใหม่อีกครั้ง</p>
        </div>
      `;
      return;
    }

    listBox.innerHTML = buildTable(logs) + buildPagination(total);
    bindRows(logs);
    bindPagination();
  }

  function buildTable(logs) {
    return `
      <div class="audit-table-wrap">
        <table class="audit-table">
          <thead>
            <tr>
              <th scope="col">วันเวลา</th>
              <th scope="col">ผู้ทำรายการ</th>
              <th scope="col">การกระทำ</th>
              <th scope="col">เอกสารที่เกี่ยวข้อง</th>
            </tr>
          </thead>
          <tbody>${logs.map(buildRow).join("")}</tbody>
        </table>
      </div>
    `;
  }

  function buildRow(log) {
    const docCell = log.docNo
      ? `<button type="button" class="audit-table__link" data-role="open" data-id="${log.entity_id}">
           ${escapeHtml(log.docNo)}
         </button>`
      : '<span class="audit-table__muted">(ยังไม่มีเลขที่)</span>';

    return `
      <tr data-log-id="${log.id}">
        <td data-label="วันเวลา">${escapeHtml(formatDateTime(log.created_at))}</td>
        <td data-label="ผู้ทำรายการ">${escapeHtml(log.userName)}</td>
        <td data-label="การกระทำ">
          <span class="badge badge--${log.action}">${ACTION_LABELS[log.action] ?? log.action}</span>
        </td>
        <td data-label="เอกสารที่เกี่ยวข้อง">${docCell}</td>
      </tr>
    `;
  }

  function bindRows(logs) {
    for (const log of logs) {
      const button = listBox.querySelector(`tr[data-log-id="${log.id}"] [data-role="open"]`);
      button?.addEventListener("click", () => navigate(`/doc/${button.dataset.id}`));
    }
  }

  function buildPagination(total) {
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const first = (page - 1) * PAGE_SIZE + 1;
    const last = Math.min(page * PAGE_SIZE, total);

    return `
      <div class="pagination">
        <span class="pagination__info">แสดง ${first}-${last} จากทั้งหมด ${total} รายการ</span>
        <div class="btn-group">
          <button class="btn btn--small btn--secondary" type="button" data-role="prev"
            ${page <= 1 ? "disabled" : ""}>ก่อนหน้า</button>
          <span class="pagination__page">หน้า ${page} / ${totalPages}</span>
          <button class="btn btn--small btn--secondary" type="button" data-role="next"
            ${page >= totalPages ? "disabled" : ""}>ถัดไป</button>
        </div>
      </div>
    `;
  }

  function bindPagination() {
    listBox.querySelector('[data-role="prev"]')?.addEventListener("click", () => {
      page -= 1;
      refresh();
    });
    listBox.querySelector('[data-role="next"]')?.addEventListener("click", () => {
      page += 1;
      refresh();
    });
  }
}

/*
  แสดงวันเวลาแบบไทย เช่น 21 ส.ค. 2569 14:32

  ค่าที่เก็บมาเป็นเวลาพร้อมโซนเวลา จึงให้ตัวแปลงของเบราว์เซอร์จัดการได้
  ต่างจากช่องวันที่ล้วนในที่อื่นที่ต้องอ่านตัวเลขจากข้อความเอง
*/
function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
                  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const pad = (n) => String(n).padStart(2, "0");

  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear() + 543} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
