"use native";

import satori from "satori";
import { createElement } from "react";
import { readFileSync } from "node:fs";
const font = readFileSync(new URL("../../node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf", import.meta.url));
export async function GET() {
  const svg = await satori(createElement("div", { style: { display: "flex", backgroundColor: "#fff", color: "#111", fontSize: 32 } }, "Shipping reliable APIs"), { width: 600, height: 315, fonts: [{ name: "Geist", data: font, weight: 400, style: "normal" }] });
  return new Response(svg, { headers: { "content-type": "image/svg+xml" } });
}
