/*
  home.js — หน้าแรกหลังเข้าสู่ระบบ (path: /)

  แสดงยอดสรุปของเดือนปัจจุบันและปุ่มลัดไปยังงานที่ใช้บ่อย
  ยอดทั้งหมดนับรวมทั้งบริษัท ไม่แยกตามผู้สร้าง (ยืนยันกับเจ้าของงานแล้ว)
*/

import "../styles/home.css";
import { createNavbar } from "../components/navbar.js";
import { getMyProfile } from "../lib/auth.js";
import { getCurrentMonthRange, getMonthlySummary, countDrafts } from "../lib/dashboard.js";
import { formatMoney } from "../lib/format.js";
import { escapeHtml } from "../lib/ui.js";

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

export async function renderHomePage(root) {
  root.innerHTML = `<div class="page-loading">กำลังโหลดข้อมูล...</div>`;

  const { profile, error: profileError } = await getMyProfile();

  root.innerHTML = "";
  root.appendChild(await createNavbar({ profile }));

  const main = document.createElement("main");
  main.className = "page";
  root.appendChild(main);

  if (profileError) {
    /* สถานะผิดพลาด — บอกให้ชัดว่าเกิดอะไรและต้องทำอะไรต่อ */
    main.innerHTML = `
      <div class="card card--warning">
        <h1 class="card__title">ยังใช้งานระบบไม่ได้</h1>
        <p class="card__text">${escapeHtml(profileError)}</p>
        <p class="card__text card__text--muted">
          หากคุณคือผู้ดูแลระบบ ให้ตรวจว่าได้เพิ่มข้อมูลบริษัทในฐานข้อมูลแล้ว
          และบัญชีนี้ถูกผูกกับบริษัทเรียบร้อย
        </p>
      </div>
    `;
    return;
  }

  const isAdmin = profile.role === "admin";
  const range = getCurrentMonthRange();
  const monthName = `${THAI_MONTHS[range.monthIndex]} ${range.buddhistYear}`;

  main.innerHTML = `
    <section class="home__head">
      <h1 class="home__title">สวัสดี ${escapeHtml(profile.full_name || "")}</h1>
      <p class="home__subtitle">สรุปงานประจำเดือน ${escapeHtml(monthName)} ของทั้งบริษัท</p>
    </section>

    <section data-role="summary">
      <div class="card"><p class="page-loading">กำลังคำนวณยอดสรุป...</p></div>
    </section>

    <section data-role="drafts"></section>

    <section class="card">
      <h2 class="card__subtitle">ทางลัด</h2>
      <div class="btn-group home__shortcuts">
        <a class="btn btn--primary" href="/new" data-link>+ สร้างเอกสารใหม่</a>
        <a class="btn btn--secondary" href="/history" data-link>ดูประวัติทั้งหมด</a>
        <a class="btn btn--secondary" href="/payees" data-link>จัดการรายชื่อ</a>
        ${isAdmin ? `<a class="btn btn--secondary" href="/settings" data-link>ตั้งค่า</a>` : ""}
      </div>
    </section>
  `;

  const summaryBox = main.querySelector('[data-role="summary"]');
  const draftBox = main.querySelector('[data-role="drafts"]');

  const [{ summary, error: summaryError }, draftResult] = await Promise.all([
    getMonthlySummary(range),
    countDrafts(),
  ]);

  renderSummary(summaryBox, summary, summaryError, monthName);
  renderDrafts(draftBox, draftResult);
}

function renderSummary(box, summary, error, monthName) {
  if (error) {
    box.innerHTML = `
      <div class="card card--warning">
        <p class="card__text">${escapeHtml(error)}</p>
      </div>
    `;
    return;
  }

  /*
    ยังไม่มีเอกสารในเดือนนี้ ให้ชวนสร้างใบแรกแทนการโชว์เลข 0 เปล่า ๆ
    เพราะเลข 0 สามช่องเรียงกันไม่ได้บอกอะไร และทำให้ผู้ใช้ใหม่ไม่รู้ว่าต้องเริ่มตรงไหน
  */
  if (summary.issuedCount === 0) {
    box.innerHTML = `
      <div class="card">
        <div class="empty-state">
          <p class="empty-state__text">เดือน ${escapeHtml(monthName)} ยังไม่มีเอกสารที่ออกเลย</p>
          <p class="empty-state__hint">เริ่มออกหนังสือรับรองการหักภาษี ณ ที่จ่ายใบแรกของเดือนได้เลย</p>
          <a class="btn btn--primary" href="/new" data-link>+ สร้างเอกสารใบแรกของเดือน</a>
        </div>
      </div>
    `;
    return;
  }

  box.innerHTML = `
    <div class="home__cards">
      <div class="home__card">
        <span class="home__card-label">เอกสารที่ออกแล้วเดือนนี้</span>
        <span class="home__card-value">${summary.issuedCount}</span>
        <span class="home__card-unit">ใบ</span>
      </div>
      <div class="home__card">
        <span class="home__card-label">รวมเงินที่จ่าย</span>
        <span class="home__card-value">${formatMoney(summary.totalAmount)}</span>
        <span class="home__card-unit">บาท</span>
      </div>
      <div class="home__card home__card--highlight">
        <span class="home__card-label">รวมภาษีที่หักและนำส่ง</span>
        <span class="home__card-value">${formatMoney(summary.totalTax)}</span>
        <span class="home__card-unit">บาท</span>
      </div>
    </div>
    <p class="home__note">
      นับเฉพาะเอกสารสถานะ "ออกแล้ว" ที่ลงวันที่ภายในเดือนนี้ ไม่รวมใบร่างและใบที่ยกเลิก
    </p>
  `;
}

function renderDrafts(box, { count, error }) {
  /* นับใบร่างไม่ได้ ไม่ควรทำให้ทั้งหน้าใช้ไม่ได้ แค่บอกให้รู้แล้วให้ใช้ส่วนอื่นต่อได้ */
  if (error) {
    box.innerHTML = `
      <div class="card card--muted">
        <p class="card__text card__text--muted">${escapeHtml(error)}</p>
      </div>
    `;
    return;
  }

  if (count === 0) {
    box.innerHTML = `
      <div class="card card--muted">
        <p class="card__text card__text--muted">ไม่มีใบร่างค้างอยู่ เยี่ยมมาก</p>
      </div>
    `;
    return;
  }

  box.innerHTML = `
    <div class="card home__drafts">
      <div>
        <strong class="home__drafts-count">มีใบร่างค้างอยู่ ${count} ใบ</strong>
        <p class="card__text card__text--muted">
          ใบร่างยังไม่ได้ออกเลขที่เอกสาร และยังไม่ถือว่าออกให้ผู้รับเงิน
        </p>
      </div>
      <a class="btn btn--secondary" href="/history?status=draft" data-link>ดูใบร่างทั้งหมด</a>
    </div>
  `;
}
