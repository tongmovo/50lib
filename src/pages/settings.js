/*
  settings.js — หน้าตั้งค่าองค์กร (path: /settings)

  หน้านี้ทำหน้าที่แค่ "ประกอบร่าง" เท่านั้น
  แต่ละหัวข้อแยกไปอยู่ในไฟล์ของตัวเองใน src/components/ เพื่อให้แต่ละไฟล์สั้นและแก้ง่าย

  หัวข้อในหน้า
    1) ข้อมูลบริษัท            — ดูได้ทุกคน แก้ได้เฉพาะ admin
    2) โลโก้และลายเซ็น         — ดูได้ทุกคน อัปโหลด/ลบได้เฉพาะ admin
    3) รูปแบบเลขที่เอกสาร      — ดูได้ทุกคน แก้ได้เฉพาะ admin
    4) จัดการผู้ใช้            — เฉพาะ admin เท่านั้นถึงจะเห็นหัวข้อนี้
*/

import "../styles/settings.css";
import { createNavbar } from "../components/navbar.js";
import { createAssetUpload } from "../components/asset-upload.js";
import { createOrgForm } from "../components/org-form.js";
import { createDocNumberForm } from "../components/doc-number-form.js";
import { createUserManager } from "../components/user-manager.js";
import { getMyProfile } from "../lib/auth.js";
import { getMyOrganization, updateOrganization } from "../lib/org.js";

export async function renderSettingsPage(root) {
  root.innerHTML = `<div class="page-loading">กำลังโหลดข้อมูล...</div>`;

  const [{ profile, error: profileError }, { org, error: orgError }] = await Promise.all([
    getMyProfile(),
    getMyOrganization(),
  ]);

  root.innerHTML = "";
  root.appendChild(await createNavbar({ profile }));

  const main = document.createElement("main");
  main.className = "page";
  root.appendChild(main);

  /* สถานะผิดพลาด — บอกให้ชัดว่าเกิดอะไรและต้องทำอะไรต่อ ไม่ปล่อยเป็นหน้าว่าง */
  const blockingError = profileError || orgError;
  if (blockingError) {
    main.innerHTML = `
      <div class="card card--warning">
        <h1 class="card__title">เปิดหน้าตั้งค่าไม่ได้</h1>
        <p class="card__text">${blockingError}</p>
      </div>
    `;
    return;
  }

  const isAdmin = profile.role === "admin";

  main.appendChild(buildHeader(isAdmin));
  main.appendChild(createOrgForm(org, isAdmin));
  main.appendChild(buildAssetsSection(org, isAdmin));
  main.appendChild(createDocNumberForm(org, isAdmin));

  /*
    หัวข้อจัดการผู้ใช้จะถูกสร้างก็ต่อเมื่อเป็น admin เท่านั้น
    ผู้ใช้ทั่วไปจะไม่เห็นแม้แต่หัวข้อ และต่อให้พยายามสั่งแก้ไขข้ามหน้าจอ
    กฎความปลอดภัยของฐานข้อมูล (RLS ในไฟล์ 004) ก็จะปฏิเสธให้อีกชั้น
  */
  if (isAdmin) {
    main.appendChild(await createUserManager({ currentUserId: profile.id }));
  }
}

function buildHeader(isAdmin) {
  const section = document.createElement("section");
  section.innerHTML = `
    <h1 class="settings__title">ตั้งค่าองค์กร</h1>
    <p class="settings__subtitle">
      ข้อมูลในหน้านี้จะถูกนำไปพิมพ์ลงหนังสือรับรองการหักภาษี ณ ที่จ่ายทุกใบ
      กรุณาตรวจสอบความถูกต้องก่อนออกเอกสาร
    </p>
    ${
      isAdmin
        ? ""
        : `<div class="settings__readonly-banner">
             ต้องเป็นผู้ดูแลระบบเท่านั้นจึงจะแก้ไขได้ ขณะนี้คุณดูข้อมูลได้อย่างเดียว
           </div>`
    }
  `;
  return section;
}

function buildAssetsSection(org, isAdmin) {
  const card = document.createElement("section");
  card.className = "card";
  card.innerHTML = `
    <h2 class="card__subtitle">โลโก้และลายเซ็น</h2>
    <p class="card__text card__text--muted">
      ทั้งสองอย่างนี้ไม่บังคับ ถ้ายังไม่มีไฟล์ก็ใช้งานระบบได้ตามปกติ
      ระบบรับเฉพาะไฟล์ PNG ขนาดไม่เกิน 2 MB และแนะนำให้ใช้รูปพื้นหลังโปร่งใส
    </p>
    <div class="asset-grid" data-role="assets"></div>
  `;

  const grid = card.querySelector('[data-role="assets"]');

  grid.appendChild(
    createAssetUpload({
      orgId: org.id,
      kind: "logo",
      label: "โลโก้บริษัท",
      hint: "แสดงที่หัวเอกสาร",
      path: org.logo_url,
      canEdit: isAdmin,
      onChange: (path) => updateOrganization(org.id, { logo_url: path }),
    })
  );

  grid.appendChild(
    createAssetUpload({
      orgId: org.id,
      kind: "signature",
      label: "ลายเซ็นผู้มีอำนาจ",
      hint: "แสดงเหนือชื่อผู้ลงนามท้ายเอกสาร",
      path: org.signature_url,
      canEdit: isAdmin,
      onChange: (path) => updateOrganization(org.id, { signature_url: path }),
    })
  );

  return card;
}
