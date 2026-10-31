# Launch graphics redesign

Four directions (see `DIRECTIONS.md`) × nine graphics = 36 PNG variants for review. The published assets in `.github/assets/` and `research/launch/*.png` are not touched by anything here.

```sh
npm ci --prefix research/launch
node research/launch/redesign/generate.mjs      # sources, PNGs, manifest, gallery
node research/launch/redesign/validate.mjs      # render contract + numbers + caveats
open research/launch/redesign/index.html        # comparison gallery
```

`--only=memory,hero` regenerates a subset; `--html-only` writes sources without Chrome.

| Path | Contents |
| --- | --- |
| `index.html` | Gallery: switch by graphic or by direction, compare with the published original, view at 600px / 375px. Methods and sources live in the notes under each graphic. |
| `png/<graphic>--<direction>.png` | 2x exports. Charts 2400×1600, hero 2400×1256, OG 1200×630, code 2048×1152 / 2000×1600. |
| `src/<graphic>--<direction>.html` | Layout source per variant (HTML/CSS, inline SVG tallies). Open directly to inspect. |
| `generate.mjs`, `gallery.mjs`, `validate.mjs` | Generator, gallery writer and validator. |
| `manifest.json` | Dimensions, bytes and in-page QA per variant (fonts, bounds, overlap, smallest text, rendered text). |
| `data-extra.json` | Measured values used only in gallery notes (vector RSS, after-load RSS, Markdown CPU), with source locators. |
| `fonts/` | Instrument Serif (SIL OFL 1.1, notice included) for the Editorial direction. Geist comes from the pinned `geist` dependency. |

Numbers come from `../chart-data.json` and `data-extra.json`. The generator rechecks every value against its report text. The validator recomputes the displayed values and ratios on its own, rejects any decimal on a chart that it can't trace to a measurement, and checks that each chart keeps its scope caveat.

The original five-panel native-vs-Node chart is split into three single-takeaway graphics: `cpu-per-request`, `memory` and `first-response`.
