export async function GET(_request: Request, context: { params: Promise<Record<string, string | string[]>> }) {
  const params = await context.params;
  return Response.json({ id: params.id });
}
