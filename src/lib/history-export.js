/*
  history-export.js — ส่งออกประวัติเอกสารเป็นไฟล์ CSV

  ส่งออกเฉพาะรายการที่ผ่านตัวกรองและคำค้นปัจจุบัน ไม่ใช่ทั้งระบบ
  เพื่อให้สิ่งที่ได้ในไฟล์ตรงกับสิ่งที่ผู้ใช้เห็นอยู่บนหน้าจอ

  หมายเหตุขอบเขต: ไฟล์นี้เป็นรายการสรุปแบบธรรมดาสำหรับให้ผู้ทำบัญชีเอาไปกรองต่อ
  ไม่ใช่ไฟล์รูปแบบยื่น ภ.ง.ด.3 / ภ.ง.ด.53 ตามที่กรมสรรพากรกำหนด
  (เรื่องนั้นเป็นคำถามค้างข้อ 20 ใน Project_Status.md ยังไม่ได้ตกลงขอบเขต)
*/

import { listAllForExport } from "./history.js";
import { buildCsv, downloadCsv } from "./csv.js";
import { formatThaiDate } from "./format.js";
import { FORM_TYPES } from "../components/certificate-meta.js";

const FORM_LABEL = Object.fromEntries(FORM_TYPES.map((type) => [type.value, type.label]));

const STATUS_LABEL = {
  draft: "ร่าง",
  issued: "ออกแล้ว",
  void: "ยกเลิก",
};

const HEADERS = [
  "เลขที่เอกสาร",
  "วันที่ออก",
  "ชื่อผู้ถูกหักภาษี",
  "เลขประจำตัวผู้เสียภาษีผู้ถูกหัก",
  "แบบที่ยื่น",
  "ยอดเงินที่จ่าย",
  "ยอดภาษีที่หัก",
  "สถานะ",
];

export async function exportCertificatesCsv(filters) {
  const { certificates, error } = await listAllForExport(filters);
  if (error) return { count: 0, error };

  if (certificates.length === 0) {
    return { count: 0, error: "ไม่มีรายการให้ส่งออก กรุณาปรับตัวกรองแล้วลองใหม่" };
  }

  const rows = certificates.map((cert) => [
    cert.doc_no ?? "",
    formatThaiDate(cert.issue_date),
    cert.payee_snapshot?.name ?? "",
    /*
      ใส่เครื่องหมาย = นำหน้าเลขผู้เสียภาษี เพื่อบังคับให้ Excel มองเป็นข้อความ
      ไม่งั้น Excel จะแปลงเลข 13 หลักเป็นตัวเลขวิทยาศาสตร์ เช่น 1.23457E+12
      แล้วเลขศูนย์นำหน้าจะหายไปด้วย ทำให้ข้อมูลใช้ไม่ได้
    */
    cert.payee_snapshot?.tax_id ? `="${cert.payee_snapshot.tax_id}"` : "",
    FORM_LABEL[cert.form_type] ?? cert.form_type,
    Number(cert.total_amount ?? 0).toFixed(2),
    Number(cert.total_tax ?? 0).toFixed(2),
    STATUS_LABEL[cert.status] ?? cert.status,
  ]);

  const csv = buildCsv(HEADERS, rows);
  downloadCsv(buildFilename(), csv);

  return { count: certificates.length, error: null };
}

/* ตั้งชื่อไฟล์ให้มีวันที่ เพื่อไม่ให้ไฟล์ที่ส่งออกหลายรอบทับกันในโฟลเดอร์ดาวน์โหลด */
function buildFilename() {
  const today = new Date().toLocaleDateString("sv-SE");
  return `wht-history-${today}.csv`;
}
