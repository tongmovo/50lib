/*
  org.js — ทุกอย่างที่เกี่ยวกับการอ่าน/เขียนข้อมูลองค์กร และไฟล์โลโก้/ลายเซ็น

  แยกออกจากหน้าจอ เพื่อให้หน้าจอมีหน้าที่แค่ "วาดและรับคำสั่งจากผู้ใช้"
  ส่วนการคุยกับฐานข้อมูลอยู่ที่ไฟล์นี้ที่เดียว
*/

import { supabase } from "../supabase.js";

/* ชื่อที่เก็บไฟล์บน Supabase Storage (สร้างไว้ใน migration 007) */
const BUCKET = "org-assets";

/* ลิงก์ดูรูปมีอายุ 1 ชั่วโมง พอสำหรับการเปิดหน้าตั้งค่า 1 รอบ */
const SIGNED_URL_SECONDS = 3600;

/* ขนาดไฟล์สูงสุดที่ยอมรับ ต้องตรงกับที่ตั้งไว้ใน migration 007 */
const MAX_FILE_BYTES = 2 * 1024 * 1024;

/*
  ดึงข้อมูลองค์กรของผู้ใช้ที่ล็อกอินอยู่
  กฎ RLS จะกรองให้เองว่าเห็นได้เฉพาะองค์กรของตัวเอง จึงไม่ต้องส่งเงื่อนไขไปเพิ่ม
*/
export async function getMyOrganization() {
  try {
    const { data, error } = await supabase
      .from("organizations")
      .select(
        "id, name, tax_id, branch, address, logo_url, signature_url, signer_name, signer_position, doc_prefix"
      )
      .maybeSingle();

    if (error) {
      console.error("[50bis] ดึงข้อมูลบริษัทไม่สำเร็จ:", error.message);
      return { org: null, error: "ดึงข้อมูลบริษัทไม่สำเร็จ กรุณากดรีเฟรชหน้าจอแล้วลองใหม่" };
    }

    if (!data) {
      return {
        org: null,
        error:
          "ยังไม่มีข้อมูลบริษัทในระบบ กรุณาติดต่อผู้ดูแลระบบเพื่อเพิ่มข้อมูลบริษัทก่อนใช้งาน",
      };
    }

    return { org: data, error: null };
  } catch (err) {
    console.error("[50bis] ดึงข้อมูลบริษัทไม่สำเร็จ:", err.message);
    return { org: null, error: "เชื่อมต่อฐานข้อมูลไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่" };
  }
}

/*
  บันทึกข้อมูลองค์กร
  ต่อท้ายด้วย .select() เพื่อดูว่ามีแถวถูกแก้จริงกี่แถว
  เพราะถ้าผู้ใช้ไม่ใช่ admin กฎ RLS จะไม่ให้แก้ แต่จะไม่โยน error ออกมา
  จะได้แค่ "ไม่มีแถวไหนถูกแก้" ซึ่งต้องแปลงเป็นข้อความไทยให้ผู้ใช้เข้าใจ
*/
export async function updateOrganization(orgId, fields) {
  try {
    const { data, error } = await supabase
      .from("organizations")
      .update(fields)
      .eq("id", orgId)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("[50bis] บันทึกข้อมูลบริษัทไม่สำเร็จ:", error.message);

      /* ถ้าฐานข้อมูลปฏิเสธเพราะรูปแบบข้อมูลผิด ให้บอกให้ตรงจุด */
      if (error.message.includes("organizations_tax_id_format_check")) {
        return { ok: false, error: "เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลักพอดี" };
      }
      if (error.message.includes("organizations_doc_prefix_check")) {
        return {
          ok: false,
          error: "คำนำหน้าเลขที่เอกสารใช้ได้เฉพาะตัวอักษรอังกฤษพิมพ์ใหญ่ ตัวเลข และขีดกลาง ยาวไม่เกิน 10 ตัว",
        };
      }

      return { ok: false, error: "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" };
    }

    if (!data) {
      return {
        ok: false,
        error: "บันทึกไม่สำเร็จ เพราะบัญชีของคุณไม่มีสิทธิ์แก้ไขข้อมูลบริษัท (ต้องเป็นผู้ดูแลระบบ)",
      };
    }

    return { ok: true, error: null };
  } catch (err) {
    console.error("[50bis] บันทึกข้อมูลบริษัทไม่สำเร็จ:", err.message);
    return { ok: false, error: "เชื่อมต่อฐานข้อมูลไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่" };
  }
}

