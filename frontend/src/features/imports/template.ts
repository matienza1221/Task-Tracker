export const IMPORT_TEMPLATE_FILENAME = 'TeamBoard_Template.csv';

/**
 * Mirrors the team's reference spreadsheet: a title row, an instruction row, a
 * KPI summary block, then the real header on row 8 and data from row 9. The
 * backend detects the header below the preamble, so the summary block is
 * ignored on import.
 */
const COLUMN_COUNT = 9;
const FIRST_DATA_ROW = 9;
const LAST_DATA_ROW = 5000;

const HEADERS = [
  'Area',
  'Task',
  'Owner',
  'Priority',
  'Status',
  'Due date',
  'Completed date',
  'Blocker / next step',
  'Reference link',
] as const;

/** Sample rows flagged with [Example] so they are obvious to replace/delete. */
const EXAMPLE_ROWS: string[][] = [
  [
    'Meetings',
    '[Example] Add a summary card to the dashboard',
    '',
    'Medium',
    'To do',
    '',
    '',
    'Replace or delete this example row',
    'Universe.jsx:55-68',
  ],
  [
    'Calendar',
    '[Example] Block picking past dates when scheduling',
    '',
    'High',
    'In progress',
    '',
    '',
    'Verified',
    'modals.jsx:408-410,874-875',
  ],
  [
    'Demo',
    '[Example] Stakeholder demo of the new workflow',
    '',
    'Low',
    'Done',
    '',
    '',
    'No code artifact',
    '-',
  ],
];

const KPI_FORMULAS = [
  `=COUNTA(B${FIRST_DATA_ROW}:B${LAST_DATA_ROW})`,
  `=COUNTIF(E${FIRST_DATA_ROW}:E${LAST_DATA_ROW},"Done")`,
  `=COUNTIF(E${FIRST_DATA_ROW}:E${LAST_DATA_ROW},"Blocked")`,
  `=COUNTIFS(F${FIRST_DATA_ROW}:F${LAST_DATA_ROW},"<"&TODAY(),E${FIRST_DATA_ROW}:E${LAST_DATA_ROW},"<>Done")`,
  `=COUNTIFS(F${FIRST_DATA_ROW}:F${LAST_DATA_ROW},">="&TODAY(),F${FIRST_DATA_ROW}:F${LAST_DATA_ROW},"<="&TODAY()+7,E${FIRST_DATA_ROW}:E${LAST_DATA_ROW},"<>Done")`,
  '=IFERROR(TEXT(B5/A5,"0%"),"0%")',
];

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function csvRow(cells: string[] = []): string {
  return Array.from({ length: COLUMN_COUNT }, (_, index) => csvCell(cells[index] ?? '')).join(',');
}

/** Builds the downloadable import template (UTF-8 BOM so Excel reads accents). */
export function buildImportTemplateCsv(): string {
  const lines = [
    csvRow(['Task tracker']),
    csvRow([
      'Replace or delete rows marked [Example]. Add one row per task; update status and due dates as work changes.',
    ]),
    csvRow(),
    csvRow(['Total tasks', 'Completed', 'Blocked', 'Overdue', 'Due next 7 days', 'Completion']),
    csvRow(KPI_FORMULAS),
    csvRow(),
    csvRow(),
    csvRow([...HEADERS]),
    ...EXAMPLE_ROWS.map((row) => csvRow(row)),
  ];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/** Triggers a browser download of the import template. */
export function downloadImportTemplate(): void {
  const blob = new Blob([buildImportTemplateCsv()], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = IMPORT_TEMPLATE_FILENAME;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
