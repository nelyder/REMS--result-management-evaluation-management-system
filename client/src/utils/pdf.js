import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatMark, periodLabel } from './format.js';

/**
 * Builds a result statement PDF from data returned by /students/me/* or, for admins,
 * /students/:id/statement. Both only ever contain published results.
 */
export function downloadStatementPdf({ profile, results, summary }) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const width = doc.internal.pageSize.getWidth();
  const generated = new Date().toLocaleString();

  doc.setFillColor(29, 78, 216);
  doc.rect(0, 0, width, 70, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Statement of Results', 40, 32);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Result Evaluation and Management System', 40, 50);

  doc.setTextColor(30, 41, 59);
  doc.setFontSize(10);
  const s = profile.student || {};
  const info = [
    ['Name', profile.fullName],
    ['Registration number', s.registrationNumber || '—'],
    ['Programme', s.programme ? `${s.programme.code} — ${s.programme.name}` : '—'],
    ['Year of study', String(s.yearOfStudy ?? '—')],
  ];
  info.forEach(([k, v], i) => {
    doc.setFont('helvetica', 'bold');
    doc.text(`${k}:`, 40, 96 + i * 15);
    doc.setFont('helvetica', 'normal');
    doc.text(String(v), 160, 96 + i * 15);
  });

  let y = 96 + info.length * 15 + 16;
  const byPeriod = new Map();
  for (const r of results) {
    const key = r.academicPeriod.id;
    if (!byPeriod.has(key)) byPeriod.set(key, { period: r.academicPeriod, rows: [] });
    byPeriod.get(key).rows.push(r);
  }

  for (const { period, rows } of byPeriod.values()) {
    const ps = summary?.periods?.find((p) => p.academicPeriod.id === period.id);
    autoTable(doc, {
      startY: y,
      head: [[{ content: periodLabel(period), colSpan: 8, styles: { fillColor: [241, 245, 249], textColor: [15, 23, 42] } }],
        ['Code', 'Course', 'Credits', 'CW', 'Exam', 'Total', 'Grade', 'Result']],
      body: rows.map((r) => [
        r.course.code,
        r.course.name,
        r.course.creditUnits,
        formatMark(r.courseworkMark),
        formatMark(r.examinationMark),
        formatMark(r.totalMark),
        r.grade || '—',
        r.resultStatus === 'pass' ? 'Pass' : 'Fail',
      ]),
      foot: ps
        ? [[{ content: `Credits: ${ps.creditsAttempted}   Weighted average: ${formatMark(ps.average)}   GPA: ${ps.gpa ?? '—'}`, colSpan: 8 }]]
        : undefined,
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [29, 78, 216] },
      footStyles: { fillColor: [248, 250, 252], textColor: [51, 65, 85], fontStyle: 'normal' },
      margin: { left: 40, right: 40 },
    });
    y = doc.lastAutoTable.finalY + 18;
  }

  if (summary?.cumulative) {
    const c = summary.cumulative;
    doc.setFont('helvetica', 'bold');
    doc.text('Cumulative summary', 40, y);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Courses: ${c.courses}   Credits earned: ${c.creditsEarned}/${c.creditsAttempted}   Weighted average: ${formatMark(c.average)}   CGPA: ${c.gpa ?? '—'}`,
      40,
      y + 15,
    );
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Generated ${generated}. Contains published results only. Unofficial copy unless stamped by the registry.  Page ${i} of ${pages}`,
      40,
      doc.internal.pageSize.getHeight() - 24,
    );
  }

  doc.save(`result-statement-${(s.registrationNumber || 'student').replace(/[^\w-]+/g, '_')}.pdf`);
}
