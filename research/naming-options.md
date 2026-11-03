# Product naming options

No package is renamed in P4. These options need a maintainer decision.

| Product name | Package layout | Benefits | Costs and migration |
|---|---|---|---|
| scriptc Promote | Keep scriptc-promote for core and adapters; keep next-scriptc for Next | Describes promotion; matches the broadest existing package | Low cost: unify headings and CLI help. Two package names remain visible. Requires checking upstream naming expectations before public branding. |
| scriptc Promote | scriptc-promote plus scriptc-promote/next | One install and one adapter import family | Medium to high: move Next assets and peer dependencies, preserve next-scriptc compatibility exports and bin aliases, update every fixture and packed-install test. |
| TypeLift | @typelift/core, @typelift/next, adapter subpaths in core | Distinct name; separates the product from its compiler dependency | High: new scope and packages, compatibility shims, CLI migration, lockfile changes. Availability and trademark suitability are unverified. |
| Native TypeScript | @native-typescript/core and @native-typescript/next | Explains the source language and output | High: same package migration; broad name implies coverage and speed the experiment does not yet offer. Availability is unverified. |

Prefer the first option for the next documentation pass. It has the lowest
migration cost while real-app value and compiler coverage remain under evaluation.
None of these names has been checked for registry, domain, or legal availability.
