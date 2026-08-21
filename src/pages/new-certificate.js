/*
  new-certificate.js — หน้าสร้างเอกสาร 50 ทวิ (path: /new)

  หน้านี้ทำหน้าที่ประกอบร่างและควบคุมการบันทึก
  ส่วนย่อยแต่ละส่วนแยกไปอยู่ใน src/components/
*/

import "../styles/new-certificate.css";
import { createNavbar } from "../components/navbar.js";
import { createCertificateMeta } from "../components/certificate-meta.js";
import { createPayeeAutocomplete } from "../components/payee-autocomplete.js";
import { createIncomeLines } from "../components/income-lines.js";
import { createCertificateTotals } from "../components/certificate-totals.js";
import { getMyProfile } from "../lib/auth.js";
import { getMyOrganization } from "../lib/org.js";
import { listIncomeTypes } from "../lib/payees.js";
import { summarizeLines } from "../lib/tax.js";
import { bahtText } from "../lib/bahtText.js";
import { previewNextDocNo } from "../lib/doc-no.js";
import {
  saveDraft,
  issueCertificate,
  updateDraft,
  issueExistingDraft,
} from "../lib/certificates.js";
import { resolvePageMode, MODE_TITLE, MODE_SUBTITLE } from "../lib/certificate-prefill.js";
import { buildCertificatePayload } from "../lib/certificate-payload.js";
import { showAlert, hideAlert, setFlash } from "../lib/ui.js";
import { navigate } from "../lib/router.js";

