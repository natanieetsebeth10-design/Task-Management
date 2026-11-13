// NEW FILE: src/app/services/pdf-export.ts
import { Injectable } from '@angular/core';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface PdfStat { label: string; value: string | number; }
export interface PdfChart { title: string; dataUrl: string; width: number; height: number; }

export interface PdfTableOptions {
  filename: string;               // without ".pdf" (today's date is added)
  title: string;
  subtitle?: string;
  filters?: string[];             // short lines under the title, e.g. "Status: completed"
  head: string[];
  rows: (string | number)[][];
  landscape?: boolean;
  columnStyles?: Record<number, any>;
}

export interface PdfDashboardOptions {
  filename: string;
  title: string;
  subtitle?: string;
  stats: PdfStat[];
  charts: PdfChart[];
  table?: { title: string; head: string[]; rows: (string | number)[][] };
}

const BRAND: [number, number, number] = [143, 163, 230];   // #8fa3e6
const DARK: [number, number, number] = [60, 75, 168];      // #3c4ba8
const MUTED: [number, number, number] = [110, 120, 170];
const SOFT: [number, number, number] = [240, 244, 255];    // #f0f4ff
const LINE: [number, number, number] = [200, 208, 248];    // #c8d0f8
const M = 14;                                              // page margin in mm

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

@Injectable({ providedIn: 'root' })
export class PdfExportService {

  // ---------- public ----------

  /** A report that is mainly one table (Reports, Task Overview). */
  exportTable(opts: PdfTableOptions) {
    const doc = new jsPDF({ orientation: opts.landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
    let y = this.header(doc, opts.title, opts.subtitle, opts.filters);

    if (opts.rows.length === 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
      doc.text('No data for the selected filters.', M, y + 6);
    } else {
      autoTable(doc, {
        startY: y,
        head: [opts.head],
        body: opts.rows.map(r => r.map(c => String(c))),
        margin: { left: M, right: M, bottom: 16 },
        styles: { fontSize: 8.5, cellPadding: 2.2, textColor: DARK, lineColor: LINE, lineWidth: 0.1, overflow: 'linebreak' },
        headStyles: { fillColor: BRAND, textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: SOFT },
        columnStyles: opts.columnStyles ?? {}
      });
    }

    this.footer(doc);
    doc.save(this.fileName(opts.filename));
  }

  /** A summary page: stat boxes, chart images, and an optional table (the performance pages). */
  exportDashboard(opts: PdfDashboardOptions) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    let y = this.header(doc, opts.title, opts.subtitle);

    // ---- stat boxes: 4 per row ----
    const gap = 4;
    const boxW = (pw - 2 * M - 3 * gap) / 4;
    const boxH = 18;
    opts.stats.forEach((s, i) => {
      const x = M + (i % 4) * (boxW + gap);
      const top = y + Math.floor(i / 4) * (boxH + gap);
      doc.setFillColor(SOFT[0], SOFT[1], SOFT[2]);
      doc.roundedRect(x, top, boxW, boxH, 2, 2, 'F');
      doc.setFillColor(BRAND[0], BRAND[1], BRAND[2]);
      doc.rect(x, top + 2, 1.2, boxH - 4, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(DARK[0], DARK[1], DARK[2]);
      doc.text(String(s.value), x + boxW / 2, top + 9, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
      doc.text(s.label.toUpperCase(), x + boxW / 2, top + 14.5, { align: 'center' });
    });
    y += Math.ceil(opts.stats.length / 4) * (boxH + gap) + 4;

    // ---- charts: 2 per row ----
    const colW = (pw - 2 * M - gap) / 2;
    const MAX_H = 70;
    let col = 0;
    let rowTop = y;
    let rowMax = 0;
    for (const c of opts.charts) {
      const aspect = c.height / c.width || 0.6;
      let w = colW;
      let h = w * aspect;
      if (h > MAX_H) { h = MAX_H; w = h / aspect; }

      // start a new page if the tallest possible chart row would not fit
      if (col === 0 && rowTop + MAX_H + 12 > ph - 16) {
        doc.addPage();
        rowTop = M;
      }
      const cx = M + col * (colW + gap);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(DARK[0], DARK[1], DARK[2]);
      doc.text(c.title, cx, rowTop + 4);
      doc.addImage(c.dataUrl, 'PNG', cx, rowTop + 7, w, h);
      rowMax = Math.max(rowMax, h + 10);

      col++;
      if (col === 2) { col = 0; rowTop += rowMax + 4; rowMax = 0; }
    }
    if (col === 1) rowTop += rowMax + 4;
    y = rowTop;

    // ---- optional table ----
    if (opts.table) {
      if (y + 30 > ph - 16) { doc.addPage(); y = M; }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(DARK[0], DARK[1], DARK[2]);
      doc.text(opts.table.title, M, y + 4);
      autoTable(doc, {
        startY: y + 8,
        head: [opts.table.head],
        body: opts.table.rows.map(r => r.map(c => String(c))),
        margin: { left: M, right: M, bottom: 16 },
        styles: { fontSize: 8.5, cellPadding: 2.2, textColor: DARK, lineColor: LINE, lineWidth: 0.1, overflow: 'linebreak' },
        headStyles: { fillColor: BRAND, textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: SOFT }
      });
    }

    this.footer(doc);
    doc.save(this.fileName(opts.filename));
  }

  /** Grabs every chart canvas inside a page as an image, in the order they appear on screen. */
  chartsFrom(host: HTMLElement, titles: string[]): PdfChart[] {
    return Array.from(host.querySelectorAll('canvas'))
      .map((c, i) => ({
        title: titles[i] ?? 'Chart',
        dataUrl: c.toDataURL('image/png'),
        width: c.width,
        height: c.height
      }))
      .filter(c => c.width > 1 && c.height > 1);
  }

  // ---------- private ----------

  private header(doc: jsPDF, title: string, subtitle?: string, filters: string[] = []): number {
    const pw = doc.internal.pageSize.getWidth();
    const maxW = pw - 2 * M;

    // coloured band
    doc.setFillColor(BRAND[0], BRAND[1], BRAND[2]);
    doc.rect(0, 0, pw, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('SKDL', M, 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Generated ' + this.stamp(), pw - M, 14, { align: 'right' });

    // title block
    let y = 33;
    doc.setTextColor(DARK[0], DARK[1], DARK[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(title, M, y);
    y += 7;

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    if (subtitle) {
      doc.setFontSize(10);
      const lines = doc.splitTextToSize(subtitle, maxW);
      doc.text(lines, M, y);
      y += lines.length * 5 + 1;
    }
    doc.setFontSize(9);
    for (const f of filters) {
      const lines = doc.splitTextToSize(f, maxW);
      doc.text(lines, M, y);
      y += lines.length * 4.5;
    }
    return y + 4;
  }

  private footer(doc: jsPDF) {
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const total = doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
      doc.setLineWidth(0.2);
      doc.line(M, ph - 12, pw - M, ph - 12);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
      doc.text('SKDL', M, ph - 7);
      doc.text(`Page ${i} of ${total}`, pw - M, ph - 7, { align: 'right' });
    }
  }

  private stamp(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  private fileName(base: string): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${base}-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.pdf`;
  }
}