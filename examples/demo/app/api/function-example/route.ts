import { echo, fail } from "../../../lib/native-example.ts";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  try {
    if (params.has("error")) await fail(params.get("error") || "failed");
    return Response.json({ value: await echo(params.get("value") ?? "hello") });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
