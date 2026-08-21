/*
  doc-view.js — หน้าดูและพิมพ์เอกสาร 50 ทวิ (path: /doc/:id)

  หน้าจอนี้แบ่งเป็น 2 ส่วน
    แถบเครื่องมือด้านบน  เห็นเฉพาะบนหน้าจอ ไม่ถูกพิมพ์ลงกระดาษ
    กระดาษเอกสาร        เห็นทั้งบนหน้าจอและตอนพิมพ์
*/

import "../styles/doc-view.css";
import "../styles/print.css";
import { createNavbar } from "../components/navbar.js";
import { createCertificateSheet } from "../components/certificate-sheet.js";
import { getMyProfile } from "../lib/auth.js";
import { loadCertificateForPrint, logPrint } from "../lib/certificate-view.js";
import { escapeHtml } from "../lib/ui.js";

/* พิมพ์ได้ 3 แบบ ค่าตั้งต้นคือทั้ง 2 ฉบับ เพราะเป็นการใช้งานปกติของฝ่ายบัญชี */
const COPY_MODES = [
  { value: "both", label: "พิมพ์ทั้ง 2 ฉบับ" },
  { value: "1", label: "พิมพ์เฉพาะฉบับที่ 1" },
  { value: "2", label: "พิมพ์เฉพาะฉบับที่ 2" },
];

export async function renderDocViewPage(root, { params } = {}) {
  root.innerHTML = `<div class="page-loading">กำลังโหลดเอกสาร...</div>`;

  const [{ profile, error: profileError }, loaded] = await Promise.all([
    getMyProfile(),
    loadCertificateForPrint(params?.id),
  ]);

  root.innerHTML = "";
  root.appendChild(await createNavbar({ profile }));

  const main = document.createElement("main");
  main.className = "doc-page";
  root.appendChild(main);

  const blockingError = profileError || loaded.error;
  if (blockingError) {
    main.innerHTML = `
      <div class="card card--warning">
        <h1 class="card__title">เปิดเอกสารไม่ได้</h1>
        <p class="card__text">${escapeHtml(blockingError)}</p>
        <a class="btn btn--primary" href="/history" data-link>กลับไปหน้าประวัติเอกสาร</a>
      </div>
    `;
    return;
  }

  const { certificate, items, signatureUrl, logoUrl } = loaded;

  main.appendChild(buildToolbar(certificate));

  /* กระดาษ 2 แผ่น วางต่อกัน แผ่นละ 1 หน้ากระดาษ A4 */
  const paper = document.createElement("div");
  paper.className = "doc-paper";
  paper.dataset.copies = "both";
  paper.appendChild(createCertificateSheet({ certificate, items, signatureUrl, logoUrl, copyNo: 1 }));
  paper.appendChild(createCertificateSheet({ certificate, items, signatureUrl, logoUrl, copyNo: 2 }));
  main.appendChild(paper);

  const copySelect = main.querySelector('[data-role="copies"]');
  const printButton = main.querySelector('[data-role="print"]');

  copySelect.addEventListener("change", () => {
    paper.dataset.copies = copySelect.value;
  });

  printButton.addEventListener("click", () => window.print());

  /*
    ดักที่สัญญาณ beforeprint ของเบราว์เซอร์ ไม่ใช่ที่ปุ่ม
    เพราะผู้ใช้กด Ctrl+P เองก็ถือว่าเป็นการพิมพ์เหมือนกัน ต้องบันทึกประวัติด้วย
    การดักที่นี่ที่เดียวจึงครอบคลุมทั้งสองทาง และไม่บันทึกซ้ำซ้อน
  */
  const onBeforePrint = () =>
    logPrint(certificate, {
      orgId: profile.org_id,
      userId: profile.id,
      copies: paper.dataset.copies,
    });

  window.addEventListener("beforeprint", onBeforePrint);

  /*
    เอาตัวดักออกเมื่อผู้ใช้ออกจากหน้านี้
    ไม่งั้นเปิดหน้าอื่นแล้วกดพิมพ์ จะยังบันทึกว่าพิมพ์เอกสารใบนี้อยู่
  */
  window.addEventListener(
    "popstate",
    () => window.removeEventListener("beforeprint", onBeforePrint),
    { once: true }
  );
}

function buildToolbar(certificate) {
  const toolbar = document.createElement("section");
  toolbar.className = "doc-toolbar";
  toolbar.innerHTML = `
    <div class="doc-toolbar__info">
      <h1 class="doc-toolbar__title">เอกสารเลขที่ ${escapeHtml(certificate.doc_no || "(ใบร่าง ยังไม่มีเลขที่)")}</h1>
      <p class="doc-toolbar__status">
        สถานะ:
        <span class="badge badge--${certificate.status}">${statusLabel(certificate.status)}</span>
      </p>
    </div>

    <div class="btn-group doc-toolbar__controls">
      <label class="field doc-toolbar__field">
        <span class="field__label">จำนวนฉบับที่จะพิมพ์</span>
        <select class="field__input" data-role="copies">
          ${COPY_MODES.map((mode) => `<option value="${mode.value}">${mode.label}</option>`).join("")}
        </select>
      </label>
      <button class="btn btn--primary" type="button" data-role="print">บันทึก PDF / พิมพ์</button>
      <a class="btn btn--secondary" href="/history" data-link>กลับหน้าประวัติ</a>
    </div>

    <div class="notice doc-toolbar__guide">
      <strong class="notice__title">อ่านก่อนกดพิมพ์ (สำคัญ)</strong>
      <ol class="notice__steps">
        <li>กดปุ่ม <strong>บันทึก PDF / พิมพ์</strong> ด้านบน หรือกด <strong>Ctrl+P</strong> บนแป้นพิมพ์</li>
        <li>ในกล่องพิมพ์ ช่อง <strong>ปลายทาง (Destination)</strong> ถ้าต้องการไฟล์ PDF ให้เลือก
          <strong>บันทึกเป็น PDF (Save as PDF)</strong> ถ้าจะพิมพ์ลงกระดาษให้เลือกชื่อเครื่องพิมพ์</li>
        <li>กด <strong>ตัวเลือกเพิ่มเติม (More settings)</strong> แล้ว
          <strong>เอาเครื่องหมายถูกออกจากช่อง หัวกระดาษและท้ายกระดาษ (Headers and footers)</strong>
          มิฉะนั้นจะมีวันที่และที่อยู่เว็บติดไปบนเอกสารด้วย</li>
        <li>ตรวจว่า <strong>ขนาดกระดาษเป็น A4</strong> และ <strong>มาตราส่วน (Scale) เป็น 100% หรือ Default</strong></li>
        <li>ดูตัวอย่างทางขวาให้ครบทุกหน้าก่อนกดพิมพ์จริงเสมอ</li>
      </ol>
    </div>
  `;

  return toolbar;
}

function statusLabel(status) {
  if (status === "issued") return "ออกแล้ว";
  if (status === "void") return "ยกเลิก";
  return "ร่าง";
}
