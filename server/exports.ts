import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import {
  Document as DocxDocument,
  Packer,
  Paragraph,
  Table as DocxTable,
  TableRow as DocxTableRow,
  TableCell as DocxTableCell,
  TextRun,
  WidthType,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
} from 'docx';
import fs from 'fs';
import path from 'path';
import { resolveSafeAssetPath } from './auth.ts';

const BRAND_NAVY = '0B2545';
const BRAND_BLUE = '1E40AF';
const BRAND_AMBER = 'F59E0B';
const BORDER_GRAY = 'CBD5E1';

const FONT_LATIN = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const FONT_LATIN_BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
const FONT_HI = '/usr/share/fonts/truetype/noto/NotoSansDevanagari-Regular.ttf';
const FONT_HI_BOLD = '/usr/share/fonts/truetype/noto/NotoSansDevanagari-Bold.ttf';

function hasDevanagari(text: string): boolean {
  return /[\u0900-\u097F]/.test(text);
}

function registerPdfFonts(doc: PDFKit.PDFDocument): void {
  if (fs.existsSync(FONT_LATIN)) doc.registerFont('Latin', FONT_LATIN);
  if (fs.existsSync(FONT_LATIN_BOLD)) doc.registerFont('LatinBold', FONT_LATIN_BOLD);
  if (fs.existsSync(FONT_HI)) doc.registerFont('Hindi', FONT_HI);
  if (fs.existsSync(FONT_HI_BOLD)) doc.registerFont('HindiBold', FONT_HI_BOLD);
}

function pickFont(text: string, bold = false): string {
  if (hasDevanagari(text)) {
    if (bold && fs.existsSync(FONT_HI_BOLD)) return 'HindiBold';
    if (fs.existsSync(FONT_HI)) return 'Hindi';
  }
  if (bold && fs.existsSync(FONT_LATIN_BOLD)) return 'LatinBold';
  if (fs.existsSync(FONT_LATIN)) return 'Latin';
  return bold ? 'Helvetica-Bold' : 'Helvetica';
}

function writePdfLine(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y?: number,
  options: PDFKit.Mixins.TextOptions & { bold?: boolean; size?: number; color?: string } = {}
): void {
  const safeText = (text ?? '').toString();
  const fontName = pickFont(safeText, Boolean(options.bold));
  doc.font(fontName);
  if (options.size) doc.fontSize(options.size);
  if (options.color) doc.fillColor(options.color);
  if (typeof y === 'number') {
    doc.text(safeText, x, y, options);
  } else {
    doc.text(safeText, options);
  }
}

function drawPdfHeaderBanner(doc: PDFKit.PDFDocument, subtitle: string, docCode: string): void {
  const pageWidth = doc.page.width;
  doc.rect(0, 0, pageWidth, 72).fill('#0B2545');
  doc.rect(0, 72, pageWidth, 4).fill('#F59E0B');

  // Vector shield logo mark
  doc.save();
  doc.roundedRect(36, 16, 40, 40, 6).fill('#F59E0B');
  doc.font(fs.existsSync(FONT_LATIN_BOLD) ? 'LatinBold' : 'Helvetica-Bold')
    .fontSize(15)
    .fillColor('#0B2545')
    .text('SH', 44, 27);
  doc.restore();

  writePdfLine(doc, 'SURAJ HSE — INDUSTRIAL SAFETY MANAGEMENT SYSTEM', 88, 18, {
    bold: true,
    size: 13,
    color: '#FFFFFF',
  });
  writePdfLine(doc, 'Safety First – Every Task, Every Person, Every Day.', 88, 36, {
    size: 9,
    color: '#FDE68A',
  });
  writePdfLine(doc, subtitle, 88, 50, {
    size: 9,
    color: '#CBD5E1',
  });

  writePdfLine(doc, docCode, pageWidth - 200, 26, {
    bold: true,
    size: 10,
    color: '#F59E0B',
    width: 164,
    align: 'right',
  });
  writePdfLine(doc, `Generated: ${new Date().toISOString().slice(0, 10)}`, pageWidth - 200, 42, {
    size: 8,
    color: '#E2E8F0',
    width: 164,
    align: 'right',
  });

  doc.y = 92;
}

function addEmbeddedImageToSheet(
  workbook: ExcelJS.Workbook,
  worksheet: ExcelJS.Worksheet,
  photoPath: string,
  colIndexZeroBased: number,
  rowIndexZeroBased: number
): boolean {
  const resolved = resolveSafeAssetPath(photoPath);
  if (!resolved || !fs.existsSync(resolved)) return false;

  const extLower = path.extname(resolved).toLowerCase();
  let extension: 'jpeg' | 'png' = 'jpeg';
  if (extLower === '.png') extension = 'png';
  else if (extLower !== '.jpg' && extLower !== '.jpeg') return false;

  try {
    const imageId = workbook.addImage({
      filename: resolved,
      extension,
    });
    worksheet.addImage(imageId, {
      tl: { col: colIndexZeroBased + 0.08, row: rowIndexZeroBased + 0.08 },
      ext: { width: 96, height: 64 },
      editAs: 'oneCell',
    });
    return true;
  } catch {
    return false;
  }
}

