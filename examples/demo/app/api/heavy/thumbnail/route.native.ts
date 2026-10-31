import { headers, integer, invalid } from "../common.ts";
export async function POST(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const width = integer(params.get("width") ?? "", 4, 1024),
      height = integer(params.get("height") ?? "", 4, 1024);
    if (width % 4 || height % 4) return invalid();
    const rgba = new Uint8Array(await request.arrayBuffer());
    if (rgba.length !== width * height * 4) return invalid();
    const w = width / 4,
      h = height / 4;
    const output = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        for (let c = 0; c < 4; c++) {
          let sum = 0;
          for (let dy = 0; dy < 4; dy++)
            for (let dx = 0; dx < 4; dx++)
              sum += rgba[((y * 4 + dy) * width + x * 4 + dx) * 4 + c];
          output[(y * w + x) * 4 + c] = Math.floor(sum / 16);
        }
    return new Response(output, {
      headers: { ...headers, "content-type": "application/octet-stream" },
    });
  } catch {
    return invalid();
  }
}
