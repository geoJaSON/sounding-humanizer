# Weather Sounding Humanizer

Fetch an upper-air sounding, see it as an interactive **Skew-T / Log-P** and **hodograph**, and read a plain-language severe-weather briefing generated from the computed parameters.

> ⚠️ **For education and visualization only — not for operational forecasting or life-safety decisions.** Calculations use standard but simplified formulas and idealized parcel assumptions. Always rely on official sources such as the [NWS](https://www.weather.gov/) and [SPC](https://www.spc.noaa.gov/) for real forecasts and warnings.

## Features

- **Live data** from the University of Wyoming upper-air archive, by station and date/time (00Z / 12Z).
- **Bundled examples** — explore the app instantly (and offline) with three archetype profiles: tornadic supercell, elevated/derecho, and summer pulse.
- **Interactive Skew-T** — temperature/dewpoint traces, dry/moist adiabats, lifted parcel path, CAPE/CIN shading, wind barbs, and LCL/LFC/EL markers.
- **Interactive hodograph** — height-colored wind trace, Bunkers storm-motion vectors, and 0–3 km SRH shading.
- **Computed parameters** — SBCAPE/MLCAPE/MUCAPE, CIN, LCL/LFC/EL, 0–1 & 0–6 km shear, 0–1 & 0–3 km SRH, STP, SCP, PW, and lapse rates.
- **Humanized briefing** — instability, wind shear, severe potential, and moisture each explained in prose with a severity rating.

## Getting started

```bash
npm install
npm run dev      # Vite dev server at http://localhost:3000 (proxies the data API)
npm run build    # production build → dist/
npm run preview  # preview the production build
npm test         # run the calculation/parser test suite (Node's built-in runner)
```

The dev server proxies `/api/sounding` to the University of Wyoming so the browser isn't blocked by CORS. In production the same path is served by the Vercel function in [`api/sounding.js`](api/sounding.js).

## How it works

```
fetch (api/sounding.js)  →  parse (src/parser)  →  analyze (src/calc/thermo.js)
                                                      ├→ visualize (src/viz: skewt, hodograph)
                                                      └→ humanize (src/analysis/humanizer.js)
```

- **`src/calc/thermo.js`** — thermodynamic & kinematic engine. Buoyancy is integrated from **virtual temperature** (Doswell & Rasmussen 1994). STP and SCP follow the SPC fixed-layer definitions (shear terms in m/s, with the standard clamps).
- **`src/parser/sounding.js`** — parses the UWyo `TEXT:LIST` format, mapping columns from the header and dropping levels with missing/sentinel values.
- **`src/viz/`** — canvas renderers. The static grid and data traces are cached to an offscreen canvas, so hovering only re-blits + draws the cursor (no adiabat recomputation per frame).

## Tests

Pure calculation and parsing logic is covered by [`test/`](test/) and runs with `node --test` — no test framework dependency. The suite includes regression guards for the parameter formulas (e.g. STP/SCP shear units) and the parser's missing-data handling.

## Data source & attribution

Upper-air data © [University of Wyoming, Department of Atmospheric Science](https://weather.uwyo.edu/upperair/sounding.html). This project is an independent, non-commercial educational tool and is not affiliated with or endorsed by the University of Wyoming. Please respect their service — responses are cached, and you should avoid high request volumes.

## Deployment

Configured for [Vercel](https://vercel.com): `vercel.json` builds with Vite and serves `api/sounding.js` as a serverless function. Any static host works for the front end if you provide an equivalent `/api/sounding` proxy.
