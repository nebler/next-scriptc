"use scriptc";

import { hashSync, compareSync } from "bcryptjs";
const salt = "$2b$10$N9qo8uLOickgx2ZMRZoMye";
export function GET() {
  const hash = hashSync("correct horse battery staple", salt);
  return Response.json({ hash, valid: compareSync("correct horse battery staple", hash), invalid: compareSync("wrong", hash) });
}
