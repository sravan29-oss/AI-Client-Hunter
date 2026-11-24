export function escapeCsvCell(value: unknown): string {
  let text = value == null ? '' : Array.isArray(value) ? value.join('; ') : value instanceof Date ? value.toISOString() : String(value);
  if (/^[\u0000-\u0020]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

export class CsvFormatError extends Error {
  constructor(readonly row: number, message: string) {
    super(message);
  }
}

export function parseCsv(text: string): Array<{ row: number; value: Record<string, string> }> {
  const source = text.replace(/^\uFEFF/, '');
  const records: Array<{ row: number; fields: string[] }> = [];
  let fields: string[] = [];
  let field = '';
  let quoted = false;
  let closed = false;
  let line = 1;
  let recordLine = 1;
  const pushField = () => {
    fields.push(field);
    field = '';
    closed = false;
  };
  const pushRecord = () => {
    pushField();
    if (fields.some((value) => value.trim())) records.push({ row: recordLine, fields });
    fields = [];
  };

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else {
        field += char;
        if (char === '\n' || (char === '\r' && source[i + 1] !== '\n')) line++;
      }
    } else if (char === '"' && !field && !closed) {
      quoted = true;
    } else if (char === ',') {
      pushField();
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i++;
      pushRecord();
      recordLine = ++line;
    } else if (char === '"' || closed) {
      throw new CsvFormatError(line, 'Unexpected characters in a quoted CSV field.');
    } else {
      field += char;
    }
  }
  if (quoted) throw new CsvFormatError(recordLine, 'Unclosed quoted CSV field.');
  pushRecord();

  const [header, ...rows] = records;
  if (!header || rows.length === 0) throw new CsvFormatError(1, 'CSV must contain a header and at least one data row.');
  const columns = header.fields.map((name) => name.trim());
  if (columns.some((name) => !name) || new Set(columns).size !== columns.length) {
    throw new CsvFormatError(header.row, 'CSV headers must be nonempty and unique.');
  }
  return rows.map(({ row, fields: values }) => {
    if (values.length !== columns.length) throw new CsvFormatError(row, 'CSV row has a different number of fields than its header.');
    return { row, value: Object.fromEntries(columns.map((name, index) => [name, values[index]])) };
  });
}
