import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import * as XLSX from 'xlsx';
import { UnsupportedFormatError, chunkText, extractDocument, fileExtension, isSupported, toChunks } from '../extractText';

/** A PDF whose pages hold the given text; '' makes a blank page (like a scanned image page). */
async function makePdf(pageTexts: string[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const text of pageTexts) {
    const page = doc.addPage([612, 792]);
    if (text) page.drawText(text, { x: 72, y: 720, size: 12, font });
  }
  return Buffer.from(await doc.save());
}

async function makeDocx(paragraphs: string[]): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join('')}</w:body></w:document>`);
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function makePptx(slides: string[][]): Promise<Buffer> {
  const zip = new JSZip();
  slides.forEach((paras, i) => {
    zip.file(`ppt/slides/slide${i + 1}.xml`, `<p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree>${paras.map((t) => `<a:p><a:r><a:t>${t}</a:t></a:r></a:p>`).join('')}</p:spTree></p:cSld></p:sld>`);
  });
  zip.file('ppt/slides/_rels/slide1.xml.rels', '<x/>'); // non-slide file in the folder is ignored
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('file types', () => {
  it('recognises supported and unsupported files', () => {
    expect(fileExtension('Tariff Order.PDF')).toBe('pdf');
    expect(isSupported('a.docx')).toBe(true);
    expect(isSupported('a.doc')).toBe(false);
    expect(isSupported('noext')).toBe(false);
  });

  it('explains old Office formats instead of guessing', async () => {
    await expect(extractDocument(Buffer.from('x'), 'memo.doc')).rejects.toBeInstanceOf(UnsupportedFormatError);
    await expect(extractDocument(Buffer.from('x'), 'memo.doc')).rejects.toThrow('save as .docx');
  });
});

describe('chunkText', () => {
  it('keeps short text whole and splits long text with overlap at sentence ends', () => {
    expect(chunkText('  Short   text. ')).toEqual(['Short text.']);
    const long = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} about tariffs.`).join(' ');
    const chunks = chunkText(long);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 1200)).toBe(true);
    expect(chunks.slice(0, -1).every((c) => c.endsWith('.'))).toBe(true);
    expect(chunks[1].slice(0, 30)).not.toBe(chunks[0].slice(0, 30));
  });

  it('returns nothing for empty text', () => {
    expect(chunkText('   \n ')).toEqual([]);
  });
});

describe('extractDocument', () => {
  it('reads PDFs page by page and flags blank (scanned) pages', async () => {
    const ex = await extractDocument(await makePdf(['NERC approved new Band A tariffs for distribution companies.', '']), 'order.pdf');
    expect(ex.format).toBe('PDF');
    expect(ex.pageCount).toBe(2);
    expect(ex.emptyPages).toEqual([2]);
    expect(ex.units).toHaveLength(1);
    expect(ex.units[0].page).toBe(1);
    expect(ex.units[0].text).toContain('Band A tariffs');
    expect(toChunks(ex)[0]).toMatchObject({ page_number: 1, format: 'PDF' });
  });

  it('reports a fully scanned PDF as having no text', async () => {
    const ex = await extractDocument(await makePdf(['', '']), 'scan.pdf');
    expect(ex.units).toEqual([]);
    expect(ex.emptyPages).toEqual([1, 2]);
    expect(ex.totalChars).toBe(0);
  });

  it('reads Word documents', async () => {
    const ex = await extractDocument(await makeDocx(['Gas supply to thermal plants', 'was unreliable.']), 'memo.docx');
    expect(ex.format).toBe('WORD');
    expect(ex.units[0].text).toContain('Gas supply to thermal plants');
  });

  it('reads PowerPoint slide by slide, keeping slide numbers', async () => {
    const ex = await extractDocument(await makePptx([['Agenda', 'Tariffs &amp; metering'], [], ['Next steps']]), 'deck.pptx');
    expect(ex.slideCount).toBe(3);
    expect(ex.units).toEqual([
      { text: 'Agenda\nTariffs & metering', slide: 1 },
      { text: 'Next steps', slide: 3 },
    ]);
    expect(toChunks(ex).map((c) => c.slide_number)).toEqual([1, 3]);
  });

  it('reads spreadsheets sheet by sheet', async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Plant', 'MW'], ['Egbin', 1320]]), 'Capacity');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), 'Empty');
    const buf = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
    const ex = await extractDocument(buf, 'plants.xlsx');
    expect(ex.units).toHaveLength(1);
    expect(ex.units[0].sheet).toBe('Capacity');
    expect(toChunks(ex)[0].text).toBe('Sheet: Capacity\nPlant,MW Egbin,1320');
  });

  it('reads plain text', async () => {
    const ex = await extractDocument(Buffer.from('Grid collapse on 4 March.'), 'note.txt');
    expect(ex.units[0].text).toBe('Grid collapse on 4 March.');
  });
});
