/*
  asset-upload.js — ช่องอัปโหลดรูป 1 ช่อง ใช้ซ้ำได้ทั้งโลโก้และลายเซ็น

  ทำเป็นชิ้นส่วนแยก เพราะโลโก้กับลายเซ็นทำงานเหมือนกันทุกอย่าง
  ต่างกันแค่ชื่อและคอลัมน์ที่เก็บ path
*/

import { uploadOrgAsset, removeOrgAsset, getAssetSignedUrl } from "../lib/org.js";

/*
  พารามิเตอร์
  - orgId    รหัสองค์กร ใช้ตั้งชื่อโฟลเดอร์เก็บไฟล์
  - kind     "logo" หรือ "signature"
  - label    ข้อความหัวข้อที่แสดงให้ผู้ใช้เห็น
  - hint     คำอธิบายใต้หัวข้อ
  - path     ที่อยู่ไฟล์ปัจจุบัน (null ถ้ายังไม่เคยอัปโหลด)
  - canEdit  ถ้าไม่ใช่ admin จะให้ดูได้อย่างเดียว
  - onChange ฟังก์ชันที่จะถูกเรียกเมื่อ path เปลี่ยน เพื่อให้หน้าจอไปบันทึกลงฐานข้อมูล
*/
export function createAssetUpload({ orgId, kind, label, hint, path, canEdit, onChange }) {
  let currentPath = path || null;

  const wrapper = document.createElement("div");
  wrapper.className = "asset";
  wrapper.innerHTML = `
    <div class="asset__head">
      <h3 class="asset__label">${label}</h3>
      <p class="asset__hint">${hint}</p>
    </div>

    <div class="asset__preview" data-role="preview">
      <span class="asset__empty">ยังไม่ได้อัปโหลด</span>
    </div>

    <p class="asset__message" data-role="message" hidden></p>

    <div class="btn-group btn-group--tight" ${canEdit ? "" : "hidden"}>
      <label class="btn btn--secondary asset__choose">
        <span data-role="choose-label">เลือกไฟล์ PNG</span>
        <input type="file" accept="image/png" data-role="file" class="asset__file" />
      </label>
      <button type="button" class="btn btn--danger-ghost" data-role="remove" hidden>ลบรูปนี้</button>
    </div>

    <p class="asset__readonly" ${canEdit ? "hidden" : ""}>
      ต้องเป็นผู้ดูแลระบบเท่านั้นจึงจะอัปโหลดหรือลบรูปได้
    </p>
  `;

  const preview = wrapper.querySelector('[data-role="preview"]');
  const message = wrapper.querySelector('[data-role="message"]');
  const fileInput = wrapper.querySelector('[data-role="file"]');
  const chooseLabel = wrapper.querySelector('[data-role="choose-label"]');
  const removeButton = wrapper.querySelector('[data-role="remove"]');

  refreshPreview();

  if (canEdit) {
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file) return;

      setBusy(true, "กำลังอัปโหลด...");
      hideMessage();

      const result = await uploadOrgAsset(orgId, kind, file);

      /* ล้างค่าในช่องเลือกไฟล์ เพื่อให้เลือกไฟล์เดิมซ้ำได้อีกครั้งถ้าต้องการ */
      fileInput.value = "";

      if (result.error) {
        setBusy(false);
        showMessage(result.error, "error");
        return;
      }

      currentPath = result.path;
      const saved = await onChange(currentPath);

      setBusy(false);

      if (saved?.error) {
        showMessage(saved.error, "error");
        return;
      }

      showMessage("อัปโหลดเรียบร้อยแล้ว", "success");
      await refreshPreview();
    });

    removeButton.addEventListener("click", async () => {
      if (!currentPath) return;

      const confirmed = window.confirm(`ต้องการลบ${label}ออกจากระบบใช่หรือไม่`);
      if (!confirmed) return;

      removeButton.disabled = true;
      hideMessage();

      const result = await removeOrgAsset(currentPath);

      if (result.error) {
        removeButton.disabled = false;
        showMessage(result.error, "error");
        return;
      }

      currentPath = null;
      const saved = await onChange(null);

      removeButton.disabled = false;

      if (saved?.error) {
        showMessage(saved.error, "error");
        return;
      }

      showMessage("ลบรูปเรียบร้อยแล้ว", "success");
      await refreshPreview();
    });
  }

  /* วาดตัวอย่างรูปใหม่ตาม path ปัจจุบัน */
  async function refreshPreview() {
    if (!currentPath) {
      preview.innerHTML = `<span class="asset__empty">ยังไม่ได้อัปโหลด</span>`;
      removeButton.hidden = true;
      return;
    }

    preview.innerHTML = `<span class="asset__empty">กำลังโหลดรูป...</span>`;

    const { url, error } = await getAssetSignedUrl(currentPath);

    if (error || !url) {
      preview.innerHTML = `<span class="asset__empty">${error || "แสดงรูปไม่ได้"}</span>`;
      removeButton.hidden = false;
      return;
    }

    const img = document.createElement("img");
    img.className = "asset__image";
    img.alt = label;
    img.src = url;
    preview.innerHTML = "";
    preview.appendChild(img);

    removeButton.hidden = false;
  }

  function setBusy(isBusy, text) {
    fileInput.disabled = isBusy;
    removeButton.disabled = isBusy;
    chooseLabel.textContent = isBusy ? text : "เลือกไฟล์ PNG";
  }

  function showMessage(text, kindOfMessage) {
    message.textContent = text;
    message.className = `asset__message asset__message--${kindOfMessage}`;
    message.hidden = false;
  }

  function hideMessage() {
    message.hidden = true;
    message.textContent = "";
  }

  return wrapper;
}
