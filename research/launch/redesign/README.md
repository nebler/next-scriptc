# Launch graphics redesign

Four directions (see `DIRECTIONS.md`) × nine graphics = 36 PNG variants for review. The published assets in `.github/assets/` and `research/launch/*.png` are not touched by anything here.

```sh
npm ci --prefix research/launch
node research/launch/redesign/generate.mjs      # sources, PNGs, manifest, gallery
node research/launch/redesign/validate.mjs      # render contract + numbers + caveats
open research/launch/redesign/spec-sheet.html   # chosen direction, revised (one graphic at a time)
open research/launch/redesign/index.html        # four-direction comparison gallery
```

`--only=memory,hero` regenerates a subset of graphics and `--dirs=c-spec` a subset of directions (so approved variants are not re-rendered); `--html-only` writes sources without Chrome.

**Spec Sheet revision (chosen direction).** Charts keep the two-column frame with the chart alone on the right and every word (headline, a scope label directly under it, description, method, caveat) on the left; no top kicker. Revisions live in each chart's `spec` override, so Monolith, Editorial and Signal exports are unchanged. New Spec-Sheet-only chart `vector-memory` (four runtimes, same hosted vector run). The route code shows a function-level `"use native"` in `route.ts` (the generator runs the real extractor on it). The approved OG and the hero are unchanged; the validator pins the OG hash.

| Path | Contents |
| --- | --- |
| `spec-sheet.html` | Spec Sheet only: each revised graphic on its own, expandable methods, the full-request (network-included) vector table and where matched Go data does and doesn't exist. |
| `index.html` | Gallery: switch by graphic or by direction, compare with the published original, view at 600px / 375px. Methods and sources live in the notes under each graphic. |
| `png/<graphic>--<direction>.png` | 2x exports. Charts 2400×1600, hero 2400×1256, OG 1200×630, code 2048×1152 / 2000×1600. |
| `src/<graphic>--<direction>.html` | Layout source per variant (HTML/CSS, inline SVG tallies). Open directly to inspect. |
| `generate.mjs`, `gallery.mjs`, `validate.mjs` | Generator, gallery writer and validator. |
| `manifest.json` | Dimensions, bytes and in-page QA per variant (fonts, bounds, overlap, smallest text, rendered text). |
| `data-extra.json` | Measured values outside `../chart-data.json` with source locators: vector RSS (drawn in `vector-memory`), vector full-request and 4-concurrent times, vector CPU, after-load RSS, Markdown CPU. Both generator and validator check each against its report row. |
| `fonts/` | Instrument Serif (SIL OFL 1.1, notice included) for the Editorial direction. Geist comes from the pinned `geist` dependency. |

Numbers come from `../chart-data.json` and `data-extra.json`. The generator rechecks every value against its report text. The validator recomputes the displayed values and ratios on its own, rejects any decimal on a chart that it can't trace to a measurement, and checks that each chart keeps its scope caveat.

The original five-panel native-vs-Node chart is split into three single-takeaway graphics: `cpu-per-request`, `memory` and `first-response`.
