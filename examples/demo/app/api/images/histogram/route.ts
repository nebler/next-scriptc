"use scriptc";

export async function POST(request: Request) {
  const params = new URL(request.url).searchParams;
  const width = Number(params.get("width"));
  const height = Number(params.get("height"));
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 1024 * 1024) {
    return Response.json({ error: "width and height must describe 1 to 1048576 RGBA pixels" }, { status: 400 });
  }
  const rgba = new Uint8Array(await request.arrayBuffer());
  if (rgba.length !== width * height * 4) {
    return Response.json({ error: "body must contain exactly width * height * 4 RGBA bytes" }, { status: 400 });
  }
  // Integer Rec.601 luma of raw RGB channels; alpha is ignored, not composited.
  const histogram = new Uint32Array(256);
  let sum = 0;
  let min = 255;
  let max = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const luma = (77 * rgba[i] + 150 * rgba[i + 1] + 29 * rgba[i + 2]) >>> 8;
    histogram[luma]++;
    sum += luma;
    min = Math.min(min, luma);
    max = Math.max(max, luma);
  }
  const pixels = width * height;
  return Response.json({ width, height, pixels, min, max, mean: sum / pixels, histogram: Array.from(histogram) }, {
    headers: { "cache-control": "no-store" },
  });
}
