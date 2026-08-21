/*
  history.js — หน้าประวัติเอกสาร (path: /history)

  หน้านี้คุมการกรอง การแบ่งหน้า แถบสรุป และการส่งออก CSV
  ส่วนตัวตารางและแถบตัวกรองแยกไปอยู่ใน src/components/
*/

import "../styles/history.css";
import { createNavbar } from "../components/navbar.js";
import { createHistoryFilters } from "../components/history-filters.js";
import { createHistoryTable } from "../components/history-table.js";
import { createVoidForm } from "../components/void-form.js";
import { openModal } from "../components/modal.js";
import { getMyProfile } from "../lib/auth.js";
import { listIncomeTypes } from "../lib/payees.js";
import { listCertificates, summarizeCertificates, voidCertificate, PAGE_SIZE } from "../lib/history.js";
import { exportCertificatesCsv } from "../lib/history-export.js";
import { showAlert, hideAlert, takeFlash, escapeHtml } from "../lib/ui.js";
import { formatMoney } from "../lib/format.js";
import { navigate } from "../lib/router.js";

export async function renderHistoryPage(root) {
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
        <h1 class="card__title">เปิดหน้าประวัติเอกสารไม่ได้</h1>
        <p class="card__text">${profileError}</p>
      </div>
    `;
    return;
  }

  const incomeTypes = await listIncomeTypes();
  const isAdmin = profile.role === "admin";

  /*
    รับตัวกรองเริ่มต้นจากส่วนท้ายของที่อยู่เว็บ เช่น /history?status=draft
    ใช้ตอนกดลิงก์ "ดูใบร่างทั้งหมด" จากหน้าแรก จะได้เห็นเฉพาะใบร่างทันที
  */
  const initialStatus = new URLSearchParams(window.location.search).get("status");
  let filters = { ...emptyFilters(), status: initialStatus || null };
  let page = 1;

  main.innerHTML = `
    <section class="history__head">
      <div>
        <h1 class="history__title">ประวัติเอกสาร</h1>
        <p class="history__subtitle">เอกสารหัก ณ ที่จ่ายทั้งหมดที่เคยสร้างในระบบ</p>
      </div>
      <button class="btn btn--secondary" type="button" data-role="export">ส่งออก CSV</button>
    </section>

    <div class="form-alert" data-role="alert" role="alert" hidden></div>

    <section class="summary" data-role="summary"></section>
    <div data-role="filters"></div>
    <section class="card" data-role="list">
      <p class="page-loading">กำลังโหลดรายการ...</p>
    </section>
  `;

  const alertBox = main.querySelector('[data-role="alert"]');
  const summaryBox = main.querySelector('[data-role="summary"]');
  const listBox = main.querySelector('[data-role="list"]');
  const exportButton = main.querySelector('[data-role="export"]');

  const filterBar = createHistoryFilters({
    orgId: profile.org_id,
    userId: profile.id,
    incomeTypes,
    initialStatus,
    onChange: (nextFilters) => {
      filters = nextFilters;
      page = 1;   /* เปลี่ยนตัวกรองแล้วต้องกลับไปหน้าแรกเสมอ */
      refresh();
    },
  });
  main.querySelector('[data-role="filters"]').appendChild(filterBar.element);

  exportButton.addEventListener("click", handleExport);

  await refresh();

  /* ข้อความแจ้งผลที่ฝากมาจากหน้าอื่น เช่น หลังแก้ใบร่างเสร็จ */
  const flash = takeFlash();
  if (flash) showAlert(alertBox, flash.text, flash.kind);

  /* ---------- ดึงข้อมูลใหม่ทั้งหน้า ---------- */
  async function refresh() {
    listBox.innerHTML = `<p class="page-loading">กำลังโหลดรายการ...</p>`;
    renderSummary(null);

    const [listResult, summary] = await Promise.all([
      listCertificates(filters, page),
      summarizeCertificates(filters),
    ]);

    renderSummary(summary);

    if (listResult.error) {
      listBox.innerHTML = `<p class="page-loading">${escapeHtml(listResult.error)}</p>`;
      return;
    }

    if (listResult.certificates.length === 0) {
      listBox.innerHTML = `
        <div class="empty-state">
          <p class="empty-state__text">ไม่พบเอกสารที่ตรงกับเงื่อนไขที่เลือก</p>
          <p class="empty-state__hint">ลองล้างตัวกรอง หรือเปลี่ยนช่วงวันที่แล้วดูใหม่อีกครั้ง</p>
          <a class="btn btn--primary" href="/new" data-link>+ สร้างเอกสารใหม่</a>
        </div>
      `;
      return;
    }

    listBox.innerHTML = "";
    listBox.appendChild(
      createHistoryTable({
        certificates: listResult.certificates,
        isAdmin,
        onView: (cert) => navigate(`/doc/${cert.id}`),
        onCopy: (cert) => navigate(`/new?copy=${cert.id}`),
        onEdit: (cert) => navigate(`/new?edit=${cert.id}`),
        onVoid: openVoidModal,
      })
    );
    listBox.appendChild(buildPagination(listResult.total));
  }

  /* ---------- แถบสรุป ---------- */
  function renderSummary(summary) {
    if (!summary) {
      summaryBox.innerHTML = `<p class="summary__loading">กำลังคำนวณยอดสรุป...</p>`;
      return;
    }

    summaryBox.innerHTML = `
      <div class="summary__item">
        <span class="summary__label">จำนวนใบ</span>
        <span class="summary__value">${summary.count}</span>
        <span class="summary__unit">ใบ</span>
      </div>
      <div class="summary__item">
        <span class="summary__label">รวมยอดเงินที่จ่าย</span>
        <span class="summary__value">${formatMoney(summary.totalAmount)}</span>
        <span class="summary__unit">บาท</span>
      </div>
      <div class="summary__item summary__item--highlight">
        <span class="summary__label">รวมยอดภาษีที่หัก</span>
        <span class="summary__value">${formatMoney(summary.totalTax)}</span>
        <span class="summary__unit">บาท</span>
      </div>
      <p class="summary__note">ยอดทั้งหมดนับเฉพาะเอกสารที่ตรงกับตัวกรองและคำค้นปัจจุบัน</p>
    `;
  }

  /* ---------- แถบแบ่งหน้า ---------- */
  function buildPagination(total) {
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const first = (page - 1) * PAGE_SIZE + 1;
    const last = Math.min(page * PAGE_SIZE, total);

    const nav = document.createElement("div");
    nav.className = "pagination";
    nav.innerHTML = `
      <span class="pagination__info">แสดง ${first}-${last} จากทั้งหมด ${total} ใบ</span>
      <div class="pagination__buttons">
        <button class="btn btn--small btn--secondary" type="button" data-role="prev"
          ${page <= 1 ? "disabled" : ""}>ก่อนหน้า</button>
        <span class="pagination__page">หน้า ${page} / ${totalPages}</span>
        <button class="btn btn--small btn--secondary" type="button" data-role="next"
          ${page >= totalPages ? "disabled" : ""}>ถัดไป</button>
      </div>
    `;

    nav.querySelector('[data-role="prev"]').addEventListener("click", () => {
      page -= 1;
      refresh();
    });
    nav.querySelector('[data-role="next"]').addEventListener("click", () => {
      page += 1;
      refresh();
    });

    return nav;
  }

  /* ---------- ยกเลิกเอกสาร ---------- */
  function openVoidModal(cert) {
    hideAlert(alertBox);

    const form = createVoidForm({
      certificate: cert,
      onConfirm: async (reason) => {
        const result = await voidCertificate(cert, reason, {
          orgId: profile.org_id,
          userId: profile.id,
        });

        if (result.error) return result;

        modal.close();
        showAlert(alertBox, `ยกเลิกเอกสารเลขที่ ${cert.doc_no} เรียบร้อยแล้ว`, "success");
        refresh();
        return result;
      },
    });

    const modal = openModal({ title: "ยกเลิกเอกสาร", content: form });
  }

  /* ---------- ส่งออก CSV ---------- */
  async function handleExport() {
    hideAlert(alertBox);
    exportButton.disabled = true;
    exportButton.textContent = "กำลังเตรียมไฟล์...";

    const result = await exportCertificatesCsv(filters);

    exportButton.disabled = false;
    exportButton.textContent = "ส่งออก CSV";

    if (result.error) {
      showAlert(alertBox, result.error, "error");
      return;
    }

    showAlert(alertBox, `ส่งออกไฟล์เรียบร้อยแล้ว รวม ${result.count} ใบ`, "success");
  }
}

function emptyFilters() {
  return {
    search: "",
    dateFrom: null,
    dateTo: null,
    formType: null,
    status: null,
    payeeId: null,
  };
}
