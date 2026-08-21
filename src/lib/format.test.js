/*
  format.test.js — ทดสอบการจัดรูปแบบจำนวนเงินและวันที่
*/

import { describe, it, expect } from "vitest";
import { formatMoney, formatThaiDate, formatThaiDateLong } from "./format.js";

describe("จัดรูปแบบจำนวนเงิน", () => {
  it("คั่นหลักพันด้วยจุลภาค และมีทศนิยม 2 ตำแหน่งเสมอ", () => {
    expect(formatMoney(1000)).toBe("1,000.00");
    expect(formatMoney(1234567.89)).toBe("1,234,567.89");
    expect(formatMoney(999)).toBe("999.00");
    expect(formatMoney(1000000)).toBe("1,000,000.00");
  });

  it("เลขน้อยกว่าหนึ่งพัน ไม่ต้องมีจุลภาค", () => {
    expect(formatMoney(0)).toBe("0.00");
    expect(formatMoney(5)).toBe("5.00");
    expect(formatMoney(99.5)).toBe("99.50");
  });

  it("ทศนิยมเกิน 2 ตำแหน่ง ปัดแบบ half-up ให้ตรงกับยอดที่บันทึกลงฐานข้อมูล", () => {
    expect(formatMoney(1234567.891)).toBe("1,234,567.89");
    expect(formatMoney(1.005)).toBe("1.01");
    expect(formatMoney(2.675)).toBe("2.68");
    expect(formatMoney(0.999)).toBe("1.00");
  });

  it("รับข้อความตัวเลขได้ รวมถึงที่มีจุลภาคคั่นอยู่แล้ว", () => {
    expect(formatMoney("1000")).toBe("1,000.00");
    expect(formatMoney("1,234.5")).toBe("1,234.50");
  });

  it("จำนวนติดลบ แสดงเครื่องหมายลบหน้าตัวเลข", () => {
    expect(formatMoney(-1234.5)).toBe("-1,234.50");
  });

  it("ค่าที่ไม่ใช่ตัวเลข แสดงเป็น 0.00 ไม่แสดงคำว่า NaN ให้ผู้ใช้เห็น", () => {
    expect(formatMoney(null)).toBe("0.00");
    expect(formatMoney(undefined)).toBe("0.00");
    expect(formatMoney("")).toBe("0.00");
    expect(formatMoney("abc")).toBe("0.00");
  });
});

describe("จัดรูปแบบวันที่แบบย่อ", () => {
  it("แปลงวันที่จากฐานข้อมูลเป็นแบบไทย พ.ศ.", () => {
    expect(formatThaiDate("2026-08-20")).toBe("20 ส.ค. 2569");
    expect(formatThaiDate("2026-01-01")).toBe("1 ม.ค. 2569");
    expect(formatThaiDate("2026-12-31")).toBe("31 ธ.ค. 2569");
  });

  it("รับค่าที่มีเวลาต่อท้ายได้ด้วย", () => {
    expect(formatThaiDate("2026-08-20T10:30:00Z")).toBe("20 ส.ค. 2569");
  });

  /*
    ข้อนี้สำคัญ: ถ้าโค้ดส่งข้อความวันที่ให้ตัวแปลงของเบราว์เซอร์จัดการเอง
    เครื่องที่ตั้งโซนเวลาก่อนหน้า UTC จะได้วันที่ย้อนไป 1 วัน
    ซึ่งบนเอกสารภาษีถือเป็นข้อผิดพลาดร้ายแรง
  */
  it("วันที่ต้นเดือนต้องไม่เพี้ยนย้อนไปเดือนก่อนหน้า ไม่ว่าเครื่องตั้งโซนเวลาใด", () => {
    expect(formatThaiDate("2026-03-01")).toBe("1 มี.ค. 2569");
    expect(formatThaiDate("2026-01-01")).toBe("1 ม.ค. 2569");
  });

  it("ค่าว่างหรือไม่ใช่วันที่ คืนข้อความว่าง", () => {
    expect(formatThaiDate(null)).toBe("");
    expect(formatThaiDate("")).toBe("");
    expect(formatThaiDate("ไม่ใช่วันที่")).toBe("");
  });
});

describe("จัดรูปแบบวันที่แบบเต็ม (ใช้ในหน้าพิมพ์เอกสาร)", () => {
  it("แสดงชื่อเดือนเต็มและปี พ.ศ.", () => {
    expect(formatThaiDateLong("2026-08-20")).toBe("20 สิงหาคม 2569");
    expect(formatThaiDateLong("2026-04-13")).toBe("13 เมษายน 2569");
    expect(formatThaiDateLong("2026-07-01")).toBe("1 กรกฎาคม 2569");
  });

  it("ค่าว่างคืนข้อความว่าง", () => {
    expect(formatThaiDateLong(null)).toBe("");
  });
});
