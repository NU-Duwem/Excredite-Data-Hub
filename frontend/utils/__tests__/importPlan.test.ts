import { describe, expect, it } from 'vitest';
import { estimateDbBytes, formatBytes, formatDuration, guessDocumentType, isSpreadsheet, parseArgs, storagePath, titleFromFileName } from '../importPlan';

describe('parseArgs', () => {
  it('uses safe defaults', () => {
    expect(parseArgs(['C:\\Docs'])).toMatchObject({
      folder: 'C:\\Docs', dryRun: false, limit: null, classification: 'INTERNAL', type: null, restricted: false, textOnly: false, skipSpreadsheets: false, addOriginals: false, uploadedBy: 'bulk-import',
    });
  });

  it('reads every option', () => {
    expect(
      parseArgs(['docs', '--dry-run', '--limit', '5', '--classification', 'legal-privileged', '--type', 'court judgment', '--restricted', '--text-only', '--uploaded-by', 'ada@example.com', '--report', 'r.json']),
    ).toMatchObject({ dryRun: true, limit: 5, classification: 'LEGAL_PRIVILEGED', type: 'COURT_JUDGMENT', restricted: true, textOnly: true, uploadedBy: 'ada@example.com', report: 'r.json' });
  });

  it('reads the spreadsheet and originals options', () => {
    expect(parseArgs(['docs', '--text-only', '--skip-spreadsheets'])).toMatchObject({ textOnly: true, skipSpreadsheets: true, addOriginals: false });
    expect(parseArgs(['docs', '--add-originals', '--dry-run'])).toMatchObject({ addOriginals: true, dryRun: true });
    expect(() => parseArgs(['docs', '--add-originals', '--text-only'])).toThrow('--add-originals');
  });

  it('rejects mistakes with a clear message', () => {
    expect(() => parseArgs([])).toThrow('Say which folder');
    expect(() => parseArgs(['a', 'b'])).toThrow('Only one folder');
    expect(() => parseArgs(['a', '--limit', '0'])).toThrow('--limit');
    expect(() => parseArgs(['a', '--limit'])).toThrow('--limit needs a value');
    expect(() => parseArgs(['a', '--classification', 'secret'])).toThrow('--classification');
    expect(() => parseArgs(['a', '--type', 'novel'])).toThrow('--type');
    expect(() => parseArgs(['a', '--verbose'])).toThrow('Unknown option');
    expect(parseArgs(['--help']).help).toBe(true);
  });
});

describe('naming and types', () => {
  it('makes readable titles', () => {
    expect(titleFromFileName('NERC_MYTO_Order_2024.pdf')).toBe('NERC MYTO Order 2024');
    expect(titleFromFileName('.pdf')).toBe('.pdf');
  });

  it('guesses document types from names and folders', () => {
    expect(guessDocumentType('Tariffs/MYTO 2024 minor review.pdf')).toBe('TARIFF_DETERMINATION');
    expect(guessDocumentType('Court of Appeal judgment.pdf')).toBe('COURT_JUDGMENT');
    expect(guessDocumentType('NERC Order on metering.pdf')).toBe('REGULATORY_ORDER');
    expect(guessDocumentType('National Energy Policy 2022.docx')).toBe('POLICY_PAPER');
    expect(guessDocumentType('Q1 market report.pdf')).toBe('MARKET_REPORT');
    expect(guessDocumentType('Legal opinion on PPA.docx')).toBe('LEGAL_BRIEF');
    expect(guessDocumentType('Board minutes.docx')).toBe('DOCUMENT_NOTE');
    expect(guessDocumentType('photo.pdf')).toBe('OTHER');
    expect(guessDocumentType('Recorder settings.pdf')).toBe('OTHER'); // "order" inside a word doesn't count
    expect(guessDocumentType('Meter Reading Regulations 2024.pdf')).toBe('REGULATORY_ORDER');
  });

  it('lets the file name decide before the folder names', () => {
    expect(guessDocumentType('African School of Regulation\\Draft MOU.docx')).toBe('OTHER');
    expect(guessDocumentType('African School of Regulation\\draft.Presentation to ASR Parties.pptx')).toBe('OTHER');
    expect(guessDocumentType('Court cases/Statement of claim.docx')).toBe('COURT_JUDGMENT');
    expect(guessDocumentType('Court cases/Legal opinion.docx')).toBe('LEGAL_BRIEF');
    expect(guessDocumentType('Tariff orders\\2024\\scan 03.pdf')).toBe('TARIFF_DETERMINATION');
  });

  it('builds safe storage paths grouped by content hash', () => {
    const hash = 'a'.repeat(64);
    expect(storagePath(hash, 'Tariff Order (final) 2024.pdf')).toBe(`imports/${'a'.repeat(16)}/Tariff_Order_final_2024.pdf`);
    expect(storagePath(hash, '../../etc/passwd')).toBe(`imports/${'a'.repeat(16)}/.._.._etc_passwd`);
    expect(storagePath(hash, '???')).toBe(`imports/${'a'.repeat(16)}/file`);
  });
});

describe('spreadsheets', () => {
  it('recognises spreadsheet files', () => {
    for (const n of ['Readings.xlsx', 'old.XLS', 'macro.xlsm', 'data.csv']) expect(isSpreadsheet(n)).toBe(true);
    for (const n of ['order.pdf', 'memo.docx', 'deck.pptx', 'notes.txt', 'xlsx-guide.pdf']) expect(isSpreadsheet(n)).toBe(false);
  });
});

describe('estimates and formatting', () => {
  it('estimates database space from chunks', () => {
    expect(estimateDbBytes(0, 0)).toBe(0);
    expect(estimateDbBytes(1000, 1_200_000)).toBe(1_200_000 * 1.6 + 1000 * (1536 * 2 + 400));
  });

  it('formats sizes and durations', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(4 * 1024 ** 3)).toBe('4.0 GB');
    expect(formatDuration(42_000)).toBe('42s');
    expect(formatDuration(125_000)).toBe('2m 5s');
    expect(formatDuration(3_725_000)).toBe('1h 2m');
  });
});
