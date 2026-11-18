/**
 * Server-only: turns a Drafting Desk draft into a Word file in Excredite's
 * house style. Citations follow each paragraph in small grey brackets, and a
 * numbered list of sources closes the document.
 */
import { AlignmentType, Document, Footer, Header, HeadingLevel, Packer, PageNumber, Paragraph, TextRun } from 'docx';
import { citeLabel, parseCellKey, type Draft, type DraftSource, type EvidenceCell } from './core';

const BRAND = '0A3A22';
const MUTED = '6B7A70';
const FONT = 'Arial';

export async function draftToDocx(opts: {
  draft: Draft;
  sources: DraftSource[];
  cells: EvidenceCell[];
  reader: string;
  author: string;
  jobReference?: string | null;
}): Promise<Buffer> {
  const { draft, sources, cells, reader, author, jobReference } = opts;
  const bySource = new Map(sources.map((s) => [s.ref, s]));
  const label = (key: string) => {
    const k = parseCellKey(key);
    if (!k) return key;
    return citeLabel(bySource.get(k.sourceRef), cells.find((c) => c.sourceRef === k.sourceRef && c.questionId === k.questionId));
  };
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const body: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      spacing: { after: 120 },
      children: [new TextRun({ text: draft.title, bold: true, size: 36, color: BRAND, font: FONT })],
    }),
    new Paragraph({
      spacing: { after: 360 },
      children: [
        new TextRun({
          text: [`Prepared for: ${reader}`, `By: ${author}`, date, jobReference ? `Job ${jobReference}` : null].filter(Boolean).join('  ·  '),
          size: 18,
          color: MUTED,
          font: FONT,
        }),
      ],
    }),
  ];

  draft.sections.forEach((s, i) => {
    body.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 280, after: 120 },
        children: [new TextRun({ text: `${i + 1}. ${s.heading}`, bold: true, size: 26, color: BRAND, font: FONT })],
      }),
    );
    for (const p of s.paragraphs) {
      body.push(
        new Paragraph({
          spacing: { after: 160, line: 300 },
          children: [
            new TextRun({ text: p.text, size: 22, font: FONT }),
            ...(p.cites.length ? [new TextRun({ text: `  [${p.cites.map(label).join('; ')}]`, size: 16, color: MUTED, font: FONT })] : []),
          ],
        }),
      );
    }
  });

  body.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 360, after: 120 },
      children: [new TextRun({ text: 'Sources', bold: true, size: 24, color: BRAND, font: FONT })],
    }),
  );
  sources.forEach((s, i) => {
    body.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({ text: `${i + 1}. ${s.title}`, size: 20, font: FONT }),
          new TextRun({ text: [s.detail, s.url].filter(Boolean).length ? `  ${[s.detail, s.url].filter(Boolean).join(' · ')}` : '', size: 18, color: MUTED, font: FONT }),
        ],
      }),
    );
  });

  const doc = new Document({
    creator: `${author} (EPDH Drafting Desk)`,
    title: draft.title,
    styles: { default: { document: { run: { font: FONT, size: 22 } } } },
    sections: [
      {
        properties: { page: { margin: { top: 1300, bottom: 1200, left: 1300, right: 1300 } } },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: 'EXCREDITE', bold: true, size: 18, color: BRAND, font: FONT, characterSpacing: 40 })],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: 'Confidential · Draft prepared with the Excredite Electricity Data Hub · Page ', size: 16, color: MUTED, font: FONT }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: MUTED, font: FONT }),
                ],
              }),
            ],
          }),
        },
        children: body,
      },
    ],
  });
  return Packer.toBuffer(doc);
}

/** A safe file name from the title. */
export function docxFileName(title: string): string {
  const base = title.normalize('NFKD').replace(/[^\w\s.-]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Draft';
  return `${base}.docx`;
}