function styleWorkbookTitleBanner(
  worksheet: ExcelJS.Worksheet,
  title: string,
  subtitle: string,
  columnCount: number
): void {
  const lastCol = worksheet.getColumn(columnCount).letter;

  worksheet.mergeCells(`A1:${lastCol}1`);
  const r1 = worksheet.getCell('A1');
  r1.value = `SURAJ HSE — ${title}`;
  r1.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  r1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND_NAVY}` } };
  r1.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  worksheet.getRow(1).height = 28;

  worksheet.mergeCells(`A2:${lastCol}2`);
  const r2 = worksheet.getCell('A2');
  r2.value = `Safety First – Every Task, Every Person, Every Day.  |  ${subtitle}  |  Exported: ${new Date().toLocaleString('en-IN')}`;
  r2.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF1E293B' } };
  r2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND_AMBER}` } };
  r2.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  worksheet.getRow(2).height = 20;

  worksheet.getRow(3).height = 8;
}

function styleHeaderRow(row: ExcelJS.Row): void {
  row.height = 26;
  row.eachCell((cell) => {
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND_BLUE}` } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: `FF${BORDER_GRAY}` } },
      bottom: { style: 'medium', color: { argb: `FF${BRAND_NAVY}` } },
      left: { style: 'thin', color: { argb: `FF${BORDER_GRAY}` } },
      right: { style: 'thin', color: { argb: `FF${BORDER_GRAY}` } },
    };
  });
}

function applyDataRowStyle(row: ExcelJS.Row, height = 22): void {
  row.height = height;
  row.eachCell((cell) => {
    cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF0F172A' } };
    cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: `FF${BORDER_GRAY}` } },
      bottom: { style: 'thin', color: { argb: `FF${BORDER_GRAY}` } },
      left: { style: 'thin', color: { argb: `FF${BORDER_GRAY}` } },
      right: { style: 'thin', color: { argb: `FF${BORDER_GRAY}` } },
    };
  });
}

export async function buildExcelExport(
  reportType: string,
  data: {
    observations?: Record<string, unknown>[];
    inspections?: Record<string, unknown>[];
    incidents?: Record<string, unknown>[];
    trainings?: Record<string, unknown>[];
    audits?: Record<string, unknown>[];
    filterSummary?: string;
  }
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SURAJ HSE Industrial Safety Management System';
  workbook.created = new Date();

  const populateObservationsSheet = (sheetName: string, rows: Record<string, unknown>[]) => {
    const ws = workbook.addWorksheet(sheetName);
    const headers = [
      'Observation ID',
      'Date & Time',
      'Location',
      'Agency / Contractor',
      'Job Executor',
      'Work Activity',
      'Category',
      'Type',
      'Title',
      'Observation Details (EN)',
      'Hindi Explanation (हिंदी विवरण)',
      'Hazard',
      'Potential Consequence',
      'Risk Level',
      'Corrective Action',
      'Preventive Action',
      'Responsible Person',
      'Target Date',
      'Status',
      'Closing Date',
      'Closure Remarks',
      'Site In-charge',
      'Site Supervisor',
      'Photo Evidence',
    ];
    const widths = [16, 18, 24, 22, 18, 24, 18, 16, 30, 36, 36, 26, 26, 16, 32, 28, 20, 14, 12, 14, 24, 18, 18, 18];

    widths.forEach((w, idx) => {
      ws.getColumn(idx + 1).width = w;
    });

    styleWorkbookTitleBanner(
      ws,
      'SAFETY OBSERVATION REGISTER',
      data.filterSummary || 'All Active & Closed Records',
      headers.length
    );

    const headerRow = ws.getRow(4);
    headers.forEach((h, i) => {
      headerRow.getCell(i + 1).value = h;
    });
    styleHeaderRow(headerRow);

    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 4 }];
    ws.autoFilter = {
      from: { row: 4, column: 1 },
      to: { row: Math.max(4, 4 + rows.length), column: headers.length },
    };

    rows.forEach((o, idx) => {
      const rowNum = 5 + idx;
      const row = ws.getRow(rowNum);
      const values = [
        o.obs_code,
        String(o.observed_at || '').replace('T', ' ').slice(0, 16),
        o.location,
        o.agency_name,
        o.job_executor,
        o.work_activity,
        o.category,
        o.observation_type,
        o.title,
        o.details,
        o.details_hi,
        o.hazard,
        o.potential_consequence,
        o.risk_level,
        o.corrective_action,
        o.preventive_action,
        o.responsible_person,
        o.target_date,
        o.status,
        o.closing_date || '-',
        o.closure_remarks || '-',
        o.site_incharge_name || '-',
        o.site_supervisor_name || '-',
        o.photo_path ? '' : 'No Photo',
      ];
      values.forEach((v, cIdx) => {
        row.getCell(cIdx + 1).value = v as ExcelJS.CellValue;
      });

      const hasPhoto = Boolean(o.photo_path) && addEmbeddedImageToSheet(workbook, ws, String(o.photo_path), headers.length - 1, rowNum - 1);
      if (!hasPhoto && o.photo_path) {
        row.getCell(headers.length).value = String(o.photo_path);
      }
      applyDataRowStyle(row, hasPhoto ? 56 : 36);
    });
  };

  const populateInspectionsSheet = (sheetName: string, rows: Record<string, unknown>[]) => {
    const ws = workbook.addWorksheet(sheetName);
    const headers = [
      'Inspection ID',
      'Module / Equipment Type',
      'Equipment / Asset ID',
      'Location',
      'Inspector Name',
      'Inspection Date',
      'Overall Status',
      'Risk Level',
      'Checklist Summary',
      'Corrective Action',
      'Responsible Person',
      'Target Date',
      'Remarks',
      'Photo Evidence',
    ];
    const widths = [16, 22, 22, 24, 18, 14, 16, 14, 42, 30, 20, 14, 28, 18];
    widths.forEach((w, i) => {
      ws.getColumn(i + 1).width = w;
    });

    styleWorkbookTitleBanner(
      ws,
      'EQUIPMENT & SITE INSPECTION REGISTER',
      data.filterSummary || 'All Inspection Modules',
      headers.length
    );
    const headerRow = ws.getRow(4);
    headers.forEach((h, i) => (headerRow.getCell(i + 1).value = h));
    styleHeaderRow(headerRow);
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 4 }];
    ws.autoFilter = {
      from: { row: 4, column: 1 },
      to: { row: Math.max(4, 4 + rows.length), column: headers.length },
    };

    rows.forEach((insp, idx) => {
      const rowNum = 5 + idx;
      const row = ws.getRow(rowNum);
      let checklistText = '';
      try {
        const items = JSON.parse(String(insp.checklist_json || '[]')) as Array<{ item: string; status: string; notes?: string }>;
        checklistText = items.map((it) => `[${it.status}] ${it.item}${it.notes ? ` (${it.notes})` : ''}`).join('\n');
      } catch {
        checklistText = String(insp.checklist_json || '');
      }

      const values = [
        insp.insp_code,
        insp.module_type,
        insp.equipment_id,
        insp.location,
        insp.inspector_name,
        insp.inspection_date,
        insp.overall_status,
        insp.risk_level,
        checklistText,
        insp.corrective_action,
        insp.responsible_person,
        insp.target_date,
        insp.remarks,
        insp.photo_path ? '' : 'No Photo',
      ];
      values.forEach((v, cIdx) => (row.getCell(cIdx + 1).value = v as ExcelJS.CellValue));
      const hasPhoto = Boolean(insp.photo_path) && addEmbeddedImageToSheet(workbook, ws, String(insp.photo_path), headers.length - 1, rowNum - 1);
      applyDataRowStyle(row, hasPhoto ? 64 : 44);
    });
  };

  const populateGenericSheet = (
    sheetName: string,
    title: string,
    headers: string[],
    widths: number[],
    rows: unknown[][]
  ) => {
    const ws = workbook.addWorksheet(sheetName);
    widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
    styleWorkbookTitleBanner(ws, title, data.filterSummary || 'Database Export', headers.length);
    const headerRow = ws.getRow(4);
    headers.forEach((h, i) => (headerRow.getCell(i + 1).value = h));
    styleHeaderRow(headerRow);
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 4 }];
    ws.autoFilter = {
      from: { row: 4, column: 1 },
      to: { row: Math.max(4, 4 + rows.length), column: headers.length },
    };
    rows.forEach((vals, idx) => {
      const row = ws.getRow(5 + idx);
      vals.forEach((v, cIdx) => (row.getCell(cIdx + 1).value = v as ExcelJS.CellValue));
      applyDataRowStyle(row, 30);
    });
  };

  const obs = data.observations ?? [];
  const insps = data.inspections ?? [];
  const incs = data.incidents ?? [];
  const trns = data.trainings ?? [];
  const auds = data.audits ?? [];

  if (reportType === 'observations') {
    populateObservationsSheet('Observation Register', obs);
    const openCount = obs.filter((r) => r.status === 'Open').length;
    const overdueCount = obs.filter((r) => r.status === 'Overdue').length;
    const closedCount = obs.filter((r) => r.status === 'Closed').length;
    populateGenericSheet(
      'Executive Summary',
      'OBSERVATION KPI SUMMARY',
      ['Metric', 'Count'],
      [34, 18],
      [
        ['Total Observations Exported', obs.length],
        ['Open Observations', openCount],
        ['Overdue Observations', overdueCount],
        ['Closed Observations', closedCount],
      ]
    );
  } else if (reportType === 'inspections') {
    populateInspectionsSheet('Equipment Inspections', insps);
  } else if (reportType === 'corrective-actions') {
    const capaRows = [
      ...obs.map((o) => [
        o.obs_code,
        'Safety Observation',
        o.location,
        o.risk_level,
        o.corrective_action,
        o.preventive_action,
        o.responsible_person,
        o.target_date,
        o.status,
        o.closing_date || '-',
      ]),
      ...insps
        .filter((i) => i.overall_status !== 'Pass')
        .map((i) => [
          i.insp_code,
          `Inspection: ${i.module_type}`,
          i.location,
          i.risk_level,
          i.corrective_action,
          i.remarks,
          i.responsible_person,
          i.target_date,
          i.overall_status,
          '-',
        ]),
    ];
    populateGenericSheet(
      'Corrective Actions',
      'CORRECTIVE & PREVENTIVE ACTION (CAPA) REGISTER',
      ['Source ID', 'Source Module', 'Location', 'Risk Level', 'Corrective Action', 'Preventive / Remarks', 'Responsible Person', 'Target Date', 'Status', 'Closed Date'],
      [16, 22, 24, 14, 36, 30, 22, 14, 16, 14],
      capaRows
    );
  } else if (reportType === 'trainings') {
    populateGenericSheet(
      'Training Register',
      'HSE TRAINING REGISTER',
      ['Training ID', 'Date', 'Topic', 'Trainer', 'Location', 'Department', 'Attendees', 'Hours', 'Status', 'Remarks'],
      [16, 14, 36, 20, 22, 22, 12, 10, 14, 30],
      trns.map((t) => [t.trn_code, t.training_date, t.topic, t.trainer_name, t.location, t.department, t.attendees_count, t.duration_hours, t.status, t.remarks])
    );
  } else if (reportType === 'incidents') {
    populateGenericSheet(
      'Incident Register',
      'INCIDENT & NEAR-MISS REGISTER',
      ['Incident ID', 'Date', 'Location', 'Agency', 'Type', 'Severity', 'Description', 'Root Cause', 'Corrective Action', 'Responsible', 'Target Date', 'Status'],
      [16, 14, 22, 20, 16, 12, 34, 30, 32, 20, 14, 16],
      incs.map((i) => [i.inc_code, i.incident_date, i.location, i.agency_name, i.incident_type, i.severity, i.description, i.root_cause, i.corrective_action, i.responsible_person, i.target_date, i.status])
    );
  } else if (reportType === 'audits') {
    populateGenericSheet(
      'Audit Register',
      'SAFETY AUDIT REGISTER',
      ['Audit ID', 'Date', 'Audit Type', 'Location', 'Lead Auditor', 'Score (%)', 'Findings', 'Open NCs', 'Status', 'Summary'],
      [16, 14, 26, 22, 20, 12, 12, 12, 14, 38],
      auds.map((a) => [a.aud_code, a.audit_date, a.audit_type, a.location, a.lead_auditor, a.score_percent, a.findings_count, a.open_nc_count, a.status, a.summary])
    );
  } else {
    // monthly-hse comprehensive workbook
    populateGenericSheet(
      'Monthly HSE Summary',
      'MONTHLY HSE MANAGEMENT REPORT',
      ['HSE Performance Indicator', 'Value'],
      [40, 20],
      [
        ['Total Safety Observations', obs.length],
        ['Open Observations', obs.filter((o) => o.status === 'Open').length],
        ['Overdue Observations', obs.filter((o) => o.status === 'Overdue').length],
        ['Closed Observations', obs.filter((o) => o.status === 'Closed').length],
        ['Total Equipment & Site Inspections', insps.length],
        ['Total Incidents & Near Misses', incs.length],
        ['Total Safety Trainings Conducted', trns.length],
        ['Total Personnel Trained', trns.reduce((acc, t) => acc + Number(t.attendees_count || 0), 0)],
        ['Total Safety Audits', auds.length],
      ]
    );
    populateObservationsSheet('Observations', obs);
    populateInspectionsSheet('Inspections', insps);
    populateGenericSheet(
      'Incidents',
      'INCIDENT & NEAR-MISS LOG',
      ['Incident ID', 'Date', 'Location', 'Type', 'Severity', 'Description', 'Root Cause', 'Corrective Action', 'Status'],
      [16, 14, 22, 16, 12, 34, 30, 32, 16],
      incs.map((i) => [i.inc_code, i.incident_date, i.location, i.incident_type, i.severity, i.description, i.root_cause, i.corrective_action, i.status])
    );
    populateGenericSheet(
      'Trainings',
      'TRAINING LOG',
      ['Training ID', 'Date', 'Topic', 'Trainer', 'Attendees', 'Hours', 'Status'],
      [16, 14, 36, 20, 12, 10, 14],
      trns.map((t) => [t.trn_code, t.training_date, t.topic, t.trainer_name, t.attendees_count, t.duration_hours, t.status])
    );
    populateGenericSheet(
      'Audits',
      'AUDIT LOG',
      ['Audit ID', 'Date', 'Audit Type', 'Location', 'Lead Auditor', 'Score (%)', 'Open NCs', 'Status'],
      [16, 14, 26, 22, 20, 12, 12, 14],
      auds.map((a) => [a.aud_code, a.audit_date, a.audit_type, a.location, a.lead_auditor, a.score_percent, a.open_nc_count, a.status])
    );
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function buildObservationPdf(obs: Record<string, unknown>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 36, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    registerPdfFonts(doc);
    drawPdfHeaderBanner(doc, 'Safety Observation & CAPA Report', String(obs.obs_code || 'OBS-REPORT'));

    const left = 36;
    const width = doc.page.width - 72;

    writePdfLine(doc, String(obs.title || 'Safety Observation'), left, doc.y, {
      bold: true,
      size: 14,
      color: '#0B2545',
      width,
    });
    doc.moveDown(0.5);

    const metaPairs: Array<[string, string]> = [
      ['Date & Time', String(obs.observed_at || '').replace('T', ' ').slice(0, 16)],
      ['Location', String(obs.location || '')],
      ['Agency / Contractor', String(obs.agency_name || '')],
      ['Job Executor', String(obs.job_executor || '')],
      ['Work Activity', String(obs.work_activity || '')],
      ['Category / Type', `${obs.category || ''} (${obs.observation_type || ''})`],
      ['Risk Level', String(obs.risk_level || '')],
      ['Status', String(obs.status || '')],
      ['Responsible Person', String(obs.responsible_person || '')],
      ['Target Date', String(obs.target_date || '')],
    ];

    const startY = doc.y;
    const colW = width / 2;
    metaPairs.forEach(([k, v], i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = left + col * colW;
      const y = startY + row * 28;
      doc.rect(x, y, colW - 4, 24).fillAndStroke('#F8FAFC', '#E2E8F0');
      writePdfLine(doc, `${k}:`, x + 6, y + 4, { bold: true, size: 7.5, color: '#475569' });
      writePdfLine(doc, v, x + 6, y + 13, { size: 8.5, color: '#0F172A', width: colW - 14 });
    });

    doc.y = startY + Math.ceil(metaPairs.length / 2) * 28 + 10;

    // Photo Evidence
    const resolvedPhoto = obs.photo_path ? resolveSafeAssetPath(String(obs.photo_path)) : null;
    if (resolvedPhoto && fs.existsSync(resolvedPhoto)) {
      try {
        writePdfLine(doc, 'Photo Evidence:', left, doc.y, { bold: true, size: 10, color: '#0B2545' });
        doc.moveDown(0.3);
        doc.image(resolvedPhoto, left, doc.y, { fit: [width, 190] });
        doc.y += 198;
      } catch {
        // Ignore non-embeddable photo format
      }
    }

    const sections: Array<[string, string]> = [
      ['Observation Details (English)', String(obs.details || '')],
      ['Hindi Explanation (हिंदी विवरण)', String(obs.details_hi || '')],
      ['Hazard Identified', String(obs.hazard || '')],
      ['Potential Consequence', String(obs.potential_consequence || '')],
      ['Corrective Action', String(obs.corrective_action || '')],
      ['Preventive Action', String(obs.preventive_action || '')],
      ['Precautions & PPE', String(obs.precaution || '')],
      ['Site Verification Required', String(obs.site_verification || '')],
      ['Closure Remarks', String(obs.closure_remarks || 'Pending closure')],
    ];

    for (const [heading, body] of sections) {
      if (!body) continue;
      if (doc.y > doc.page.height - 100) doc.addPage();
      writePdfLine(doc, heading, left, doc.y, { bold: true, size: 10, color: '#1E40AF' });
      doc.moveDown(0.2);
      writePdfLine(doc, body, left, doc.y, { size: 9.5, color: '#1E293B', width });
      doc.moveDown(0.6);
    }

    if (doc.y > doc.page.height - 90) doc.addPage();
    const sigY = doc.y + 8;
    doc.rect(left, sigY, width / 2 - 8, 52).stroke('#CBD5E1');
    writePdfLine(doc, `Site Supervisor: ${obs.site_supervisor_name || '________________'}`, left + 8, sigY + 8, { bold: true, size: 8.5, color: '#334155' });
    writePdfLine(doc, `Signature: ${obs.site_supervisor_signature || '________________'}`, left + 8, sigY + 28, { size: 8.5, color: '#0F172A' });

    doc.rect(left + width / 2 + 8, sigY, width / 2 - 8, 52).stroke('#CBD5E1');
    writePdfLine(doc, `Site In-Charge: ${obs.site_incharge_name || '________________'}`, left + width / 2 + 16, sigY + 8, { bold: true, size: 8.5, color: '#334155' });
    writePdfLine(doc, `Signature: ${obs.site_incharge_signature || '________________'}`, left + width / 2 + 16, sigY + 28, { size: 8.5, color: '#0F172A' });

    doc.end();
  });
}

export async function buildInspectionPdf(insp: Record<string, unknown>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 36, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    registerPdfFonts(doc);
    drawPdfHeaderBanner(doc, `Equipment & Site Inspection: ${insp.module_type}`, String(insp.insp_code || 'INSP'));

    const left = 36;
    const width = doc.page.width - 72;

    writePdfLine(doc, `${insp.module_type} — ${insp.equipment_id}`, left, doc.y, { bold: true, size: 13, color: '#0B2545', width });
    doc.moveDown(0.4);
    writePdfLine(
      doc,
      `Location: ${insp.location}   |   Inspector: ${insp.inspector_name}   |   Date: ${insp.inspection_date}   |   Status: ${insp.overall_status} (${insp.risk_level})`,
      left,
      doc.y,
      { size: 9, color: '#334155', width }
    );
    doc.moveDown(0.8);

    const resolvedPhoto = insp.photo_path ? resolveSafeAssetPath(String(insp.photo_path)) : null;
    if (resolvedPhoto && fs.existsSync(resolvedPhoto)) {
      try {
        doc.image(resolvedPhoto, left, doc.y, { fit: [width, 160] });
        doc.y += 168;
      } catch {
        // skip
      }
    }

    writePdfLine(doc, 'Inspection Checklist Results', left, doc.y, { bold: true, size: 11, color: '#1E40AF' });
    doc.moveDown(0.4);

    let items: Array<{ item: string; status: string; notes?: string }> = [];
    try {
      items = JSON.parse(String(insp.checklist_json || '[]'));
    } catch {
      items = [];
    }

    items.forEach((it, idx) => {
      if (doc.y > doc.page.height - 80) doc.addPage();
      const y = doc.y;
      doc.rect(left, y, width, 26).fillAndStroke(idx % 2 === 0 ? '#F8FAFC' : '#FFFFFF', '#E2E8F0');
      writePdfLine(doc, `${idx + 1}. ${it.item}`, left + 8, y + 5, { size: 8.5, color: '#0F172A', width: width - 140 });
      writePdfLine(doc, it.status, left + width - 125, y + 5, {
        bold: true,
        size: 8.5,
        color: it.status === 'Compliant' ? '#15803D' : it.status === 'Non-Compliant' ? '#DC2626' : '#475569',
        width: 115,
        align: 'right',
      });
      if (it.notes) {
        writePdfLine(doc, `Remarks: ${it.notes}`, left + 16, y + 16, { size: 7.5, color: '#475569', width: width - 24 });
      }
      doc.y = y + 28;
    });

    doc.moveDown(0.8);
    writePdfLine(doc, `Corrective Action: ${insp.corrective_action || 'None'}`, left, doc.y, { size: 9.5, color: '#0F172A', width });
    doc.moveDown(0.3);
    writePdfLine(doc, `Responsible Person: ${insp.responsible_person || '-'}   |   Target Date: ${insp.target_date || '-'}`, left, doc.y, { size: 9, color: '#334155', width });
    doc.moveDown(0.3);
    writePdfLine(doc, `General Remarks: ${insp.remarks || '-'}`, left, doc.y, { size: 9, color: '#334155', width });

    doc.end();
  });
}

export async function buildSafetyDocumentPdf(docRecord: Record<string, unknown>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 36, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    registerPdfFonts(doc);
    drawPdfHeaderBanner(doc, `${docRecord.doc_type} (${docRecord.language})`, String(docRecord.doc_code || 'DOC'));

    const left = 36;
    const width = doc.page.width - 72;

    writePdfLine(doc, String(docRecord.title || ''), left, doc.y, { bold: true, size: 14, color: '#0B2545', width });
    doc.moveDown(0.4);
    writePdfLine(
      doc,
      `Location: ${docRecord.location}   |   Department: ${docRecord.department}   |   Prepared By: ${docRecord.prepared_by}`,
      left,
      doc.y,
      { size: 9, color: '#475569', width }
    );
    doc.moveDown(0.8);

    const content = JSON.parse(String(docRecord.content_json || '{}')) as {
      summary?: string;
      summaryHi?: string;
      ppeRequired?: string[];
      hazardsAndControls?: Array<{ step: string; hazard: string; risk: string; control: string; responsibility: string }>;
      verificationChecklist?: string[];
      emergencyNotes?: string;
    };

    if (content.summary) {
      writePdfLine(doc, 'Scope & Summary', left, doc.y, { bold: true, size: 11, color: '#1E40AF' });
      doc.moveDown(0.2);
      writePdfLine(doc, content.summary, left, doc.y, { size: 9.5, color: '#0F172A', width });
      doc.moveDown(0.5);
    }

    if (content.summaryHi) {
      writePdfLine(doc, 'हिंदी सारांश (Hindi Summary)', left, doc.y, { bold: true, size: 11, color: '#1E40AF' });
      doc.moveDown(0.2);
      writePdfLine(doc, content.summaryHi, left, doc.y, { size: 9.5, color: '#0F172A', width });
      doc.moveDown(0.5);
    }

    if (content.ppeRequired?.length) {
      writePdfLine(doc, 'Mandatory PPE Required', left, doc.y, { bold: true, size: 11, color: '#1E40AF' });
      doc.moveDown(0.2);
      writePdfLine(doc, content.ppeRequired.join('  •  '), left, doc.y, { size: 9.5, color: '#0F172A', width });
      doc.moveDown(0.6);
    }

    if (content.hazardsAndControls?.length) {
      writePdfLine(doc, 'Hazard Identification & Risk Controls', left, doc.y, { bold: true, size: 11, color: '#1E40AF' });
      doc.moveDown(0.3);
      for (const row of content.hazardsAndControls) {
        if (doc.y > doc.page.height - 95) doc.addPage();
        writePdfLine(doc, `${row.step}  [Risk: ${row.risk}]  —  Resp: ${row.responsibility}`, left, doc.y, { bold: true, size: 9, color: '#0B2545', width });
        doc.moveDown(0.15);
        writePdfLine(doc, `Hazard: ${row.hazard}`, left + 8, doc.y, { size: 8.5, color: '#991B1B', width: width - 8 });
        doc.moveDown(0.15);
        writePdfLine(doc, `Control: ${row.control}`, left + 8, doc.y, { size: 8.5, color: '#1E293B', width: width - 8 });
        doc.moveDown(0.45);
      }
    }

    if (content.verificationChecklist?.length) {
      if (doc.y > doc.page.height - 100) doc.addPage();
      writePdfLine(doc, 'Pre-Task Verification Checklist', left, doc.y, { bold: true, size: 11, color: '#1E40AF' });
      doc.moveDown(0.25);
      content.verificationChecklist.forEach((item, i) => {
        writePdfLine(doc, `[  ] ${i + 1}. ${item}`, left + 6, doc.y, { size: 9, color: '#0F172A', width: width - 6 });
        doc.moveDown(0.2);
      });
      doc.moveDown(0.4);
    }

    if (content.emergencyNotes) {
      if (doc.y > doc.page.height - 80) doc.addPage();
      writePdfLine(doc, 'Emergency Response Notes', left, doc.y, { bold: true, size: 11, color: '#B91C1C' });
      doc.moveDown(0.2);
      writePdfLine(doc, content.emergencyNotes, left, doc.y, { size: 9.5, color: '#0F172A', width });
    }

    doc.end();
  });
}

export async function buildFilteredObservationsPdf(
  observations: Record<string, unknown>[],
  filterSummary: string
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 32, size: 'A4', layout: 'landscape' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    registerPdfFonts(doc);
    drawPdfHeaderBanner(doc, `Filtered Observation Report (${observations.length} records)`, 'SUMMARY');

    const left = 32;
    const width = doc.page.width - 64;
    writePdfLine(doc, `Filters: ${filterSummary || 'All Records'}`, left, doc.y, { size: 9, color: '#475569', width });
    doc.moveDown(0.6);

    observations.forEach((o, idx) => {
      if (doc.y > doc.page.height - 70) doc.addPage();
      const y = doc.y;
      doc.rect(left, y, width, 42).fillAndStroke(idx % 2 === 0 ? '#F8FAFC' : '#FFFFFF', '#E2E8F0');
      writePdfLine(doc, `${o.obs_code} | ${o.risk_level} | ${o.status} | ${String(o.observed_at || '').slice(0, 10)}`, left + 8, y + 5, {
        bold: true,
        size: 8.5,
        color: '#0B2545',
        width: width - 16,
      });
      writePdfLine(doc, `${o.title} — ${o.location} (${o.agency_name})`, left + 8, y + 17, {
        size: 8.5,
        color: '#0F172A',
        width: width - 16,
      });
      writePdfLine(doc, `Action: ${o.corrective_action} [Resp: ${o.responsible_person}, Target: ${o.target_date}]`, left + 8, y + 29, {
        size: 7.5,
        color: '#475569',
        width: width - 16,
      });
      doc.y = y + 46;
    });

    doc.end();
  });
}

export async function buildSafetyDocumentDocx(docRecord: Record<string, unknown>): Promise<Buffer> {
  const content = JSON.parse(String(docRecord.content_json || '{}')) as {
    summary?: string;
    summaryHi?: string;
    ppeRequired?: string[];
    hazardsAndControls?: Array<{ step: string; hazard: string; risk: string; control: string; responsibility: string }>;
    verificationChecklist?: string[];
    emergencyNotes?: string;
  };

  const borderStyle = { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' };
  const cellBorders = { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle };

  const tableRows: DocxTableRow[] = [
    new DocxTableRow({
      children: ['Activity Step', 'Hazard', 'Risk', 'Control Measure', 'Responsibility'].map(
        (h) =>
          new DocxTableCell({
            borders: cellBorders,
            shading: { fill: '0B2545' },
            children: [
              new Paragraph({
                children: [new TextRun({ text: h, bold: true, color: 'FFFFFF', size: 20 })],
              }),
            ],
          })
      ),
    }),
    ...(content.hazardsAndControls ?? []).map(
      (row) =>
        new DocxTableRow({
          children: [row.step, row.hazard, row.risk, row.control, row.responsibility].map(
            (val) =>
              new DocxTableCell({
                borders: cellBorders,
                children: [new Paragraph({ children: [new TextRun({ text: val || '', size: 19 })] })],
              })
          ),
        })
    ),
  ];

  const docxDoc = new DocxDocument({
    sections: [
      {
        children: [
          new Paragraph({
            alignment: AlignmentType.LEFT,
            children: [
              new TextRun({
                text: 'SURAJ HSE — INDUSTRIAL SAFETY MANAGEMENT SYSTEM',
                bold: true,
                size: 28,
                color: '0B2545',
              }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: 'Safety First – Every Task, Every Person, Every Day.',
                italics: true,
                size: 18,
                color: 'B45309',
              }),
            ],
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: `${docRecord.doc_type}: ${docRecord.title}`, bold: true })],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Document ID: ${docRecord.doc_code}   |   Location: ${docRecord.location}   |   Department: ${docRecord.department}   |   Prepared By: ${docRecord.prepared_by}`,
                size: 20,
                color: '475569',
              }),
            ],
          }),
          new Paragraph({ text: '' }),
          ...(content.summary
            ? [
                new Paragraph({ heading: HeadingLevel.HEADING_2, text: 'Scope & Summary' }),
                new Paragraph({ text: content.summary }),
              ]
            : []),
          ...(content.summaryHi
            ? [
                new Paragraph({ heading: HeadingLevel.HEADING_2, text: 'Hindi Summary (हिंदी सारांश)' }),
                new Paragraph({ text: content.summaryHi }),
              ]
            : []),
          ...(content.ppeRequired?.length
            ? [
                new Paragraph({ heading: HeadingLevel.HEADING_2, text: 'Mandatory PPE Required' }),
                new Paragraph({ text: content.ppeRequired.join(', ') }),
              ]
            : []),
          new Paragraph({ heading: HeadingLevel.HEADING_2, text: 'Hazard Identification & Controls' }),
          new DocxTable({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: tableRows,
          }),
          ...(content.verificationChecklist?.length
            ? [
                new Paragraph({ heading: HeadingLevel.HEADING_2, text: 'Verification Checklist' }),
                ...content.verificationChecklist.map(
                  (c, idx) => new Paragraph({ text: `[ ] ${idx + 1}. ${c}` })
                ),
              ]
            : []),
          ...(content.emergencyNotes
            ? [
                new Paragraph({ heading: HeadingLevel.HEADING_2, text: 'Emergency Response Notes' }),
                new Paragraph({ text: content.emergencyNotes }),
              ]
            : []),
        ],
      },
    ],
  });

  return await Packer.toBuffer(docxDoc);
}
