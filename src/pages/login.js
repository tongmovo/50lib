/*
  login.js — หน้าเข้าสู่ระบบ (path: /login)

  ระบบนี้ไม่มีปุ่ม "สมัครสมาชิก" โดยตั้งใจ
  เพราะตามสเปก ผู้ดูแลระบบเป็นคนเพิ่มบัญชีผู้ใช้ให้เท่านั้น
*/

import "../styles/login.css";
import { signIn } from "../lib/auth.js";
import { navigate } from "../lib/router.js";

export async function renderLoginPage(root) {
  root.innerHTML = `
    <main class="login">
      <form class="login__card" id="login-form" novalidate>
        <div class="login__brand">50 ทวิ</div>
        <h1 class="login__title">เข้าสู่ระบบ</h1>
        <p class="login__subtitle">ระบบออกหนังสือรับรองการหักภาษี ณ ที่จ่าย</p>

        <div class="login__alert" id="login-alert" role="alert" hidden></div>

        <div class="field">
          <label class="field__label" for="login-email">อีเมล</label>
          <input
            class="field__input"
            id="login-email"
            name="email"
            type="email"
            autocomplete="username"
            inputmode="email"
            placeholder="you@example.com"
            required
          />
        </div>

        <div class="field">
          <label class="field__label" for="login-password">รหัสผ่าน</label>
          <input
            class="field__input"
            id="login-password"
            name="password"
            type="password"
            autocomplete="current-password"
            placeholder="กรอกรหัสผ่าน"
            required
          />
        </div>

        <button class="btn btn--primary btn--block" type="submit" id="login-submit">
          เข้าสู่ระบบ
        </button>

        <p class="login__hint">
          ยังไม่มีบัญชีผู้ใช้? กรุณาติดต่อผู้ดูแลระบบเพื่อขอเปิดบัญชี
        </p>
      </form>
    </main>
  `;

  const form = root.querySelector("#login-form");
  const emailInput = root.querySelector("#login-email");
  const passwordInput = root.querySelector("#login-password");
  const submitButton = root.querySelector("#login-submit");
  const alertBox = root.querySelector("#login-alert");

  emailInput.focus();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    /* ตรวจข้อมูลฝั่งเว็บก่อน จะได้ไม่ต้องรอเซิร์ฟเวอร์ตอบกลับโดยไม่จำเป็น */
    if (!email) {
      showAlert(alertBox, "กรุณากรอกอีเมล");
      emailInput.focus();
      return;
    }
    if (!email.includes("@")) {
      showAlert(alertBox, "รูปแบบอีเมลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง (ต้องมีเครื่องหมาย @)");
      emailInput.focus();
      return;
    }
    if (!password) {
      showAlert(alertBox, "กรุณากรอกรหัสผ่าน");
      passwordInput.focus();
      return;
    }

    hideAlert(alertBox);
    setLoading(submitButton, true);

    const result = await signIn(email, password);

    setLoading(submitButton, false);

    if (!result.ok) {
      showAlert(alertBox, result.error);
      passwordInput.value = "";
      passwordInput.focus();
      return;
    }

    navigate("/", { replace: true });
  });
}

function showAlert(box, message) {
  box.textContent = message;
  box.hidden = false;
}

function hideAlert(box) {
  box.textContent = "";
  box.hidden = true;
}

/* ระหว่างรอเซิร์ฟเวอร์ตอบ ต้องกันไม่ให้กดปุ่มซ้ำ และบอกผู้ใช้ว่ากำลังทำงานอยู่ */
function setLoading(button, isLoading) {
  button.disabled = isLoading;
  button.textContent = isLoading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ";
}
