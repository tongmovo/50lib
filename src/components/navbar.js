/*
  navbar.js — แถบบนหัวเว็บ แสดงชื่อผู้ใช้และปุ่มออกจากระบบ
  ใช้ซ้ำได้ทุกหน้าที่ต้องล็อกอินก่อนเข้า
*/

import "../styles/navbar.css";
import { getMyProfile, signOut } from "../lib/auth.js";
import { navigate } from "../lib/router.js";

/*
  สร้างแถบหัวเว็บแล้วคืนเป็น element ให้หน้าที่เรียกเอาไปวางเอง
  รับ profile มาจากภายนอกได้ เพื่อไม่ให้ต้องถามฐานข้อมูลซ้ำถ้าหน้านั้นดึงมาแล้ว
*/
export async function createNavbar({ profile = null } = {}) {
  let currentProfile = profile;

  if (!currentProfile) {
    const result = await getMyProfile();
    currentProfile = result.profile;
  }

  const displayName = currentProfile?.full_name?.trim() || "ผู้ใช้งาน";
  const roleLabel = currentProfile?.role === "admin" ? "ผู้ดูแลระบบ" : "ผู้ใช้งาน";

  const header = document.createElement("header");
  header.className = "navbar";
  header.innerHTML = `
    <div class="navbar__inner">
      <a class="navbar__brand" href="/" data-link>
        <span class="navbar__mark">50 ทวิ</span>
        <span class="navbar__system">ระบบหนังสือรับรองการหักภาษี ณ ที่จ่าย</span>
      </a>

      <nav class="navbar__menu">
        <a class="navbar__link" href="/" data-link>หน้าแรก</a>
        <a class="navbar__link" href="/new" data-link>สร้างเอกสาร</a>
        <a class="navbar__link" href="/history" data-link>ประวัติเอกสาร</a>
        <a class="navbar__link" href="/payees" data-link>ทะเบียน</a>
        <a class="navbar__link" href="/settings" data-link>ตั้งค่า</a>
        ${
          currentProfile?.role === "admin"
            ? '<a class="navbar__link" href="/audit-log" data-link>ประวัติการใช้งาน</a>'
            : ""
        }
      </nav>

      <div class="navbar__user">
        <div class="navbar__identity">
          <span class="navbar__name">${escapeHtml(displayName)}</span>
          <span class="navbar__role">${roleLabel}</span>
        </div>
        <button class="btn btn--ghost" type="button" id="navbar-signout">
          ออกจากระบบ
        </button>
      </div>
    </div>
  `;

  const signOutButton = header.querySelector("#navbar-signout");

  signOutButton.addEventListener("click", async () => {
    signOutButton.disabled = true;
    signOutButton.textContent = "กำลังออกจากระบบ...";

    const result = await signOut();

    if (!result.ok) {
      signOutButton.disabled = false;
      signOutButton.textContent = "ออกจากระบบ";
      window.alert(result.error);
      return;
    }

    navigate("/login", { replace: true });
  });

  return header;
}

/*
  ป้องกันชื่อผู้ใช้ที่มีอักขระพิเศษ (เช่น < >) ไปทำให้หน้าเว็บเพี้ยนหรือเกิดช่องโหว่
  ข้อมูลนี้มาจากฐานข้อมูล จึงต้องแปลงให้ปลอดภัยก่อนเสมอ
*/
function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
