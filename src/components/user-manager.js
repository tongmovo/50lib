/*
  user-manager.js — ส่วน "จัดการผู้ใช้" ในหน้าตั้งค่า

  ชิ้นส่วนนี้จะถูกสร้างขึ้นก็ต่อเมื่อผู้ที่ล็อกอินอยู่เป็น admin เท่านั้น
  ผู้ใช้ทั่วไปจะไม่เห็นแม้แต่หัวข้อ

  นอกจากซ่อนในหน้าจอแล้ว ยังมีกฎความปลอดภัยของฐานข้อมูล (RLS) กันไว้อีกชั้น
  ถ้าผู้ใช้ทั่วไปพยายามสั่งแก้ไขโดยตรง ฐานข้อมูลจะปฏิเสธเอง
*/

import { listOrgUsers, updateUser, checkLastAdminGuard } from "../lib/users.js";
import { escapeHtml, showAlert, hideAlert } from "../lib/ui.js";

export async function createUserManager({ currentUserId }) {
  const card = document.createElement("section");
  card.className = "card";
  card.innerHTML = `
    <h2 class="card__subtitle">จัดการผู้ใช้</h2>
    <p class="card__text card__text--muted">
      รายชื่อผู้ใช้ทั้งหมดในบริษัทนี้ เปลี่ยนสิทธิ์หรือปิดการใช้งานได้ทันที
      การเปลี่ยนแปลงจะมีผลกับผู้ใช้คนนั้นในการเข้าใช้งานครั้งถัดไป
    </p>

    <div class="form-alert" data-role="alert" role="alert" hidden></div>

    <div class="user-table-wrap" data-role="table">
      <p class="page-loading">กำลังโหลดรายชื่อผู้ใช้...</p>
    </div>

    <div class="notice">
      <strong class="notice__title">วิธีเพิ่มผู้ใช้ใหม่</strong>
      <p class="notice__text">
        ระบบยังไม่มีปุ่มเพิ่มผู้ใช้ในเว็บ ให้เพิ่มผ่านหน้าเว็บ Supabase ตามขั้นตอนนี้
      </p>
      <ol class="notice__steps">
        <li>เข้าเว็บ Supabase แล้วเลือกโปรเจกต์ของระบบนี้</li>
        <li>เมนูซ้ายมือ เลือก <strong>Authentication</strong> แล้วเลือก <strong>Users</strong></li>
        <li>กดปุ่ม <strong>Add user</strong> แล้วเลือก <strong>Create new user</strong></li>
        <li>กรอกอีเมลและรหัสผ่าน แล้ว<strong>ติ๊กช่อง Auto Confirm User</strong> (ถ้าไม่ติ๊ก ผู้ใช้จะล็อกอินไม่ได้)</li>
        <li>กด <strong>Create user</strong> แล้วกลับมากดรีเฟรชหน้านี้ ชื่อใหม่จะขึ้นในตารางเอง</li>
      </ol>
      <p class="notice__text notice__text--muted">
        ผู้ใช้ใหม่ทุกคนจะเริ่มต้นเป็นผู้ใช้งานทั่วไปเสมอ ถ้าต้องการให้เป็นผู้ดูแลระบบ ให้มาเปลี่ยนบทบาทในตารางด้านบน
      </p>
    </div>
  `;

  const tableWrap = card.querySelector('[data-role="table"]');
  const alertBox = card.querySelector('[data-role="alert"]');

  await refreshTable();

  async function refreshTable() {
    const { users, error } = await listOrgUsers();

    if (error) {
      tableWrap.innerHTML = `<p class="page-loading">${escapeHtml(error)}</p>`;
      return;
    }

    if (users.length === 0) {
      /* สถานะไม่มีข้อมูล — ในทางปฏิบัติแทบไม่เกิด เพราะอย่างน้อยต้องมีตัวเองอยู่ 1 คน */
      tableWrap.innerHTML = `<p class="page-loading">ยังไม่มีผู้ใช้ในระบบ</p>`;
      return;
    }

    tableWrap.innerHTML = `
      <table class="user-table">
        <thead>
          <tr>
            <th scope="col">ชื่อผู้ใช้</th>
            <th scope="col">บทบาท</th>
            <th scope="col">สถานะการใช้งาน</th>
          </tr>
        </thead>
        <tbody>
          ${users.map(buildRow).join("")}
        </tbody>
      </table>
    `;

    bindRowEvents(users);
  }

  function buildRow(user) {
    const isSelf = user.id === currentUserId;

    return `
      <tr data-user-id="${user.id}">
        <td data-label="ชื่อผู้ใช้">
          <span class="user-table__name">${escapeHtml(user.full_name || "ยังไม่ได้ตั้งชื่อ")}</span>
          ${isSelf ? '<span class="user-table__self">บัญชีของคุณ</span>' : ""}
        </td>
        <td data-label="บทบาท">
          <select class="field__input user-table__select" data-role="role" aria-label="บทบาทของ ${escapeHtml(user.full_name || "")}">
            <option value="user" ${user.role === "user" ? "selected" : ""}>ผู้ใช้งานทั่วไป</option>
            <option value="admin" ${user.role === "admin" ? "selected" : ""}>ผู้ดูแลระบบ</option>
          </select>
        </td>
        <td data-label="สถานะการใช้งาน">
          <span class="badge ${user.is_active ? "badge--on" : "badge--off"}">
            ${user.is_active ? "เปิดใช้งาน" : "ปิดใช้งาน"}
          </span>
          <button
            type="button"
            class="btn btn--small ${user.is_active ? "btn--danger-ghost" : "btn--secondary"}"
            data-role="toggle-active"
          >
            ${user.is_active ? "ปิดการใช้งาน" : "เปิดการใช้งาน"}
          </button>
        </td>
      </tr>
    `;
  }

  function bindRowEvents(users) {
    for (const user of users) {
      const row = tableWrap.querySelector(`tr[data-user-id="${user.id}"]`);
      if (!row) continue;

      const roleSelect = row.querySelector('[data-role="role"]');
      const toggleButton = row.querySelector('[data-role="toggle-active"]');
      const displayName = user.full_name || "ผู้ใช้รายนี้";
      const isSelf = user.id === currentUserId;

      /* เปลี่ยนบทบาท */
      roleSelect.addEventListener("change", async () => {
        const nextRole = roleSelect.value;
        const roleLabel = nextRole === "admin" ? "ผู้ดูแลระบบ" : "ผู้ใช้งานทั่วไป";

        const question = isSelf
          ? `ต้องการเปลี่ยนบทบาทของบัญชีตัวคุณเองเป็น "${roleLabel}" ใช่หรือไม่\n\nถ้าลดสิทธิ์ตัวเอง คุณจะแก้ไขข้อมูลบริษัทและจัดการผู้ใช้ไม่ได้อีก`
          : `ต้องการเปลี่ยนบทบาทของ "${displayName}" เป็น "${roleLabel}" ใช่หรือไม่`;

        if (!window.confirm(question)) {
          roleSelect.value = user.role;   // ผู้ใช้กดยกเลิก ต้องคืนค่าเดิม
          return;
        }

        await applyChange(user.id, { role: nextRole }, roleSelect, () => {
          roleSelect.value = user.role;
        });
      });

      /* เปิด-ปิดการใช้งาน */
      toggleButton.addEventListener("click", async () => {
        const nextActive = !user.is_active;
        const actionLabel = nextActive ? "เปิดการใช้งาน" : "ปิดการใช้งาน";

        const question = isSelf && !nextActive
          ? `ต้องการปิดการใช้งานบัญชีตัวคุณเองใช่หรือไม่\n\nเมื่อปิดแล้ว คุณจะเข้าใช้งานระบบไม่ได้อีกจนกว่าผู้ดูแลระบบคนอื่นจะเปิดให้`
          : `ต้องการ${actionLabel}บัญชีของ "${displayName}" ใช่หรือไม่`;

        if (!window.confirm(question)) return;

        await applyChange(user.id, { is_active: nextActive }, toggleButton, null);
      });
    }
  }

  /*
    ทำการเปลี่ยนแปลงจริง โดยผ่านด่านตรวจ "ต้องเหลือผู้ดูแลระบบอย่างน้อย 1 คน" ก่อนเสมอ
    revert = ฟังก์ชันคืนค่าหน้าจอกลับเป็นเดิม กรณีทำไม่สำเร็จ
  */
  async function applyChange(userId, fields, control, revert) {
    hideAlert(alertBox);
    control.disabled = true;

    const guardMessage = await checkLastAdminGuard(userId, fields);

    if (guardMessage) {
      control.disabled = false;
      revert?.();
      showAlert(alertBox, guardMessage, "error");
      return;
    }

    const { error } = await updateUser(userId, fields);

    control.disabled = false;

    if (error) {
      revert?.();
      showAlert(alertBox, error, "error");
      return;
    }

    showAlert(alertBox, "บันทึกการเปลี่ยนแปลงเรียบร้อยแล้ว", "success");
    await refreshTable();
  }

  return card;
}
