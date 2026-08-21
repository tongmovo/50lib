/*
  payees.js — หน้าทะเบียนผู้ถูกหักภาษี (path: /payees)

  หน้านี้ดูแล 3 อย่าง: ค้นหา / แบ่งหน้า / เปิดกล่องเพิ่ม-แก้ไข
  ส่วนตัวตารางและตัวฟอร์มแยกไปอยู่ใน src/components/
*/

import "../styles/payees.css";
import { createNavbar } from "../components/navbar.js";
import { createPayeeTable } from "../components/payee-table.js";
import { createPayeeForm } from "../components/payee-form.js";
import { openModal } from "../components/modal.js";
import { getMyProfile } from "../lib/auth.js";
import { showAlert, hideAlert } from "../lib/ui.js";
import {
  listPayees,
  getUsageStats,
  listIncomeTypes,
  setPayeeActive,
  getPayeeById,
  PAGE_SIZE,
} from "../lib/payees.js";

/* หน่วงเวลาก่อนค้นหา เพื่อไม่ให้ยิงคำสั่งไปฐานข้อมูลทุกตัวอักษรที่พิมพ์ */
const SEARCH_DEBOUNCE_MS = 300;

export async function renderPayeesPage(root) {
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
        <h1 class="card__title">เปิดหน้าทะเบียนไม่ได้</h1>
        <p class="card__text">${profileError}</p>
      </div>
    `;
    return;
  }

  const incomeTypes = await listIncomeTypes();

  /* สถานะของหน้า เก็บไว้ที่เดียว เวลามีอะไรเปลี่ยนก็สั่งวาดตารางใหม่รอบเดียวจบ */
  const state = { search: "", page: 1, includeInactive: false };
  let searchTimer = null;

  main.innerHTML = `
    <section class="payees__head">
      <div>
        <h1 class="payees__title">ทะเบียนผู้ถูกหักภาษี ณ ที่จ่าย</h1>
        <p class="payees__subtitle">รายชื่อผู้รับเงินที่บริษัทเคยออกหรือจะออกหนังสือรับรองให้</p>
      </div>
      <button class="btn btn--primary" type="button" data-role="add">+ เพิ่มรายชื่อใหม่</button>
    </section>

    <section class="card">
      <div class="payees__toolbar">
        <div class="field payees__search">
          <label class="field__label" for="payee-search">ค้นหา</label>
          <input
            class="field__input"
            id="payee-search"
            type="search"
            placeholder="พิมพ์ชื่อ หรือเลขประจำตัวผู้เสียภาษี"
          />
        </div>
        <label class="payees__checkbox">
          <input type="checkbox" data-role="include-inactive" />
          <span>แสดงรายชื่อที่ปิดใช้งานด้วย</span>
        </label>
      </div>

      <div class="form-alert" data-role="alert" role="alert" hidden></div>
      <div data-role="list"><p class="page-loading">กำลังโหลดรายชื่อ...</p></div>
    </section>
  `;

  const listBox = main.querySelector('[data-role="list"]');
  const alertBox = main.querySelector('[data-role="alert"]');
  const searchInput = main.querySelector("#payee-search");
  const inactiveCheckbox = main.querySelector('[data-role="include-inactive"]');

  main.querySelector('[data-role="add"]').addEventListener("click", () => openPayeeModal(null));

  searchInput.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      state.search = searchInput.value;
      state.page = 1;   /* เปลี่ยนคำค้นแล้วต้องกลับไปหน้าแรกเสมอ */
      refreshList();
    }, SEARCH_DEBOUNCE_MS);
  });

  inactiveCheckbox.addEventListener("change", () => {
    state.includeInactive = inactiveCheckbox.checked;
    state.page = 1;
    refreshList();
  });

  await refreshList();

  /* ---------- ดึงข้อมูลแล้ววาดตารางใหม่ ---------- */
  async function refreshList() {
    listBox.innerHTML = `<p class="page-loading">กำลังโหลดรายชื่อ...</p>`;

    const { payees, total, error } = await listPayees(state);

    if (error) {
      listBox.innerHTML = `<p class="page-loading">${error}</p>`;
      return;
    }

    if (payees.length === 0) {
      /* สถานะไม่มีข้อมูล ต้องมีปุ่มชวนเริ่มงาน ไม่ปล่อยให้เป็นหน้าว่างเปล่า */
      listBox.innerHTML = state.search
        ? `<div class="empty-state">
             <p class="empty-state__text">ไม่พบรายชื่อที่ตรงกับคำค้น "${escapeText(state.search)}"</p>
             <p class="empty-state__hint">ลองพิมพ์คำสั้นลง หรือตรวจตัวสะกดอีกครั้ง</p>
           </div>`
        : `<div class="empty-state">
             <p class="empty-state__text">ยังไม่มีรายชื่อผู้ถูกหักภาษีในระบบ</p>
             <button class="btn btn--primary" type="button" data-role="empty-add">+ เพิ่มรายชื่อแรก</button>
           </div>`;

      listBox
        .querySelector('[data-role="empty-add"]')
        ?.addEventListener("click", () => openPayeeModal(null));
      return;
    }

    const stats = await getUsageStats(payees.map((payee) => payee.id));

    listBox.innerHTML = "";
    listBox.appendChild(
      createPayeeTable({ payees, stats, onEdit: openPayeeModal, onToggle: togglePayee })
    );
    listBox.appendChild(buildPagination(total));
  }

  /* ---------- แถบแบ่งหน้า ---------- */
  function buildPagination(total) {
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const first = (state.page - 1) * PAGE_SIZE + 1;
    const last = Math.min(state.page * PAGE_SIZE, total);

    const nav = document.createElement("div");
    nav.className = "pagination";
    nav.innerHTML = `
      <span class="pagination__info">แสดง ${first}-${last} จากทั้งหมด ${total} รายชื่อ</span>
      <div class="pagination__buttons">
        <button class="btn btn--small btn--secondary" type="button" data-role="prev"
          ${state.page <= 1 ? "disabled" : ""}>ก่อนหน้า</button>
        <span class="pagination__page">หน้า ${state.page} / ${totalPages}</span>
        <button class="btn btn--small btn--secondary" type="button" data-role="next"
          ${state.page >= totalPages ? "disabled" : ""}>ถัดไป</button>
      </div>
    `;

    nav.querySelector('[data-role="prev"]').addEventListener("click", () => {
      state.page -= 1;
      refreshList();
    });
    nav.querySelector('[data-role="next"]').addEventListener("click", () => {
      state.page += 1;
      refreshList();
    });

    return nav;
  }

  /* ---------- เปิดกล่องเพิ่ม/แก้ไข ---------- */
  function openPayeeModal(payee) {
    hideAlert(alertBox);

    const form = createPayeeForm({
      payee,
      orgId: profile.org_id,
      userId: profile.id,
      incomeTypes,
      onSaved: (message) => {
        modal.close();
        showAlert(alertBox, message, "success");
        refreshList();
      },
      /* กดจากคำเตือน "มีรายชื่อนี้อยู่แล้ว" ให้ปิดกล่องเดิมแล้วเปิดรายการที่ซ้ำขึ้นมาแทน */
      onOpenDuplicate: async (payeeId) => {
        modal.close();
        const { payee: existing, error } = await getPayeeById(payeeId);
        if (error || !existing) {
          showAlert(alertBox, error ?? "เปิดรายการเดิมไม่สำเร็จ", "error");
          return;
        }
        openPayeeModal(existing);
      },
    });

    const modal = openModal({
      title: payee ? "แก้ไขรายชื่อผู้ถูกหักภาษี" : "เพิ่มรายชื่อผู้ถูกหักภาษี",
      content: form,
    });
  }

  /* ---------- ปิด/เปิดการใช้งาน (ไม่ลบข้อมูลจริง) ---------- */
  async function togglePayee(payee) {
    const nextActive = !payee.is_active;
    const question = nextActive
      ? `ต้องการเปิดใช้งานรายชื่อ "${payee.name}" อีกครั้งใช่หรือไม่`
      : `ต้องการปิดใช้งานรายชื่อ "${payee.name}" ใช่หรือไม่\n\nรายชื่อจะไม่ถูกลบออกจากระบบ เพียงแต่จะไม่ขึ้นให้เลือกตอนสร้างเอกสารใหม่\nเอกสารเก่าที่เคยออกให้รายนี้ยังอยู่ครบตามเดิม`;

    if (!window.confirm(question)) return;

    hideAlert(alertBox);
    const { error } = await setPayeeActive(payee.id, nextActive);

    if (error) {
      showAlert(alertBox, error, "error");
      return;
    }

    showAlert(alertBox, nextActive ? "เปิดใช้งานรายชื่อแล้ว" : "ปิดใช้งานรายชื่อแล้ว", "success");
    refreshList();
  }
}

/* ใช้กับข้อความที่ผู้ใช้พิมพ์เอง ก่อนนำไปแสดงกลับในหน้าจอ */
function escapeText(text) {
  return String(text ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
