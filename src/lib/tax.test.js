/*
  tax.test.js — ทดสอบการคำนวณภาษีหัก ณ ที่จ่าย และการปัดเศษแบบ half-up

  จุดที่ต้องระวังที่สุดคือการปัดเศษ เพราะวิธีที่คนมักเขียนกัน
  (Math.round(x * 100) / 100) ให้ผลผิดกับเงินบางจำนวน
  ชุดทดสอบนี้จึงเจาะจงทดสอบเลขที่วิธีนั้นทำพลาดโดยเฉพาะ
*/

import { describe, it, expect } from "vitest";
import { roundHalfUp, calculateLineTax, resolveLineTax, summarizeLines } from "./tax.js";

describe("ปัดเศษแบบ half-up ในเคสที่วิธีธรรมดาทำพลาด", () => {
  /*
    เลข 3 ตัวนี้คือกับดักจริงของการคำนวณทศนิยมในคอมพิวเตอร์
    เมื่อคูณด้วย 100 แล้วได้ค่าต่ำกว่าครึ่งนิดเดียว (เช่น 1.005 * 100 = 100.49999999999999)
    ทำให้วิธี Math.round(x * 100) / 100 ปัดลงแทนที่จะปัดขึ้น ยอดจึงขาดไป 1 สตางค์

    แต่ละบรรทัดจึงตรวจ 2 อย่างคู่กัน
      1) ฟังก์ชันของเราให้ผลถูกต้อง
      2) วิธีธรรมดาให้ผลผิดจริง (ถ้าวันหนึ่งบรรทัดนี้เริ่มไม่ผ่าน
         แปลว่าพฤติกรรมของตัวรันเปลี่ยนไป ไม่ใช่ว่าฟังก์ชันเราพัง)
  */
  it("1.005 ต้องได้ 1.01 (วิธีธรรมดาจะได้ 1.00 ซึ่งผิด)", () => {
    expect(roundHalfUp(1.005, 2)).toBe(1.01);
    expect(Math.round(1.005 * 100) / 100).toBe(1);
  });

  it("0.145 ต้องได้ 0.15 (วิธีธรรมดาจะได้ 0.14 ซึ่งผิด)", () => {
    expect(roundHalfUp(0.145, 2)).toBe(0.15);
    expect(Math.round(0.145 * 100) / 100).toBe(0.14);
  });

  it("10.075 ต้องได้ 10.08 (วิธีธรรมดาจะได้ 10.07 ซึ่งผิด)", () => {
    expect(roundHalfUp(10.075, 2)).toBe(10.08);
    expect(Math.round(10.075 * 100) / 100).toBe(10.07);
  });

  /*
    เลขกลุ่มนี้บังเอิญคูณ 100 แล้วได้ครึ่งพอดี วิธีธรรมดาจึงยังให้ผลถูก
    แต่ต้องทดสอบไว้ด้วย เพื่อยืนยันว่าฟังก์ชันของเราไม่ได้แก้เคสหนึ่งแล้วไปพังอีกเคส
  */
  it("เลขที่วิธีธรรมดายังทำถูก ฟังก์ชันของเราต้องให้ผลตรงกัน", () => {
    expect(roundHalfUp(2.675, 2)).toBe(2.68);
    expect(roundHalfUp(8.475, 2)).toBe(8.48);
    expect(roundHalfUp(1.045, 2)).toBe(1.05);
  });
});

describe("ปัดเศษแบบ half-up ต้องปัดขึ้นเสมอเมื่อเจอครึ่งพอดี", () => {
  it("ทศนิยมตำแหน่งที่ 3 เป็น 5 พอดี ต้องปัดขึ้นทุกกรณี", () => {
    expect(roundHalfUp(0.125, 2)).toBe(0.13);
    expect(roundHalfUp(0.135, 2)).toBe(0.14);   // ไม่ใช่ 0.13 แบบปัดเข้าเลขคู่
    expect(roundHalfUp(0.145, 2)).toBe(0.15);
    expect(roundHalfUp(0.155, 2)).toBe(0.16);
  });

  it("ไม่ใช่การปัดเข้าเลขคู่ (round-half-to-even)", () => {
    /* ถ้าเป็นการปัดเข้าเลขคู่ 2.5 จะได้ 2 และ 3.5 จะได้ 4 */
    expect(roundHalfUp(2.5, 0)).toBe(3);
    expect(roundHalfUp(3.5, 0)).toBe(4);
    expect(roundHalfUp(4.5, 0)).toBe(5);
  });

  it("น้อยกว่าครึ่งต้องปัดลง", () => {
    expect(roundHalfUp(1.004, 2)).toBe(1);
    expect(roundHalfUp(0.994, 2)).toBe(0.99);
  });

  it("เลขติดลบปัดออกห่างจากศูนย์", () => {
    expect(roundHalfUp(-1.005, 2)).toBe(-1.01);
    expect(roundHalfUp(-2.5, 0)).toBe(-3);
  });

  it("ค่าที่ไม่ใช่ตัวเลข คืน 0", () => {
    expect(roundHalfUp(null, 2)).toBe(0);
    expect(roundHalfUp("abc", 2)).toBe(0);
    expect(roundHalfUp(NaN, 2)).toBe(0);
  });
});

