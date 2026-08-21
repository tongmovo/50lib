/*
  users.js — อ่านและแก้ไขข้อมูลผู้ใช้ในองค์กรเดียวกัน

  หมายเหตุสำคัญ: ระบบไม่สามารถแสดง "อีเมล" ของผู้ใช้ได้
  เพราะอีเมลเก็บอยู่ในตาราง auth.users ของ Supabase ซึ่งเปิดให้ฝั่งเว็บอ่านไม่ได้
  (เป็นข้อจำกัดด้านความปลอดภัยของ Supabase เอง ไม่ใช่ข้อจำกัดของโค้ดเรา)
  จึงใช้ช่อง full_name แทน ซึ่งค่าตั้งต้นคือส่วนหน้าเครื่องหมาย @ ของอีเมลอยู่แล้ว
*/

import { supabase } from "../supabase.js";

/* ดึงรายชื่อผู้ใช้ทั้งหมดในองค์กร — กฎ RLS กรองให้เองว่าเห็นเฉพาะองค์กรตัวเอง */
export async function listOrgUsers() {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, role, is_active, created_at")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[50bis] ดึงรายชื่อผู้ใช้ไม่สำเร็จ:", error.message);
      return { users: [], error: "ดึงรายชื่อผู้ใช้ไม่สำเร็จ กรุณากดรีเฟรชหน้าจอแล้วลองใหม่" };
    }

    return { users: data ?? [], error: null };
  } catch (err) {
    console.error("[50bis] ดึงรายชื่อผู้ใช้ไม่สำเร็จ:", err.message);
    return { users: [], error: "เชื่อมต่อฐานข้อมูลไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่" };
  }
}

/*
  แก้ไขบทบาทหรือสถานะการใช้งานของผู้ใช้ 1 คน

  ต่อท้ายด้วย .select() เพื่อดูว่ามีแถวถูกแก้จริงหรือไม่
  เพราะถ้าผู้สั่งไม่ใช่ admin กฎ RLS จะปฏิเสธแบบเงียบ ๆ ไม่โยน error ออกมา
*/
export async function updateUser(userId, fields) {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .update(fields)
      .eq("id", userId)
      .select("id, full_name, role, is_active")
      .maybeSingle();

    if (error) {
      console.error("[50bis] แก้ไขข้อมูลผู้ใช้ไม่สำเร็จ:", error.message);
      return { user: null, error: "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" };
    }

    if (!data) {
      return {
        user: null,
        error: "บันทึกไม่สำเร็จ เพราะบัญชีของคุณไม่มีสิทธิ์แก้ไขผู้ใช้ (ต้องเป็นผู้ดูแลระบบ)",
      };
    }

    return { user: data, error: null };
  } catch (err) {
    console.error("[50bis] แก้ไขข้อมูลผู้ใช้ไม่สำเร็จ:", err.message);
    return { user: null, error: "เชื่อมต่อฐานข้อมูลไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่" };
  }
}

/*
  ตรวจว่าการเปลี่ยนแปลงที่กำลังจะทำ จะทำให้องค์กรไม่เหลือผู้ดูแลระบบที่ใช้งานได้เลยหรือไม่

  ทำไมต้องมี: ถ้าผู้ดูแลระบบคนสุดท้ายเผลอลดสิทธิ์ตัวเองหรือปิดบัญชีตัวเอง
  จะไม่มีใครในองค์กรแก้ข้อมูลบริษัทหรือคืนสิทธิ์ให้ใครได้อีกเลย
  ต้องไปแก้ที่ฐานข้อมูลโดยตรงเท่านั้น ซึ่งเจ้าของงานทำเองไม่ได้

  คืนค่าเป็นข้อความเตือนภาษาไทย หรือ null ถ้าทำได้อย่างปลอดภัย
  อ่านรายชื่อใหม่จากฐานข้อมูลทุกครั้ง เผื่อมีผู้ดูแลอีกคนแก้ไขพร้อมกันอยู่
*/
export async function checkLastAdminGuard(targetUserId, nextFields) {
  const { users, error } = await listOrgUsers();

  if (error) {
    return "ตรวจสอบข้อมูลผู้ดูแลระบบไม่สำเร็จ จึงยังไม่บันทึกการเปลี่ยนแปลง กรุณาลองใหม่อีกครั้ง";
  }

  /* จำลองผลลัพธ์หลังการเปลี่ยนแปลง แล้วนับว่าเหลือผู้ดูแลที่ใช้งานได้กี่คน */
  const remainingActiveAdmins = users.filter((user) => {
    const role = user.id === targetUserId ? (nextFields.role ?? user.role) : user.role;
    const isActive =
      user.id === targetUserId ? (nextFields.is_active ?? user.is_active) : user.is_active;

    return role === "admin" && isActive === true;
  }).length;

  if (remainingActiveAdmins === 0) {
    return "ทำรายการนี้ไม่ได้ เพราะจะทำให้ไม่เหลือผู้ดูแลระบบที่ใช้งานได้เลยแม้แต่คนเดียว กรุณาตั้งผู้ดูแลระบบคนอื่นก่อน แล้วค่อยเปลี่ยนของคนนี้";
  }

  return null;
}