/* ที่อยู่ไฟล์ในระบบ แยกโฟลเดอร์ตามรหัสองค์กร เพื่อให้กฎความปลอดภัยทำงานได้ */
function buildAssetPath(orgId, kind) {
  return `${orgId}/${kind}.png`;
}

/*
  อัปโหลดไฟล์โลโก้หรือลายเซ็น
  kind รับได้ 2 ค่า: "logo" หรือ "signature"

  ตรวจไฟล์ฝั่งเว็บก่อนส่ง เพื่อบอกผู้ใช้ได้ทันทีว่าผิดตรงไหน
  ไม่ต้องรอเซิร์ฟเวอร์ปฏิเสธแล้วได้ข้อความภาษาอังกฤษกลับมา
*/
export async function uploadOrgAsset(orgId, kind, file) {
  if (!file) {
    return { path: null, error: "กรุณาเลือกไฟล์ก่อน" };
  }
  if (file.type !== "image/png") {
    return { path: null, error: "รับเฉพาะไฟล์ PNG เท่านั้น (นามสกุล .png) กรุณาเลือกไฟล์ใหม่" };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { path: null, error: "ไฟล์ใหญ่เกินไป ขนาดต้องไม่เกิน 2 MB กรุณาย่อรูปแล้วลองใหม่" };
  }

  const path = buildAssetPath(orgId, kind);

  try {
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      /* upsert = ถ้ามีไฟล์เดิมอยู่ให้เขียนทับ ผู้ใช้จะได้เปลี่ยนโลโก้ได้โดยไม่ต้องลบก่อน */
      upsert: true,
      contentType: "image/png",
    });

    if (error) {
      console.error("[50bis] อัปโหลดไฟล์ไม่สำเร็จ:", error.message);

      if (error.message.toLowerCase().includes("row-level security")) {
        return {
          path: null,
          error: "อัปโหลดไม่สำเร็จ เพราะบัญชีของคุณไม่มีสิทธิ์ (ต้องเป็นผู้ดูแลระบบ)",
        };
      }
      return { path: null, error: "อัปโหลดไฟล์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" };
    }

    return { path, error: null };
  } catch (err) {
    console.error("[50bis] อัปโหลดไฟล์ไม่สำเร็จ:", err.message);
    return { path: null, error: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่" };
  }
}

/* ลบไฟล์ออกจากที่เก็บ */
export async function removeOrgAsset(path) {
  try {
    const { error } = await supabase.storage.from(BUCKET).remove([path]);

    if (error) {
      console.error("[50bis] ลบไฟล์ไม่สำเร็จ:", error.message);
      return { ok: false, error: "ลบไฟล์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" };
    }
    return { ok: true, error: null };
  } catch (err) {
    console.error("[50bis] ลบไฟล์ไม่สำเร็จ:", err.message);
    return { ok: false, error: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่" };
  }
}

/*
  ขอลิงก์ชั่วคราวสำหรับแสดงรูป
  ที่เก็บไฟล์ตั้งเป็นแบบไม่เปิดสาธารณะ จึงเปิดรูปด้วย URL ตรง ๆ ไม่ได้
  ต้องขอลิงก์ที่มีอายุจำกัดแบบนี้ทุกครั้งที่จะแสดงรูป
*/
export async function getAssetSignedUrl(path) {
  if (!path) return { url: null, error: null };

  try {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_URL_SECONDS);

    if (error) {
      console.error("[50bis] ขอลิงก์แสดงรูปไม่สำเร็จ:", error.message);
      return { url: null, error: "แสดงตัวอย่างรูปไม่ได้ แต่ไฟล์ยังอยู่ในระบบ" };
    }

    return { url: data.signedUrl, error: null };
  } catch (err) {
    console.error("[50bis] ขอลิงก์แสดงรูปไม่สำเร็จ:", err.message);
    return { url: null, error: "แสดงตัวอย่างรูปไม่ได้ แต่ไฟล์ยังอยู่ในระบบ" };
  }
}
