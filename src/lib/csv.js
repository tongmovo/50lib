/*
  csv.js — สร้างและดาวน์โหลดไฟล์ CSV

  เป็นฟังก์ชันทั่วไป ไม่ผูกกับหน้าจอไหนเป็นพิเศษ
*/

/*
  แปลงค่า 1 ช่องให้ปลอดภัยตามรูปแบบ CSV

  ครอบด้วยเครื่องหมายคำพูดเสมอ เพราะข้อมูลไทยมักมีจุลภาคปนอยู่ในที่อยู่
  ถ้าไม่ครอบ Excel จะตัดคอลัมน์ผิดตำแหน่ง
  ส่วนเครื่องหมายคำพูดที่อยู่ในข้อมูลเอง ต้องพิมพ์ซ้ำ 2 ตัวตามมาตรฐาน CSV
*/
function escapeCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

/* ประกอบหัวตารางและข้อมูลทุกแถวเป็นข้อความ CSV */
export function buildCsv(headers, rows) {
  const lines = [headers.map(escapeCell).join(",")];

  for (const row of rows) {
    lines.push(row.map(escapeCell).join(","));
  }

  /* ใช้ \r\n เพราะ Excel บนวินโดวส์อ่านรูปแบบนี้ได้แน่นอนที่สุด */
  return lines.join("\r\n");
}

/*
  สั่งให้เบราว์เซอร์ดาวน์โหลดไฟล์ CSV

  จุดสำคัญคือ BOM (อักขระพิเศษ 3 ไบต์ที่ใส่ไว้หน้าสุดของไฟล์)

  ถ้าไม่ใส่ BOM เวลาเปิดไฟล์ด้วย Excel บนวินโดวส์
  Excel จะเดาว่าไฟล์ไม่ได้เป็นภาษาไทย แล้วอ่านตัวอักษรไทยออกมาเป็นตัวขยะทั้งไฟล์
  การใส่ BOM คือการบอก Excel ตรง ๆ ว่า "ไฟล์นี้เป็น UTF-8 นะ" ปัญหาจึงหมดไป
*/
export function downloadCsv(filename, csvText) {
  const BOM = "﻿";
  const blob = new Blob([BOM + csvText], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();

  /* เก็บกวาดทันที ไม่งั้นหน่วยความจำจะค้างสะสมเมื่อส่งออกหลายครั้ง */
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
