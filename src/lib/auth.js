/*
  auth.js — รวมทุกอย่างที่เกี่ยวกับการล็อกอินไว้ที่เดียว

  เหตุผลที่แยกไฟล์: หน้าจออื่น ๆ จะได้ไม่ต้องรู้จักรายละเอียดของ Supabase
  ถ้าวันหลังเปลี่ยนวิธีล็อกอิน ก็แก้แค่ไฟล์นี้ไฟล์เดียว
*/

import { supabase } from "../supabase.js";

/* เก็บ profile ไว้ในตัวแปรหลังดึงมาครั้งแรก จะได้ไม่ต้องถามฐานข้อมูลซ้ำทุกครั้งที่เปลี่ยนหน้า */
let cachedProfile = null;

/*
  คืนข้อมูล session ปัจจุบัน ถ้ายังไม่ได้ล็อกอินจะได้ค่า null
  ใช้เป็นตัวตัดสินว่าจะให้เข้าหน้านั้น ๆ ได้หรือต้องเด้งไปหน้าล็อกอิน
*/
export async function getCurrentSession() {
  if (!supabase) return null;

  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.error("[50bis] อ่านสถานะการล็อกอินไม่สำเร็จ:", error.message);
      return null;
    }
    return data.session ?? null;
  } catch (err) {
    console.error("[50bis] อ่านสถานะการล็อกอินไม่สำเร็จ:", err.message);
    return null;
  }
}

/*
  ดึงข้อมูลผู้ใช้จากตาราง profiles (ชื่อ-สกุล, บทบาท, สังกัดบริษัท)

  คืนค่าเป็นรูปแบบเดียวกันเสมอ: { profile, error }
  - profile = null พร้อม error ที่เป็นข้อความไทย ถ้าดึงไม่ได้
  - หน้าจอที่เรียกใช้ต้องเผื่อกรณี profile ว่างไว้ด้วย ห้ามถือว่ามีแน่นอน
*/
export async function getMyProfile({ useCache = true } = {}) {
  if (useCache && cachedProfile) {
    return { profile: cachedProfile, error: null };
  }

  const session = await getCurrentSession();
  if (!session) {
    return { profile: null, error: "ยังไม่ได้เข้าสู่ระบบ" };
  }

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, org_id, full_name, role, is_active")
      .eq("id", session.user.id)
      .maybeSingle();

    if (error) {
      console.error("[50bis] ดึงข้อมูลผู้ใช้ไม่สำเร็จ:", error.message);
      return { profile: null, error: "ดึงข้อมูลผู้ใช้ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" };
    }

    if (!data) {
      /*
        กรณีนี้เกิดได้ 2 แบบ
        1) ยังไม่ได้รัน migration 006 จึงไม่มีแถวใน profiles
        2) แถวมีอยู่ แต่ org_id ว่าง ทำให้กฎ RLS มองไม่เห็นแถวของตัวเอง
        ทั้งสองกรณีแก้ที่ฝั่งฐานข้อมูล ไม่ใช่ที่หน้าเว็บ จึงต้องบอกให้ชัด
      */
      return {
        profile: null,
        error:
          "บัญชีนี้ยังไม่ได้ผูกกับข้อมูลบริษัท กรุณาติดต่อผู้ดูแลระบบเพื่อตั้งค่าให้เรียบร้อยก่อนใช้งาน",
      };
    }

    cachedProfile = data;
    return { profile: data, error: null };
  } catch (err) {
    console.error("[50bis] ดึงข้อมูลผู้ใช้ไม่สำเร็จ:", err.message);
    return { profile: null, error: "เชื่อมต่อฐานข้อมูลไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่" };
  }
}

/*
  แปลข้อความ error ดิบจาก Supabase (ภาษาอังกฤษ) เป็นภาษาไทยที่ผู้ใช้เข้าใจ
  หลักการ: บอกว่าผิดตรงไหนและต้องทำอย่างไรต่อ ไม่ใช่แค่ "เกิดข้อผิดพลาด"
*/
function translateAuthError(message = "") {
  const text = message.toLowerCase();

  if (text.includes("invalid login credentials")) {
    return "อีเมลหรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบแล้วลองใหม่อีกครั้ง";
  }
  if (text.includes("email not confirmed")) {
    return "อีเมลนี้ยังไม่ได้ยืนยัน กรุณาติดต่อผู้ดูแลระบบเพื่อเปิดใช้งานบัญชี";
  }
  if (text.includes("too many requests") || text.includes("rate limit")) {
    return "ลองเข้าสู่ระบบถี่เกินไป กรุณารอสักครู่แล้วลองใหม่อีกครั้ง";
  }
  if (text.includes("user not found")) {
    return "ไม่พบบัญชีผู้ใช้นี้ในระบบ กรุณาติดต่อผู้ดูแลระบบ";
  }
  if (text.includes("failed to fetch") || text.includes("network")) {
    return "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่";
  }

  return "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง หากยังไม่ได้กรุณาติดต่อผู้ดูแลระบบ";
}

/*
  เข้าสู่ระบบด้วยอีเมลและรหัสผ่าน
  คืนค่า { ok: true } หรือ { ok: false, error: "ข้อความภาษาไทย" }
*/
export async function signIn(email, password) {
  if (!supabase) {
    return { ok: false, error: "ระบบยังไม่ได้ตั้งค่าการเชื่อมต่อฐานข้อมูล กรุณาติดต่อผู้ดูแลระบบ" };
  }

  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      /* ไม่แสดง error ดิบให้ผู้ใช้เห็น แต่เก็บไว้ใน console เผื่อผู้พัฒนาต้องตามหาสาเหตุ */
      console.warn("[50bis] เข้าสู่ระบบไม่สำเร็จ:", error.message);
      return { ok: false, error: translateAuthError(error.message) };
    }

    cachedProfile = null;   // ล็อกอินคนใหม่ ต้องล้างข้อมูลคนเก่าทิ้ง
    return { ok: true, error: null };
  } catch (err) {
    console.error("[50bis] เข้าสู่ระบบไม่สำเร็จ:", err.message);
    return { ok: false, error: translateAuthError(err.message) };
  }
}

/* ออกจากระบบ แล้วล้างข้อมูลที่จำไว้ทิ้งทั้งหมด */
export async function signOut() {
  cachedProfile = null;

  if (!supabase) return { ok: true, error: null };

  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("[50bis] ออกจากระบบไม่สำเร็จ:", error.message);
      return { ok: false, error: "ออกจากระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" };
    }
    return { ok: true, error: null };
  } catch (err) {
    console.error("[50bis] ออกจากระบบไม่สำเร็จ:", err.message);
    return { ok: false, error: "ออกจากระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" };
  }
}

/* ใช้ตอนสลับบัญชี เพื่อไม่ให้หน้าจอยังค้างชื่อคนเดิม */
export function clearProfileCache() {
  cachedProfile = null;
}
