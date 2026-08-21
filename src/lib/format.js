/*
  format.js — จัดรูปแบบตัวเลขและวันที่ให้อ่านง่ายแบบไทย

  เป็นฟังก์ชันล้วน ๆ ไม่ยุ่งกับหน้าจอและฐานข้อมูล
*/

import { roundHalfUp } from "./tax.js";

const THAI_MONTHS_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

const THAI_MONTHS_FULL = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

/*
  จัดรูปแบบจำนวนเงิน คั่นหลักพันด้วยจุลภาค และมีทศนิยม 2 ตำแหน่งเสมอ
  เช่น 1234567.891 -> "1,234,567.89" และ 1000 -> "1,000.00"

  ปัดเศษด้วยวิธี half-up เดียวกับที่ใช้คำนวณภาษี
  เพื่อให้ยอดที่ "เห็นบนจอ" ตรงกับยอดที่ "บันทึกลงฐานข้อมูล" เสมอ
  ถ้าใช้วิธีปัดคนละแบบ จะเกิดกรณีหน้าจอแสดง 1.01 แต่ในฐานข้อมูลเก็บ 1.00
*/
export function formatMoney(value) {
  const amount = toNumber(value);
  if (!Number.isFinite(amount)) return "0.00";

  const rounded = roundHalfUp(amount, 2);
  const isNegative = rounded < 0;

  const [wholePart, decimalPart] = Math.abs(rounded).toFixed(2).split(".");
  const withSeparators = wholePart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return `${isNegative ? "-" : ""}${withSeparators}.${decimalPart}`;
}

/*
  จัดรูปแบบวันที่เป็นแบบไทยย่อ เช่น "20 ส.ค. 2569"
  รับค่าที่ฐานข้อมูลส่งมาในรูปแบบ 2026-08-20
*/
export function formatThaiDate(value) {
  const parts = parseDateParts(value);
  if (!parts) return "";

  return `${parts.day} ${THAI_MONTHS_SHORT[parts.monthIndex]} ${parts.buddhistYear}`;
}

/*
  จัดรูปแบบวันที่แบบเต็ม เช่น "20 สิงหาคม 2569"
  ใช้ในหน้าพิมพ์เอกสาร เพราะเอกสารราชการนิยมเขียนชื่อเดือนเต็ม
*/
export function formatThaiDateLong(value) {
  const parts = parseDateParts(value);
  if (!parts) return "";

  return `${parts.day} ${THAI_MONTHS_FULL[parts.monthIndex]} ${parts.buddhistYear}`;
}

/*
  แยกวัน เดือน ปี ออกจากค่าที่รับมา

  สำคัญ: ถ้าค่าเป็นข้อความวันที่ล้วน (2026-08-20) จะอ่านตัวเลขจากข้อความตรง ๆ
  ไม่ส่งให้ตัวแปลงวันที่ของเบราว์เซอร์จัดการ

  เหตุผล: ตัวแปลงของเบราว์เซอร์จะถือว่าข้อความแบบนั้นเป็นเวลามาตรฐานโลก (UTC)
  แล้วแปลงกลับเป็นเวลาท้องถิ่นของเครื่อง ทำให้เครื่องที่ตั้งโซนเวลาก่อนหน้า UTC
  แสดงวันที่ย้อนไป 1 วัน ซึ่งบนเอกสารภาษีถือเป็นข้อผิดพลาดร้ายแรง
*/
function parseDateParts(value) {
  if (!value) return null;

  if (typeof value === "string") {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);

      if (month < 1 || month > 12 || day < 1 || day > 31) return null;

      return { day, monthIndex: month - 1, buddhistYear: year + 543 };
    }
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return {
    day: date.getDate(),
    monthIndex: date.getMonth(),
    buddhistYear: date.getFullYear() + 543,
  };
}

function toNumber(value) {
  if (typeof value === "number") return value;
  if (value === null || value === undefined || value === "") return NaN;
  return Number(String(value).trim().replace(/,/g, ""));
}