describe("คำนวณภาษีต่อบรรทัด ตามสูตร Spec ข้อ 3.2", () => {
  it("อัตราภาษีพื้นฐานที่ใช้จริง", () => {
    expect(calculateLineTax(10000, 3)).toBe(300);      // ค่าบริการ 3%
    expect(calculateLineTax(10000, 5)).toBe(500);      // ค่าเช่า 5%
    expect(calculateLineTax(10000, 1)).toBe(100);      // ค่าขนส่ง 1%
    expect(calculateLineTax(10000, 2)).toBe(200);      // ค่าโฆษณา 2%
  });

  it("จำนวนเงินที่มีเศษสตางค์", () => {
    expect(calculateLineTax(1234.56, 3)).toBe(37.04);  // 37.0368 ปัดลง
    expect(calculateLineTax(9999.99, 5)).toBe(500);    // 499.9995 ปัดขึ้นเป็น 500.00
  });

  it("เคสที่ผลลัพธ์ตกครึ่งพอดี ต้องปัดขึ้น", () => {
    /* 33.5 * 3 / 100 = 1.005 ซึ่งเป็นกับดักทศนิยมโดยตรง */
    expect(calculateLineTax(33.5, 3)).toBe(1.01);
    /* 89.5 * 3 / 100 = 2.685 */
    expect(calculateLineTax(89.5, 3)).toBe(2.69);
  });

  it("อัตราภาษีที่มีทศนิยม", () => {
    expect(calculateLineTax(10000, 1.5)).toBe(150);
    expect(calculateLineTax(1000, 0.5)).toBe(5);
  });

  it("อัตราภาษี 0 หรือจำนวนเงิน 0 ได้ภาษี 0", () => {
    expect(calculateLineTax(10000, 0)).toBe(0);
    expect(calculateLineTax(0, 5)).toBe(0);
  });

  it("รับข้อความตัวเลขจากช่องกรอกได้ รวมถึงที่มีจุลภาคคั่นหลักพัน", () => {
    expect(calculateLineTax("10000", "3")).toBe(300);
    expect(calculateLineTax("10,000", "3")).toBe(300);
  });

  it("ข้อมูลไม่ครบหรือไม่ใช่ตัวเลข คืน 0 ไม่พังทั้งหน้าจอ", () => {
    expect(calculateLineTax(null, 3)).toBe(0);
    expect(calculateLineTax(10000, null)).toBe(0);
    expect(calculateLineTax("abc", "xyz")).toBe(0);
  });
});

describe("กรณีผู้ใช้แก้ยอดภาษีเอง (Spec ข้อ 3.2)", () => {
  it("บรรทัดที่ทำเครื่องหมายว่าแก้ด้วยมือ ต้องใช้ค่าที่ผู้ใช้กรอก ไม่คำนวณทับ", () => {
    const line = { amount: 10000, rate: 3, taxAmount: 250, isManual: true };
    expect(resolveLineTax(line)).toBe(250);
  });

  it("บรรทัดปกติ ต้องคำนวณจากจำนวนเงินและอัตราตามเดิม", () => {
    const line = { amount: 10000, rate: 3, taxAmount: 250, isManual: false };
    expect(resolveLineTax(line)).toBe(300);
  });

  it("ทำเครื่องหมายว่าแก้ด้วยมือแต่ยังไม่ได้กรอกยอด ให้คำนวณให้ตามปกติ", () => {
    const line = { amount: 10000, rate: 3, taxAmount: null, isManual: true };
    expect(resolveLineTax(line)).toBe(300);
  });
});

describe("รวมยอดทั้งเอกสาร", () => {
  it("รวมจำนวนเงินและภาษีจากหลายบรรทัด", () => {
    const result = summarizeLines([
      { amount: 10000, rate: 3 },
      { amount: 5000, rate: 5 },
      { amount: 2000, rate: 1 },
    ]);

    expect(result.totalAmount).toBe(17000);
    expect(result.totalTax).toBe(570);          // 300 + 250 + 20
    expect(result.lines[0].taxAmount).toBe(300);
    expect(result.lines[1].taxAmount).toBe(250);
    expect(result.lines[2].taxAmount).toBe(20);
  });

  it("รวมยอดที่มีเศษสตางค์แล้วไม่มีเศษทศนิยมค้างจากคอมพิวเตอร์", () => {
    const result = summarizeLines([
      { amount: 0.1, rate: 100 },
      { amount: 0.2, rate: 100 },
    ]);

    /* 0.1 + 0.2 ในคอมพิวเตอร์ได้ 0.30000000000000004 ถ้าไม่ปัดจะติดเศษมา */
    expect(result.totalAmount).toBe(0.3);
    expect(result.totalTax).toBe(0.3);
  });

  it("รวมยอดโดยนับบรรทัดที่แก้ด้วยมือตามค่าที่กรอกไว้", () => {
    const result = summarizeLines([
      { amount: 10000, rate: 3 },
      { amount: 10000, rate: 3, taxAmount: 100, isManual: true },
    ]);

    expect(result.totalAmount).toBe(20000);
    expect(result.totalTax).toBe(400);          // 300 + 100 ที่แก้เอง
  });

  it("ไม่มีบรรทัดเลย ได้ยอดรวมเป็น 0 ไม่ใช่ค่าว่างหรือ error", () => {
    expect(summarizeLines([])).toMatchObject({ totalAmount: 0, totalTax: 0 });
    expect(summarizeLines(null)).toMatchObject({ totalAmount: 0, totalTax: 0 });
  });

  it("บรรทัดที่กรอกจำนวนเงินไม่ครบ ถือเป็น 0 ไม่ทำให้ยอดรวมพัง", () => {
    const result = summarizeLines([
      { amount: 10000, rate: 3 },
      { amount: "", rate: 3 },
    ]);

    expect(result.totalAmount).toBe(10000);
    expect(result.totalTax).toBe(300);
  });
});
