/*
  main.js — จุดเริ่มต้นของเว็บ
  หน้าที่: ตรวจว่าตั้งค่าเชื่อมต่อฐานข้อมูลครบไหม แล้วลงทะเบียนหน้าจอทั้งหมดกับตัวสลับหน้า
*/

import "./styles/app.css";

import { isSupabaseConfigured, configErrorMessage } from "./supabase.js";
import { defineRoute, defineNotFound, startRouter } from "./lib/router.js";
import { renderLoginPage } from "./pages/login.js";
import { renderHomePage } from "./pages/home.js";
import { renderSettingsPage } from "./pages/settings.js";
import { renderPayeesPage } from "./pages/payees.js";
import { renderNewCertificatePage } from "./pages/new-certificate.js";
import { renderHistoryPage } from "./pages/history.js";
import { renderDocViewPage } from "./pages/doc-view.js";
import { renderAuditLogPage } from "./pages/audit-log.js";
import { renderNotFoundPage } from "./pages/not-found.js";

const root = document.querySelector("#app");

/*
  ถ้ายังตั้งค่า .env ไม่ครบ ให้หยุดตรงนี้แล้วบอกวิธีแก้เป็นภาษาไทย
  ดีกว่าปล่อยให้เว็บพังเป็นหน้าขาวโดยไม่บอกอะไรเลย
*/
if (!isSupabaseConfigured) {
  root.innerHTML = `
    <main class="page page--center">
      <div class="card card--warning card--center">
        <h1 class="card__title">ยังเชื่อมต่อฐานข้อมูลไม่ได้</h1>
        <pre class="card__pre">${escapeHtml(configErrorMessage)}</pre>
      </div>
    </main>
  `;
} else {
  /* ลงทะเบียนหน้าจอทั้งหมด — หน้าไหนไม่ใส่ isPublic ถือว่าต้องล็อกอินก่อนเข้าเสมอ */
  defineRoute("/login", {
    render: renderLoginPage,
    isPublic: true,
    title: "เข้าสู่ระบบ",
  });

  defineRoute("/", {
    render: renderHomePage,
    title: "หน้าแรก",
  });

  defineRoute("/new", {
    render: renderNewCertificatePage,
    title: "สร้างเอกสาร 50 ทวิ",
  });

  defineRoute("/history", {
    render: renderHistoryPage,
    title: "ประวัติเอกสาร",
  });

  defineRoute("/doc/:id", {
    render: renderDocViewPage,
    title: "ดูและพิมพ์เอกสาร",
  });

  defineRoute("/payees", {
    render: renderPayeesPage,
    title: "ทะเบียนผู้ถูกหักภาษี",
  });

  defineRoute("/audit-log", {
    render: renderAuditLogPage,
    title: "ประวัติการใช้งาน",
  });

  defineRoute("/settings", {
    render: renderSettingsPage,
    title: "ตั้งค่าองค์กร",
  });

  defineNotFound(renderNotFoundPage);

  startRouter(root);
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
