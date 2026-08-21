/*
  supabase.js — ตัวเชื่อมต่อฐานข้อมูล Supabase ของทั้งระบบ

  ไฟล์อื่นทุกไฟล์ที่ต้องคุยกับฐานข้อมูล ให้ import ตัวแปร `supabase` จากไฟล์นี้
  ห้ามสร้าง client ซ้ำที่อื่น เพราะจะทำให้สถานะการล็อกอินไม่ตรงกัน

  ค่าที่ใช้มาจากไฟล์ .env เท่านั้น (ต้องขึ้นต้นด้วย VITE_ ถึงจะถูกส่งมาถึงฝั่งเว็บ)
  และต้องเป็น anon key (publishable key) เท่านั้น ห้ามใช้ service_role key เด็ดขาด
  เพราะโค้ดไฟล์นี้ทำงานบนเบราว์เซอร์ของผู้ใช้ ใครก็เปิดดูได้
*/

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/* บอกว่าตอนนี้ตั้งค่าครบหรือยัง เอาไว้ให้ main.js ตัดสินใจว่าจะแสดงหน้าเตือนไหม */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/* ข้อความอธิบายว่าขาดอะไร ใช้แสดงบนหน้าจอเวลาตั้งค่าไม่ครบ */
export const configErrorMessage = buildConfigErrorMessage();

function buildConfigErrorMessage() {
  const missing = [];
  if (!supabaseUrl) missing.push("VITE_SUPABASE_URL");
  if (!supabaseAnonKey) missing.push("VITE_SUPABASE_ANON_KEY");

  if (missing.length === 0) return "";

  return [
    "เชื่อมต่อฐานข้อมูลไม่ได้ เพราะยังไม่ได้ตั้งค่า: " + missing.join(" และ "),
    "วิธีแก้: คัดลอกไฟล์ .env.example เป็นไฟล์ชื่อ .env ที่โฟลเดอร์หลักของโปรเจกต์",
    "แล้วเติมค่าจากหน้า Supabase > Project Settings > API",
    "จากนั้นปิดแล้วเปิดคำสั่ง npm run dev ใหม่อีกครั้ง (แก้ .env แล้วต้องรีสตาร์ททุกครั้ง)",
  ].join("\n");
}

/* ถ้าตั้งค่าไม่ครบ ให้บอกใน console เป็นภาษาไทยตั้งแต่ตอนโหลดเว็บ จะได้รู้ทันทีว่าต้องแก้อะไร */
if (!isSupabaseConfigured) {
  console.error("[50bis] " + configErrorMessage);
}

/*
  สร้าง client เฉพาะเมื่อค่าครบ
  ถ้าไม่ครบให้เป็น null ไว้ก่อน เพราะถ้าส่งค่าว่างเข้าไป createClient จะโยน error
  แล้วเว็บจะขึ้นหน้าขาวโดยไม่บอกอะไรผู้ใช้เลย
*/
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        // จำการล็อกอินไว้ ปิดเบราว์เซอร์แล้วเปิดใหม่ไม่ต้องล็อกอินซ้ำ
        persistSession: true,
        // ต่ออายุ token ให้เองอัตโนมัติ กันหลุดกลางคันระหว่างกรอกเอกสาร
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

/*
  เรียกใช้ในฟังก์ชันที่จำเป็นต้องมีฐานข้อมูลจริง
  ถ้ายังไม่ได้ตั้งค่า จะโยน error ที่เป็นข้อความภาษาไทยอ่านรู้เรื่อง
*/
export function requireSupabase() {
  if (!supabase) {
    throw new Error(configErrorMessage);
  }
  return supabase;
}
