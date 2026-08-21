/*
  router.js — ตัวสลับหน้าจอ และ "ตัวกันหน้า" (route guard)

  ทำไมต้องมี: เว็บนี้เป็นหน้าเดียว (single page) ที่วาดเนื้อหาใหม่เมื่อเปลี่ยน path
  ตัวกันหน้าอยู่รวมที่นี่ที่เดียว หน้าจอแต่ละหน้าจึงไม่ต้องเขียนโค้ดเช็คการล็อกอินซ้ำ ๆ เอง
*/

import { getCurrentSession } from "./auth.js";

/* ตารางเส้นทางแบบตรงตัว: path -> { render, isPublic, title } */
const routes = new Map();

/*
  เส้นทางที่มีพารามิเตอร์ เช่น /doc/:id
  เก็บแยกเพราะต้องเทียบด้วยรูปแบบ ไม่ใช่เทียบข้อความตรง ๆ
*/
const patternRoutes = [];

let notFoundRoute = null;
let appRoot = null;
let isRendering = false;

/*
  ลงทะเบียนหน้า 1 หน้า
  isPublic = true หมายถึงเข้าได้โดยไม่ต้องล็อกอิน (ตอนนี้มีแค่หน้า /login)
*/
export function defineRoute(path, { render, isPublic = false, title = "" }) {
  if (!path.includes(":")) {
    routes.set(path, { render, isPublic, title });
    return;
  }

  /*
    แปลง /doc/:id เป็นรูปแบบสำหรับเทียบ แล้วจำชื่อพารามิเตอร์ไว้
    เพื่อส่งค่าที่จับได้กลับไปให้หน้าจอใช้ เช่น { id: "abc-123" }
  */
  const names = [];
  const pattern = path.replace(/:([A-Za-z_]\w*)/g, (match, name) => {
    names.push(name);
    return "([^/]+)";
  });

  patternRoutes.push({
    regex: new RegExp("^" + pattern + "$"),
    names,
    render,
    isPublic,
    title,
  });
}

/* หน้าที่จะแสดงเมื่อพิมพ์ path ที่ไม่มีอยู่จริง */
export function defineNotFound(render) {
  notFoundRoute = { render, isPublic: true, title: "ไม่พบหน้าที่ต้องการ" };
}

/* พาไปหน้าอื่นด้วยโค้ด เช่น หลังล็อกอินสำเร็จให้ไปหน้าแรก */
export function navigate(path, { replace = false } = {}) {
  if (replace) {
    window.history.replaceState({}, "", path);
  } else {
    window.history.pushState({}, "", path);
  }
  renderCurrentRoute();
}

/* เริ่มทำงาน เรียกครั้งเดียวตอนเปิดเว็บ */
export function startRouter(rootElement) {
  appRoot = rootElement;

  /* กดปุ่มย้อนกลับ/เดินหน้าของเบราว์เซอร์ ต้องวาดหน้าใหม่ให้ตรงกับ path */
  window.addEventListener("popstate", renderCurrentRoute);

  /*
    ดักการคลิกลิงก์ภายในเว็บที่ติด data-link ไว้
    เพื่อสลับหน้าโดยไม่ต้องโหลดเว็บใหม่ทั้งหน้า (เร็วกว่าและไม่กระพริบ)
  */
  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[data-link]");
    if (!link) return;
    event.preventDefault();
    navigate(link.getAttribute("href"));
  });

  renderCurrentRoute();
}

/*
  หัวใจของตัวกันหน้า
  ลำดับการตัดสินใจ:
  1) หา path ปัจจุบันว่าตรงกับหน้าไหน ถ้าไม่ตรงเลย -> หน้าไม่พบ
  2) ถ้าหน้านั้นต้องล็อกอิน แต่ยังไม่ได้ล็อกอิน -> เด้งไป /login
  3) ถ้าล็อกอินอยู่แล้วแต่ดันเปิดหน้า /login -> เด้งกลับหน้าแรก จะได้ไม่ต้องล็อกอินซ้ำ
*/
async function renderCurrentRoute() {
  if (!appRoot || isRendering) return;
  isRendering = true;

  try {
    const path = normalizePath(window.location.pathname);
    const matched = matchRoute(path);
    const route = matched?.route ?? notFoundRoute;
    const params = matched?.params ?? {};

    if (!route) {
      appRoot.innerHTML = "";
      return;
    }

    const session = await getCurrentSession();

    if (!route.isPublic && !session) {
      navigateInternal("/login", { replace: true });
      return;
    }

    if (path === "/login" && session) {
      navigateInternal("/", { replace: true });
      return;
    }

    document.title = route.title ? route.title + " — 50bis" : "50bis";

    appRoot.innerHTML = "";
    await route.render(appRoot, { params });
  } catch (err) {
    /* กันหน้าขาว: ถ้าวาดหน้าไม่สำเร็จ ต้องยังบอกผู้ใช้ว่าเกิดอะไรขึ้นและทำอะไรต่อได้ */
    console.error("[50bis] แสดงหน้าจอไม่สำเร็จ:", err.message);
    appRoot.innerHTML = `
      <div class="page-error">
        <h1 class="page-error__title">เปิดหน้านี้ไม่สำเร็จ</h1>
        <p class="page-error__text">
          กรุณากดรีเฟรชหน้าจอ (ปุ่ม F5) อีกครั้ง หากยังไม่หายกรุณาติดต่อผู้ดูแลระบบ
        </p>
      </div>
    `;
  } finally {
    isRendering = false;
  }
}

/* ใช้ภายในไฟล์นี้เท่านั้น เพราะตอนเรียกยังอยู่ในรอบการวาดหน้าเดิม ต้องปลดล็อกก่อน */
function navigateInternal(path, options) {
  isRendering = false;
  navigate(path, options);
}

/* หาเส้นทางที่ตรงกับ path ปัจจุบัน ลองแบบตรงตัวก่อน แล้วค่อยลองแบบมีพารามิเตอร์ */
function matchRoute(path) {
  const exact = routes.get(path);
  if (exact) return { route: exact, params: {} };

  for (const candidate of patternRoutes) {
    const found = path.match(candidate.regex);
    if (!found) continue;

    const params = {};
    candidate.names.forEach((name, index) => {
      params[name] = decodeURIComponent(found[index + 1]);
    });
    return { route: candidate, params };
  }

  return null;
}

/* ตัด / ท้ายสุดออก เพื่อให้ /login กับ /login/ ถือเป็นหน้าเดียวกัน */
function normalizePath(pathname) {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

/* ให้ไฟล์อื่นสั่งวาดหน้าปัจจุบันใหม่ได้ เช่น หลังออกจากระบบ */
export { renderCurrentRoute };
