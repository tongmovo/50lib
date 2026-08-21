/*
  modal.js — กล่องหน้าต่างซ้อน ใช้ซ้ำได้ทุกหน้า

  ใช้แท็ก <dialog> ของเบราว์เซอร์โดยตรง เพราะได้ของพวกนี้มาให้ฟรี
  โดยไม่ต้องเขียนเอง: กดปุ่ม Esc เพื่อปิด, กันไม่ให้กดปุ่มที่อยู่ข้างหลังกล่อง,
  และย้ายโฟกัสของแป้นพิมพ์เข้ามาในกล่องให้เอง (สำคัญกับผู้ที่ใช้แป้นพิมพ์อย่างเดียว)
*/

import { escapeHtml } from "../lib/ui.js";

/*
  เปิดกล่อง
  - title    หัวข้อของกล่อง
  - content  element ที่จะใส่ไว้ในกล่อง
  - onClose  ฟังก์ชันที่จะถูกเรียกเมื่อกล่องถูกปิด (จะกดปิดเอง หรือปิดด้วยโค้ดก็ตาม)

  คืนค่า { close } เพื่อให้ผู้เรียกสั่งปิดเองได้หลังบันทึกสำเร็จ
*/
export function openModal({ title, content, onClose }) {
  const dialog = document.createElement("dialog");
  dialog.className = "modal";
  dialog.innerHTML = `
    <div class="modal__head">
      <h2 class="modal__title">${escapeHtml(title)}</h2>
      <button type="button" class="modal__close" data-role="close" aria-label="ปิดหน้าต่าง">✕</button>
    </div>
    <div class="modal__body" data-role="body"></div>
  `;

  dialog.querySelector('[data-role="body"]').appendChild(content);
  document.body.appendChild(dialog);

  dialog.querySelector('[data-role="close"]').addEventListener("click", () => close());

  /*
    กดพื้นที่ว่างนอกกล่องเพื่อปิด
    ต้องเช็คว่าคลิกโดนตัว dialog เอง (ซึ่งคือพื้นที่มืดรอบนอก) ไม่ใช่เนื้อหาข้างใน
  */
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) close();
  });

  /* เก็บกวาดทุกครั้งที่ปิด ไม่ว่าจะปิดด้วยวิธีไหน รวมถึงกดปุ่ม Esc */
  dialog.addEventListener("close", () => {
    dialog.remove();
    onClose?.();
  });

  dialog.showModal();

  function close() {
    if (dialog.open) dialog.close();
  }

  return { close };
}
