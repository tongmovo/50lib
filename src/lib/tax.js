/*
  tax.js — คำนวณภาษีหัก ณ ที่จ่าย ตาม Spec.md ข้อ 3.2

  ไฟล์นี้เป็นฟังก์ชันคำนวณล้วน ๆ ไม่ยุ่งกับหน้าจอและไม่ยุ่งกับฐานข้อมูล
  จึงทดสอบได้ครบทุกกรณีโดยไม่ต้องเปิดเว็บ

  สูตรตามสเปก
    ภาษีต่อบรรทัด = ปัด( จำนวนเงิน * อัตรา / 100 , ทศนิยม 2 ตำแหน่ง , แบบ half-up )
    รวมเงินที่จ่าย = ผลรวมจำนวนเงินทุกบรรทัด
    รวมภาษี       = ผลรวมภาษีทุกบรรทัด
*/

/*
  ปัดเศษแบบ half-up (ครึ่งหนึ่งปัดขึ้นเสมอ)

  -------------------------------------------------------------------
  ทำไมต้องเขียนเอง ใช้ Math.round ตรง ๆ ไม่ได้
  -------------------------------------------------------------------
  วิธีที่คนมักเขียนกันคือ Math.round(x * 100) / 100 ซึ่ง "ผิดเงียบ ๆ" กับเงินบางจำนวน
  สาเหตุคือคอมพิวเตอร์เก็บทศนิยมเป็นเลขฐานสอง ทำให้เลขบางตัวเก็บได้ไม่ตรงเป๊ะ
  ตัวอย่างจริง: 1.005 * 100 ในคอมพิวเตอร์ได้ 100.49999999999999 ไม่ใช่ 100.5
  พอปัดเศษจึงได้ 1.00 แทนที่จะเป็น 1.01 ซึ่งผิดไป 1 สตางค์

  เรื่องนี้สำคัญมากกับระบบภาษี เพราะยอดที่คลาดเคลื่อนแม้สตางค์เดียว
  จะทำให้ยอดในเอกสารไม่ตรงกับที่ผู้ทำบัญชีคำนวณ

  -------------------------------------------------------------------
  วิธีแก้ที่ใช้ในไฟล์นี้
  -------------------------------------------------------------------
  แทนที่จะคูณด้วย 100 (ซึ่งทำให้เกิดความคลาดเคลื่อน)
  เราเลื่อนจุดทศนิยมผ่าน "ข้อความ" แทน โดยเขียนเป็น "1.005e2"
  แล้วให้ตัวแปลงตัวเลขอ่านค่านั้น ซึ่งได้ 100.5 ตรงเป๊ะ แล้วค่อยปัดขึ้นเป็น 101
  จากนั้นเลื่อนจุดกลับด้วยวิธีเดียวกัน ได้ 1.01 ถูกต้อง

  วิธีนี้ไม่ต้องติดตั้งไลบรารีเพิ่ม จึงไม่ขัดกับกฎในโปรเจกต์
*/
export function roundHalfUp(value, decimals = 2) {
  const num = toNumber(value);
  if (!Number.isFinite(num)) return 0;

  /* แยกเครื่องหมายออกก่อน เพื่อให้เลขติดลบปัด "ออกห่างจากศูนย์" เหมือนเลขบวก */
  const sign = num < 0 ? -1 : 1;
  const absolute = Math.abs(num);

  const shifted = shiftDecimal(absolute, decimals);
  if (shifted === null) {
    /* เลขใหญ่หรือเล็กมากจนอยู่ในรูปยกกำลัง ใช้วิธีธรรมดาแทน (ไม่เกิดกับยอดเงินปกติ) */
    const factor = 10 ** decimals;
    return (sign * Math.round(absolute * factor)) / factor;
  }

  const rounded = Math.round(shifted);
  const back = shiftDecimal(rounded, -decimals);

  return sign * (back === null ? rounded / 10 ** decimals : back);
}

/*
  เลื่อนจุดทศนิยมโดยใช้ข้อความ เพื่อเลี่ยงความคลาดเคลื่อนจากการคูณ/หาร
  คืนค่า null ถ้าตัวเลขอยู่ในรูปยกกำลัง (เช่น 1e-7) ซึ่งวิธีนี้ใช้ไม่ได้
*/
function shiftDecimal(value, places) {
  const text = String(value);
  if (text.includes("e") || text.includes("E")) return null;

  const result = Number(`${text}e${places}`);
  return Number.isFinite(result) ? result : null;
}

/* แปลงค่าที่รับมาให้เป็นตัวเลข รองรับทั้งตัวเลขและข้อความตัวเลขจากช่องกรอก */
function toNumber(value) {
  if (typeof value === "number") return value;
  if (value === null || value === undefined || value === "") return NaN;
  return Number(String(value).trim().replace(/,/g, ""));
}

/*
  คำนวณภาษีของ 1 บรรทัด
  amount = จำนวนเงินที่จ่าย, rate = อัตราภาษีเป็นเปอร์เซ็นต์
*/
export function calculateLineTax(amount, rate) {
  const amountNumber = toNumber(amount);
  const rateNumber = toNumber(rate);

  if (!Number.isFinite(amountNumber) || !Number.isFinite(rateNumber)) return 0;

  return roundHalfUp((amountNumber * rateNumber) / 100, 2);
}

/*
  หาภาษีของบรรทัดหนึ่ง โดยเคารพกรณี "ผู้ใช้แก้ยอดภาษีเอง"

  ตาม Spec ข้อ 3.2 ถ้าผู้ใช้พิมพ์ยอดภาษีเองในบรรทัดไหน
  ระบบต้องหยุดคำนวณทับบรรทัดนั้น จนกว่าจะกดปุ่มคำนวณใหม่
*/
export function resolveLineTax(line) {
  if (line?.isManual && line.taxAmount !== null && line.taxAmount !== undefined) {
    return roundHalfUp(line.taxAmount, 2);
  }
  return calculateLineTax(line?.amount, line?.rate);
}

/*
  รวมยอดทั้งเอกสาร
  คืนค่า { totalAmount, totalTax, lines } โดย lines คือรายการเดิมที่เติมยอดภาษีของแต่ละบรรทัดให้แล้ว

  ปัดเศษยอดรวมอีกครั้ง เพื่อเก็บกวาดเศษที่อาจติดมาจากการบวกทศนิยมหลายครั้ง
  (เช่น 0.1 + 0.2 ในคอมพิวเตอร์ได้ 0.30000000000000004)
*/
export function summarizeLines(lines) {
  const list = Array.isArray(lines) ? lines : [];

  const resolved = list.map((line) => ({
    ...line,
    taxAmount: resolveLineTax(line),
  }));

  const totalAmount = resolved.reduce((sum, line) => {
    const amount = toNumber(line.amount);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);

  const totalTax = resolved.reduce((sum, line) => sum + line.taxAmount, 0);

  return {
    lines: resolved,
    totalAmount: roundHalfUp(totalAmount, 2),
    totalTax: roundHalfUp(totalTax, 2),
  };
}
