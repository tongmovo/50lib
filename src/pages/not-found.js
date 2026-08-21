/*
  not-found.js — หน้าที่แสดงเมื่อพิมพ์ที่อยู่เว็บผิด หรือเปิดหน้าที่ยังไม่ได้ทำ
  ต้องมีทางกลับเสมอ ไม่ปล่อยให้ผู้ใช้ติดอยู่ที่หน้าตาย
*/

export async function renderNotFoundPage(root) {
  root.innerHTML = `
    <main class="page page--center">
      <div class="card card--center">
        <h1 class="card__title">ไม่พบหน้าที่ต้องการ</h1>
        <p class="card__text">
          ที่อยู่เว็บที่เปิดอาจพิมพ์ผิด หรือเป็นหน้าที่ยังอยู่ระหว่างพัฒนา
        </p>
        <a class="btn btn--primary" href="/" data-link>กลับหน้าแรก</a>
      </div>
    </main>
  `;
}
