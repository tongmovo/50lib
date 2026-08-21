/*
  validate.js — ฟังก์ชันตรวจความถูกต้องของข้อมูลที่ผู้ใช้กรอก

  ทุกฟังก์ชันคืนค่าเป็นข้อความ error ภาษาไทย หรือคืน null ถ้าผ่าน
  เขียนแบบนี้เพื่อให้หน้าจอเอาไปใช้ได้ตรง ๆ โดยไม่ต้องแปลงอะไรอีก
*/

/*
  เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลักพอดี
  ตรงกับ CONSTRAINT ในฐานข้อมูล (ไฟล์ 002) เพื่อไม่ให้เกิดกรณี
  "หน้าเว็บบอกว่าผ่าน แต่ฐานข้อมูลปฏิเสธ"
*/
export function validateTaxId(value, { required = true } = {}) {
  const text = String(value ?? "").trim();

  if (!text) {
    return required ? "กรุณากรอกเลขประจำตัวผู้เสียภาษี" : null;
  }

  if (/[^0-9]/.test(text)) {
    return "เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลขเท่านั้น (ห้ามมีขีด เว้นวรรค หรือตัวอักษร)";
  }

  if (text.length !== 13) {
    return `เลขประจำตัวผู้เสียภาษีต้องมี 13 หลักพอดี ตอนนี้กรอกมา ${text.length} หลัก`;
  }

  return null;
}

/* คำนำหน้าเลขที่เอกสาร ต้องตรงกับ CONSTRAINT ในไฟล์ 007 */
export function validateDocPrefix(value) {
  const text = String(value ?? "").trim();

  if (!text) {
    return "กรุณากรอกคำนำหน้าเลขที่เอกสาร เช่น WHT";
  }

  if (text.length > 10) {
    return "คำนำหน้าเลขที่เอกสารยาวเกินไป ใช้ได้ไม่เกิน 10 ตัวอักษร";
  }

  if (!/^[A-Z0-9-]+$/.test(text)) {
    return "คำนำหน้าเลขที่เอกสารใช้ได้เฉพาะตัวอักษรอังกฤษพิมพ์ใหญ่ ตัวเลข และขีดกลาง เช่น WHT";
  }

  return null;
}

/* ช่องที่บังคับกรอก ใช้ร่วมกันได้หลายที่ */
export function validateRequired(value, fieldLabel) {
  if (!String(value ?? "").trim()) {
    return `กรุณากรอก${fieldLabel}`;
  }
  return null;
}
