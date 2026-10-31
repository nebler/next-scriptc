# Launch visuals

Regenerate every image, chart SVG, review page and recording page from the repository root:

```sh
npm ci --prefix research/launch
node research/launch/generate.mjs
node research/launch/validate.mjs
open research/launch/preview.html
```

Requires Node and an installed Google Chrome or Chromium. Set `CHROME_BIN` to override the detected binary. `--svg-only` updates chart SVGs and review/recording HTML without PNG export. Normal generation is offline after `npm ci`. No Docker, deployment or benchmark requests are involved.

`chart-data.json` is the only source of measured values. Each measurement retains its report section and exact row locator. All ratios use exact values; displayed values use the precision declared in the data. Markdown warm latency remains in the data with `includeInChart: false` and in the launch text. The chart deliberately shows first response, RSS and CPU/request only.

`reference-palette.json` records exact sampled pixels, counts, reference dimensions and SHA-256. To repeat the sampling with the supplied reference:

```sh
node research/launch/sample-reference.mjs /tmp/vstyle/reference-route-go.png
```

The PNG contains color noise from resampling/compression. The sampler takes the modal observed RGB value in each semantic color band, plus a crosshair region. These are observed pixels, not reconstructed original theme constants. Blue `#006bff` is the chart accent. Native stays white, comparisons stay blue; each bar has a runtime label.

Geist Sans and Geist Mono come from the pinned `geist` npm dependency. WOFF2 data is embedded through `@font-face` in generated SVG/HTML so Chrome renders deterministically without network fonts or installed system fonts. The font files stay in ignored `node_modules/`; the included SIL OFL notice is `LICENSE-Geist.txt`. Syntax tokens come from Shiki's TypeScript grammar and a custom theme built from the sampled palette. The revenue example is a valid, simplified adaptation of `examples/demo/lib/revenue.ts`: it accepts parsed events and preserves the directive, range predicate and cents arithmetic.

Chrome renders at device scale factor 2. The generator waits for all three font faces, checks SVG text bounds, verifies PNG dimensions and optimizes PNGs losslessly with Sharp. Every PNG must remain below 1 MB. `asset-manifest.json` records dimensions, size, scale and font/layout results. `validate.mjs` checks the visible numbers against the JSON and byte equality of README/legacy chart copies. The local review page displays each exported image at 600px wide for phone legibility review.

| File | Purpose |
| --- | --- |
| `.github/assets/code-route-native.png` | Single framed hello route, 2000×1600. |
| `.github/assets/code-use-native.png` | Simplified real revenue function with directive highlighted, 2000×1600. |
| `.github/assets/chart-vector-vercel.png` | Hosted int8 server-compute p50, 2000×1500. |
| `.github/assets/chart-vercel-native-vs-node.png` | First response, RSS and three CPU/request comparisons, 2000×1660. |
| `.github/assets/hero.png` | Gray/white title, neutral wordmark and code panel, 2400×1256. |
| `.github/assets/og.png` | OG variant, 1200×630. |
| `research/launch/chart-a-vercel.{svg,png}` | Legacy native-vs-Node chart; PNG identical to its `.github/assets/` copy. |
| `research/launch/chart-b-int8-vercel.{svg,png}` | Legacy hosted vector chart; PNG identical to its `.github/assets/` copy. |
| `research/launch/chart-b-int8-kernel.{svg,png}` | Separate Linux kernel chart with KERNEL ONLY label, PNG 2000×1500. |
| `research/launch/preview.html` | Review all exports at 600px wide. |
| `research/launch/recording.html` | Frozen-evidence walkthrough; charts retain their aspect ratios. |

There is no Go/TypeScript side-by-side image. The neutral `next-scriptc` wordmark identifies an independent project; no Vercel or Next.js logos are used.
