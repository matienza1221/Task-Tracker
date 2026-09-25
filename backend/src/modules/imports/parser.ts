import ExcelJS from 'exceljs';
import { scoreHeaderRow } from './schemas';

export interface ParsedRow {
  /** 1-based line number in the uploaded file (header excluded). */
  rowNumber: number;
  values: string[];
}

export interface ParsedSheet {
  headers: string[];
  rows: ParsedRow[];
  format: 'CSV' | 'XLSX';
  /** 1-based line number of the detected header row. */
  headerRowNumber: number;
  /** Rows above the header (title/KPI blocks) that were ignored. */
  preambleRows: number;
}

const HEADER_SEARCH_DEPTH = 20;
const MIN_HEADER_SCORE = 2;

/**
 * Finds the header row: spreadsheets often start with a title and KPI block, so
 * the first row is not necessarily the header. The row with the most known
 * column names wins (at least two matches), otherwise row 1 is used.
 */
export function detectHeaderIndex(rows: string[][]): number {
  let bestIndex = 0;
  let bestScore = 0;
  for (let index = 0; index < Math.min(rows.length, HEADER_SEARCH_DEPTH); index += 1) {
    const score = scoreHeaderRow(rows[index]);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }
  return bestScore >= MIN_HEADER_SCORE ? bestIndex : 0;
}

const MAX_ROWS = 5000;
const MAX_COLUMNS = 60;

/** RFC 4180-style parser: quoted fields, escaped quotes, CRLF and a UTF-8 BOM. */
export function parseCsv(text: string, delimiter = ','): string[][] {
  const input = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (inQuotes) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  return tabs > commas ? '\t' : ',';
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    const rich = value as { text?: string; result?: unknown; hyperlink?: string };
    if (typeof rich.text === 'string') return rich.text;
    if (rich.result !== undefined) return cellToString(rich.result);
    if (typeof rich.hyperlink === 'string') return rich.hyperlink;
    return '';
  }
  return String(value);
}

async function parseXlsx(buffer: Buffer): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values: string[] = [];
    const lastColumn = Math.min(row.cellCount, MAX_COLUMNS);
    for (let column = 1; column <= lastColumn; column += 1) {
      values.push(cellToString(row.getCell(column).value).trim());
    }
    rows.push(values);
  });
  return rows;
}

/**
 * Parses an uploaded CSV/TSV/XLSX file into headers + string rows. Blank rows
 * are dropped and everything is capped so a hostile file cannot exhaust memory.
 */
export async function parseSheet(buffer: Buffer, filename: string): Promise<ParsedSheet> {
  const isXlsx = filename.toLowerCase().endsWith('.xlsx') || buffer.subarray(0, 2).toString() === 'PK';

  let rows: string[][];
  let format: ParsedSheet['format'];

  if (isXlsx) {
    rows = await parseXlsx(buffer);
    format = 'XLSX';
  } else {
    const text = buffer.toString('utf8');
    rows = parseCsv(text, detectDelimiter(text));
    format = 'CSV';
  }

  if (rows.length === 0) return { headers: [], rows: [], format, headerRowNumber: 1, preambleRows: 0 };

  // The header is detected on the raw rows so reported line numbers keep
  // matching the spreadsheet even when blank separator rows are removed below.
  const headerIndex = detectHeaderIndex(rows);
  const headerRow = rows[headerIndex];
  const headers = headerRow.map((header, index) => header.trim() || `Column ${index + 1}`);

  const dataRows = rows
    .slice(headerIndex + 1)
    .map((values, offset) => ({ rowNumber: headerIndex + 2 + offset, values }))
    .filter((row) => row.values.some((cell) => cell.trim().length > 0));

  if (dataRows.length > MAX_ROWS) {
    throw new Error(`The file has more than ${MAX_ROWS} rows. Split it into smaller imports.`);
  }

  return {
    headers,
    rows: dataRows.slice(0, MAX_ROWS),
    format,
    headerRowNumber: headerIndex + 1,
    preambleRows: headerIndex,
  };
}

export const IMPORT_LIMITS = { MAX_ROWS, MAX_COLUMNS } as const;
