import { compareSync } from "bcryptjs";
import { headers, invalid } from "../common.ts";
const hash = "$2b$10$N9qo8uLOickgx2ZMRZoMyehtJ/whDdsI.d1w/JqKiOrDw8pCT0JLG";
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { password: string };
    if (
      !body ||
      typeof body.password !== "string" ||
      body.password.length === 0 ||
      new TextEncoder().encode(body.password).length > 72
    )
      return invalid();
    return Response.json(
      { valid: compareSync(body.password, hash), cost: 10 },
      { headers },
    );
  } catch {
    return invalid();
  }
}
