import {
  add,
  headers,
  integer,
  invalid,
  sorted,
  type Total,
} from "../common.ts";
import { parseCSV } from "./parser.ts";
export async function POST(request: Request) {
  try {
    const text = await request.text();
    if (text.length > 16 * 1024 * 1024) return invalid();
    const rows = parseCSV(text);
    if (
      rows.length === 0 ||
      rows[0].join(",") !== "id,region,sku,amountCents,quantity,status,note"
    )
      return invalid();
    const totals = new Map<number, Total>();
    let accepted = 0;
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length !== 7) return invalid();
      integer(row[0], 0, 1_000_000);
      const region = integer(row[1], 0, 7),
        sku = integer(row[2], 0, 127);
      const amount = integer(row[3], 0, 1_000_000),
        quantity = integer(row[4], 1, 100);
      if (row[5] !== "paid" && row[5] !== "refund") return invalid();
      if (row[5] === "paid") {
        add(totals, region * 128 + sku, amount * quantity);
        accepted++;
      }
    }
    return Response.json(
      { rows: rows.length - 1, accepted, groups: sorted(totals) },
      { headers },
    );
  } catch {
    return invalid();
  }
}
