/*
  bahtText.js — แปลงจำนวนเงินเป็นตัวอักษรไทย ตาม Spec.md ข้อ 3.3

  ใช้เขียนลงช่อง "รวมเงินภาษีที่หักและนำส่ง (ตัวอักษร)" ในหนังสือรับรอง
  ซึ่งเป็นช่องบังคับตามแบบฟอร์มของกรมสรรพากร

  เป็นฟังก์ชันคำนวณล้วน ๆ ไม่ยุ่งกับหน้าจอและฐานข้อมูล

  กฎการอ่านที่ต้องถูกต้อง (ตามที่ระบุในสเปก)
    - หลักสิบเป็น 1 อ่านว่า "สิบ" ไม่ใช่ "หนึ่งสิบ"
    - หลักสิบเป็น 2 อ่านว่า "ยี่สิบ"
    - หลักหน่วยเป็น 1 อ่านว่า "เอ็ด" ทุกครั้งที่จำนวนนั้นมีมากกว่า 1 หลัก
      ไม่ว่าหลักที่นำหน้าจะเป็นหลักสิบ ร้อย พัน หรือหลักใดก็ตาม
      เช่น 11 = สิบเอ็ด, 101 = หนึ่งร้อยเอ็ด, 1001 = หนึ่งพันเอ็ด, 100001 = หนึ่งแสนเอ็ด
      ส่วนเลข 1 ที่อยู่โดด ๆ ยังอ่านว่า "หนึ่ง" ตามปกติ
    - รองรับหลักล้านซ้อน เช่น 1,000,000,000,000 = หนึ่งล้านล้าน
*/

import { roundHalfUp } from "./tax.js";

const DIGIT_WORDS = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];

/* ชื่อหลัก เรียงจากหลักหน่วยขึ้นไป */
const PLACE_WORDS = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

/*
  แปลงตัวเลข 1 กลุ่ม (ไม่เกิน 6 หลัก คือไม่ถึงหนึ่งล้าน) เป็นตัวอักษร
  รับเป็นข้อความตัวเลข เพื่อไม่ให้เลขศูนย์นำหน้าหายไป

  useEt บอกว่ากลุ่มนี้ต้องอ่านหลักหน่วยที่เป็น 1 ว่า "เอ็ด" หรือไม่
  ผู้เรียกเป็นคนตัดสิน เพราะต้องดูจากจำนวนเต็มทั้งก้อน ไม่ใช่ดูแค่ในกลุ่ม
  (เช่น 1,000,001 หลักหน่วยอยู่คนละกลุ่มกับหลักล้าน แต่ยังต้องอ่านว่า หนึ่งล้านเอ็ด)
*/
function convertGroup(digitsText, useEt) {
  const digits = digitsText.split("").map(Number);
  const length = digits.length;
  let text = "";

  for (let index = 0; index < length; index += 1) {
    const digit = digits[index];
    const place = length - 1 - index;   // 0 = หลักหน่วย, 1 = หลักสิบ, ...

    if (digit === 0) continue;

    if (place === 1) {
      /* หลักสิบมีวิธีอ่านพิเศษ 2 แบบ */
      if (digit === 1) text += "สิบ";
      else if (digit === 2) text += "ยี่สิบ";
      else text += DIGIT_WORDS[digit] + "สิบ";
      continue;
    }

    if (place === 0) {
      text += digit === 1 && useEt ? "เอ็ด" : DIGIT_WORDS[digit];
      continue;
    }

    text += DIGIT_WORDS[digit] + PLACE_WORDS[place];
  }

  return text;
}

/*
  แปลงจำนวนเต็มเป็นตัวอักษร รองรับหลักล้านซ้อนได้ไม่จำกัดชั้น

  วิธีคิด: ภาษาไทยแบ่งการอ่านทีละ 6 หลัก (หน่วย ถึง แสน) แล้วต่อท้ายด้วยคำว่า "ล้าน"
  จึงตัด 6 หลักท้ายออกมาอ่าน ส่วนที่เหลือข้างหน้าเอาไปอ่านซ้ำด้วยวิธีเดียวกัน
  เช่น 1,000,000,000,000 จะได้ "หนึ่งล้าน" + "ล้าน" = "หนึ่งล้านล้าน"
*/
function convertInteger(digitsText) {
  /* ตัดศูนย์นำหน้าออกก่อน เพื่อให้รู้ว่าจำนวนจริงมีกี่หลัก */
  const digits = digitsText.replace(/^0+/, "");

  if (digits === "") return "ศูนย์";

  /*
    ใช้ "เอ็ด" ก็ต่อเมื่อจำนวนนี้มีมากกว่า 1 หลัก
    เลข 1 ที่อยู่โดด ๆ ยังอ่านว่า "หนึ่ง"
  */
  const useEt = digits.length > 1;

  if (digits.length <= 6) return convertGroup(digits, useEt);

  const head = digits.slice(0, digits.length - 6);
  const tail = digits.slice(-6);

  const headText = convertInteger(head) + "ล้าน";
  /* กลุ่มท้ายอยู่ในจำนวนที่ยาวเกิน 6 หลักแน่นอน จึงใช้ "เอ็ด" ได้เสมอ */
  const tailText = /^0+$/.test(tail) ? "" : convertGroup(tail, true);

  return headText + tailText;
}

/*
  แปลงจำนวนเงินเป็นข้อความเต็ม เช่น 1234567.89 -> หนึ่งล้านสองแสนสามหมื่นสี่พันห้าร้อยหกสิบเจ็ดบาทแปดสิบเก้าสตางค์

  ถ้าค่าที่ส่งมาไม่ใช่ตัวเลข จะคืนข้อความว่าง ไม่คืน "ศูนย์บาทถ้วน"
  เพราะบนเอกสารภาษี การแสดงยอดศูนย์ทั้งที่ข้อมูลผิดพลาด อันตรายกว่าการเว้นว่างไว้
*/
export function bahtText(value) {
  if (value === null || value === undefined || value === "") return "";

  const amount = typeof value === "number" ? value : Number(String(value).trim().replace(/,/g, ""));
  if (!Number.isFinite(amount)) return "";

  const rounded = roundHalfUp(amount, 2);
  const isNegative = rounded < 0;
  const absolute = Math.abs(rounded);

  /* toFixed(2) ทำให้ได้ทศนิยม 2 ตำแหน่งเสมอ เช่น 0.5 จะได้ "0.50" = 50 สตางค์ */
  const [bahtDigits, satangDigits] = absolute.toFixed(2).split(".");

  const hasBaht = /[1-9]/.test(bahtDigits);
  const hasSatang = /[1-9]/.test(satangDigits);

  let text;

  if (!hasBaht && !hasSatang) {
    text = "ศูนย์บาทถ้วน";
  } else if (!hasBaht) {
    /* น้อยกว่า 1 บาท อ่านเฉพาะสตางค์ ไม่ต้องมีคำว่า "ศูนย์บาท" นำหน้า */
    text = convertInteger(satangDigits) + "สตางค์";
  } else if (!hasSatang) {
    text = convertInteger(bahtDigits) + "บาทถ้วน";
  } else {
    text = convertInteger(bahtDigits) + "บาท" + convertInteger(satangDigits) + "สตางค์";
  }

  return isNegative ? "ลบ" + text : text;
}
