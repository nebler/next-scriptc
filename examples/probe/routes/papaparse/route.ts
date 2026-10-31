"use native";

import Papa from "papaparse";
export function GET() {
  const rows = [{ sku: "LAMP-001", name: "Desk lamp, brass", notes: 'Fits a 27" desk\nCafé', cents: 12900 }, { sku: "CHAIR-002", name: "Office chair", notes: "=SUM(A1:A2)", cents: 24900 }];
  const csv = Papa.unparse(rows, { escapeFormulae: true, newline: "\r\n" });
  const parsed = Papa.parse(csv, { header: true });
  return Response.json({ csv, data: parsed.data, errors: parsed.errors });
}