/*
  options.flash = ข้อความที่ต้องแสดงหลังวาดหน้าใหม่เสร็จ
  ใช้ตอนบันทึกสำเร็จแล้วล้างฟอร์ม เพื่อให้ผู้ใช้ยังเห็นผลการบันทึกอยู่
*/
export async function renderNewCertificatePage(root, options = {}) {
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

  const blockingError = profileError || orgError;
  if (blockingError) {
    main.innerHTML = `
      <div class="card card--warning">
        <h1 class="card__title">สร้างเอกสารไม่ได้</h1>
        <p class="card__text">${blockingError}</p>
      </div>
    `;
    return;
  }

  const incomeTypes = await listIncomeTypes();
  const today = new Date().toLocaleDateString("sv-SE");   // ได้รูปแบบ 2026-08-20 ตามเวลาเครื่อง

  const { mode, prefill, error: prefillError } = await resolvePageMode(today);

  if (prefillError) {
    main.innerHTML = `
      <div class="card card--warning">
        <h1 class="card__title">เปิดเอกสารไม่ได้</h1>
        <p class="card__text">${prefillError}</p>
        <a class="btn btn--primary" href="/history" data-link>กลับไปหน้าประวัติเอกสาร</a>
      </div>
    `;
    return;
  }

  /* ---------- หัวข้อหน้า ---------- */
  const header = document.createElement("section");
  header.innerHTML = `
    <h1 class="new-cert__title">${MODE_TITLE[mode]}</h1>
    <p class="new-cert__subtitle">${MODE_SUBTITLE[mode]}</p>
    <div class="form-alert" data-role="alert" role="alert" hidden></div>
  `;
  main.appendChild(header);
  const alertBox = header.querySelector('[data-role="alert"]');

  /* ---------- ส่วนที่ 1, 3, 4, 10 ---------- */
  const meta = createCertificateMeta({
    org,
    today,
    onIssueDateChange: refreshDocNoPreview,
    initial: prefill?.meta,
  });

  /* ---------- ส่วนที่ 2 ผู้ถูกหักภาษี ---------- */
  const payeeSection = document.createElement("section");
  payeeSection.className = "card";
  payeeSection.innerHTML = `<h2 class="card__subtitle">2. ผู้ถูกหักภาษี ณ ที่จ่าย</h2>`;

  const payeePicker = createPayeeAutocomplete({
    orgId: profile.org_id,
    userId: profile.id,
    incomeTypes,
    onSelect: applyPayeeDefaults,
    initialPayee: prefill?.payee ?? null,
  });
  payeeSection.appendChild(payeePicker.element);

  /* ---------- ส่วนที่ 5 ตารางรายการเงินได้ ---------- */
  const linesSection = document.createElement("section");
  linesSection.className = "card";
  linesSection.innerHTML = `
    <h2 class="card__subtitle">5. รายการเงินได้ที่จ่าย</h2>
    <p class="notice notice--inline">
      อัตราเป็นค่าตั้งต้น โปรดตรวจสอบกับกฎหมาย/ผู้ทำบัญชีก่อนออกเอกสาร
    </p>
  `;

  const incomeLines = createIncomeLines({
    incomeTypes,
    onChange: refreshTotals,
    initialLines: prefill?.lines ?? null,
  });
  linesSection.appendChild(incomeLines.element);

  /* ---------- ส่วนที่ 6-9 ---------- */
  const totals = createCertificateTotals({ initial: prefill?.totals });

  /* ---------- ปุ่มบันทึก ---------- */
  const actions = document.createElement("section");
  actions.className = "card new-cert__actions";
  actions.innerHTML = `
    <button class="btn btn--secondary" type="button" data-role="save-draft">${
      mode === "edit" ? "บันทึกร่าง (ทับใบเดิม)" : "บันทึกร่าง"
    }</button>
    <button class="btn btn--primary" type="button" data-role="issue">บันทึกและออกเอกสาร</button>
    <button class="btn btn--primary" type="button" data-role="issue-print">บันทึกแล้วพิมพ์</button>
    <p class="field__hint new-cert__actions-hint">
      บันทึกร่าง = เก็บไว้แก้ต่อ ยังไม่กินเลขที่เอกสาร &nbsp;|&nbsp;
      บันทึกและออกเอกสาร = ออกเลขที่จริง แก้ไม่ได้อีก
    </p>
  `;

  main.append(meta.element, payeeSection, linesSection, totals.element, actions);

  const draftButton = actions.querySelector('[data-role="save-draft"]');
  const issueButton = actions.querySelector('[data-role="issue"]');
  const printButton = actions.querySelector('[data-role="issue-print"]');

  draftButton.addEventListener("click", () => handleSave("draft"));
  issueButton.addEventListener("click", () => handleSave("issued"));
  printButton.addEventListener("click", () => handleSave("issued", { thenPrint: true }));

  await refreshDocNoPreview(today);
  refreshTotals(incomeLines.getLines());

  /* แสดงผลการบันทึกของใบก่อนหน้า หลังจากล้างฟอร์มพร้อมสำหรับใบถัดไปแล้ว */
  if (options.flash) {
    showAlert(alertBox, options.flash.text, options.flash.kind);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ---------- ตัวช่วยของหน้านี้ ---------- */

  async function refreshDocNoPreview(issueDate) {
    const docNo = await previewNextDocNo(org, issueDate);
    meta.setPreviewDocNo(docNo);
  }

  /*
    เลือกผู้ถูกหักภาษีแล้ว เติมประเภทเงินได้และอัตราที่รายนั้นใช้บ่อยให้บรรทัดแรก
    ช่วยให้ฝ่ายบัญชีกรอกเร็วขึ้น แต่ยังแก้ได้ทุกช่องตามปกติ
  */
  function applyPayeeDefaults(payee) {
    if (!payee?.default_income_type) return;

    const firstTypeSelect = incomeLines.element.querySelector("tbody tr [data-role='type']");
    if (!firstTypeSelect || firstTypeSelect.value) return;

    firstTypeSelect.value = payee.default_income_type;
    firstTypeSelect.dispatchEvent(new Event("change"));

    if (payee.default_rate != null) {
      const firstRate = incomeLines.element.querySelector("tbody tr [data-role='rate']");
      if (firstRate && !firstRate.value) {
        firstRate.value = payee.default_rate;
        firstRate.dispatchEvent(new Event("input"));
      }
    }
  }

  function refreshTotals(lines) {
    const summary = summarizeLines(lines);
    totals.setTotals({
      totalAmount: summary.totalAmount,
      totalTax: summary.totalTax,
      totalTaxText: bahtText(summary.totalTax),
    });
  }

  /* รวบรวมข้อมูลทั้งฟอร์ม พร้อมตรวจความครบถ้วนก่อนบันทึก */
  function collectPayload() {
    return buildCertificatePayload({
      profile,
      org,
      metaValues: meta.getValues(),
      totalValues: totals.getValues(),
      payee: payeePicker.getSelected(),
      lines: incomeLines.getLines(),
    });
  }

  async function handleSave(action, { thenPrint = false } = {}) {
    hideAlert(alertBox);

    const { payload, error } = collectPayload();
    if (error) {
      showAlert(alertBox, error, 'error');
      return;
    }

    if (action === 'issued') {
      const confirmed = window.confirm(
        "ต้องการบันทึกและออกเอกสารใช่หรือไม่\n\n" +
          "เมื่อออกเอกสารแล้วจะแก้ไขไม่ได้อีก และระบบจะกินเลขที่เอกสาร 1 เลข\n" +
          "ถ้ายังไม่แน่ใจ ให้กดบันทึกร่างไว้ก่อน"
      );
      if (!confirmed) return;
    }

    setBusy(true);
    const result = await runSave(action, payload);
    setBusy(false);

    if (result.error) {
      showAlert(alertBox, result.error, 'error');
      return;
    }

    const message =
      action === "draft"
        ? "บันทึกร่างเรียบร้อยแล้ว (ยังไม่ได้ออกเลขที่เอกสาร)"
        : `ออกเอกสารเรียบร้อยแล้ว เลขที่ ${result.certificate.doc_no}`;

    /* กด "บันทึกแล้วพิมพ์" ให้ไปหน้าเอกสารทันที ผู้ใช้จะได้กดพิมพ์ต่อได้เลย */
    if (thenPrint) {
      setFlash(message + " เปิดหน้าเอกสารให้แล้ว กดปุ่มพิมพ์ได้เลย");
      navigate(`/doc/${result.certificate.id}`);
      return;
    }

    /*
      แก้ใบร่างเดิมเสร็จแล้วพากลับหน้าประวัติ เพราะผู้ใช้มาจากตรงนั้น
      และจะได้เห็นผลการแก้ไขในตารางทันที
    */
    if (mode === 'edit') {
      setFlash(message);
      navigate('/history');
      return;
    }

    /*
      สร้างใบใหม่หรือคัดลอกใบใหม่ ให้อยู่หน้าเดิมแล้วล้างฟอร์ม ไม่พากลับหน้าอื่น
      เพราะงานฝ่ายบัญชีมักออกเอกสารต่อกันหลายใบรวดในคราวเดียว
      ถ้าเด้งออกไปแล้วต้องกดกลับเข้ามาใหม่ทุกใบจะเสียเวลามาก

      ล้างส่วนท้ายของที่อยู่เว็บด้วย ไม่งั้นถ้ามาจากโหมดคัดลอก
      ฟอร์มจะถูกเติมข้อมูลใบเดิมกลับมาอีกรอบแทนที่จะเป็นฟอร์มเปล่า
    */
    window.history.replaceState({}, '', '/new');
    renderNewCertificatePage(root, {
      flash: { text: message + ' — ฟอร์มถูกล้างให้พร้อมสร้างใบถัดไปแล้ว', kind: 'success' },
    });
  }

  /* เลือกคำสั่งบันทึกให้ตรงกับโหมดของหน้า */
  function runSave(action, payload) {
    if (mode === 'edit') {
      return action === 'draft'
        ? updateDraft(prefill.certificateId, payload)
        : issueExistingDraft(prefill.certificateId, payload);
    }
    return action === 'draft' ? saveDraft(payload) : issueCertificate(payload);
  }

  function setBusy(isBusy) {
    draftButton.disabled = isBusy;
    issueButton.disabled = isBusy;
    printButton.disabled = isBusy;
    issueButton.textContent = isBusy ? "กำลังบันทึก..." : "บันทึกและออกเอกสาร";
  }
}
