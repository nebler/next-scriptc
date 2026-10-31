// RFC4180-style records, strict quoting, CRLF or LF. One implementation on both TS runtimes.
// Materialize rows just as Go csv.Reader.ReadAll does; neither variant streams aggregation.
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let closed = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else if (ch === "\r" && text[i + 1] === "\n") {
        field += "\n";
        i++;
      } else field += ch;
    } else if (ch === ",") {
      row.push(field);
      field = "";
      closed = false;
    } else if (ch === "\n" || (ch === "\r" && text[i + 1] === "\n")) {
      if (ch === "\r") i++;
      // encoding/csv ignores blank lines.
      if (row.length || field.length || closed) {
        row.push(field);
        rows.push(row);
      }
      row = [];
      field = "";
      closed = false;
    } else if (ch === '"' && field.length === 0 && !closed) quoted = true;
    else {
      if (ch === '"' || closed) throw new Error("invalid quoting");
      field += ch;
    }
  }
  if (quoted) throw new Error("unterminated quote");
  if (row.length || field.length || closed) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
