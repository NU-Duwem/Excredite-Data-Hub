import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { docxFileName, draftToDocx } from '../drafting/docx';

describe('Word export', () => {
  it('writes a real .docx with the title, numbered headings, citations and sources', async () => {
    const buf = await draftToDocx({
      draft: { title: 'Band A brief', sections: [{ id: 's1', heading: 'Summary', paragraphs: [{ text: 'The tariff rises.', cites: ['S1:Q1'] }], assumptions: [], gaps: [] }] },
      sources: [{ ref: 'S1', kind: 'document', id: 'd1', title: 'MYTO Order', detail: 'Regulatory order' }],
      cells: [{ sourceRef: 'S1', questionId: 'Q1', status: 'found', answer: 'x', location: 'p.4', quote: null, verified: true }],
      reader: 'Internal team',
      author: 'Duwem Nwapi',
      jobReference: 'EXC-2026-014',
    });
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain('Band A brief');
    expect(xml).toContain('1. Summary');
    expect(xml).toContain('[MYTO Order p.4]');
    expect(xml).toContain('Sources');
    expect(xml).toContain('Job EXC-2026-014');
  });

  it('makes safe file names', () => {
    expect(docxFileName('Band A: what changes / 2024?')).toBe('Band A what changes 2024.docx');
    expect(docxFileName('???')).toBe('Draft.docx');
  });
});
