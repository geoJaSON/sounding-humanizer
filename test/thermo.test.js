import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    es,
    mixingRatio,
    virtualTemp,
    virtualTempFromW,
    lclTemp,
    lclPressure,
    bulkShear,
    calcSRH,
    calcSTP,
    calcSCP,
    stpTerms,
    windComponents,
    dewpointFromMixingRatio,
    analyzeSounding,
} from '../src/calc/thermo.js';
import { parseSounding } from '../src/parser/sounding.js';
import { SAMPLE_SOUNDINGS } from '../src/data/samples.js';

const approx = (a, b, tol = 1e-2) => Math.abs(a - b) <= tol;

/**
 * Build levels from [p, T, Td] rows (+ optional [dir, spd]) with heights
 * integrated hypsometrically, so synthetic profiles are physically consistent.
 */
function buildLevels(rows, z0 = 0) {
    let z = z0;
    return rows.map(([p, t, td, dir = 180, spd = 10], i) => {
        if (i > 0) {
            const [pp, tp, tdp] = rows[i - 1];
            const tv = (virtualTemp(tp, tdp, pp) + virtualTemp(t, td, p)) / 2;
            z += 287.04 * tv / 9.80665 * Math.log(pp / p);
        }
        return { pressure: p, height: z, temp: t, dewpoint: td, windDir: dir, windSpd: spd };
    });
}

// A generic free troposphere to put on top of test boundary layers.
const UPPER = [
    [700, 8, -6], [600, -2, -15], [500, -13, -25], [400, -26, -38],
    [300, -42, -52], [250, -51, -60], [200, -56, -66],
];

// ---- Thermodynamic primitives ----

test('saturation vapor pressure matches Bolton reference points', () => {
    assert.ok(approx(es(0), 6.112, 1e-3), `es(0)=${es(0)}`);
    assert.ok(approx(es(20), 23.39, 0.2), `es(20)=${es(20)}`);
});

test('mixing ratio is positive and increases with temperature', () => {
    assert.ok(mixingRatio(20, 1000) > mixingRatio(10, 1000));
    assert.ok(mixingRatio(10, 1000) > 0);
});

test('virtual temperature exceeds dry temperature for moist air', () => {
    const k = virtualTemp(20, 20, 1000); // saturated
    assert.ok(k > 20 + 273.15, 'Tv should exceed T');
    // From a known mixing ratio
    assert.ok(virtualTempFromW(20, 0.015) > 20 + 273.15);
    // Dry air: Tv == T
    assert.ok(approx(virtualTempFromW(20, 0), 293.15, 1e-6));
});

test('LCL is below the surface and cooler than the parcel', () => {
    const tLcl = lclTemp(30, 20) - 273.15;
    const pLcl = lclPressure(30, 20, 1000);
    assert.ok(tLcl < 30 && tLcl > 10, `tLCL=${tLcl}`);
    assert.ok(pLcl < 1000 && pLcl > 800, `pLCL=${pLcl}`);
});

// ---- STP: m/s shear units + SPC clamps ----

test('STP shear term is interpreted in m/s, not knots', () => {
    // 20 m/s shear → shear term 1.0; all other terms 1.0 → STP 1.0.
    // If the term were fed knots (≈39), it would saturate at 1.5 here.
    assert.ok(approx(calcSTP(1500, 500, 150, 20, 0), 1.0), calcSTP(1500, 500, 150, 20, 0));
});

test('STP LCL term is clamped to 1.0 for low LCLs', () => {
    // LCL 500 m must give an LCL term of 1.0, not (2000-500)/1000 = 1.5.
    assert.ok(approx(calcSTP(1500, 500, 150, 20, 0), 1.0));
    // LCL above 2000 m zeroes the term.
    assert.equal(calcSTP(1500, 2500, 150, 20, 0), 0);
});

test('STP shear term floors below 12.5 m/s and caps at 1.5', () => {
    assert.equal(calcSTP(1500, 500, 150, 10, 0), 0); // below floor
    assert.ok(approx(calcSTP(1500, 500, 150, 40, 0), 1.5)); // above cap
});

test('STP CIN term ramps between -50 and -200 J/kg', () => {
    assert.ok(approx(calcSTP(1500, 500, 150, 20, -125), 0.5)); // (200-125)/150 = 0.5
    assert.equal(calcSTP(1500, 500, 150, 20, -250), 0); // strong cap kills it
});

// ---- SCP: m/s shear units + clamp ----

test('SCP shear term is m/s with a 10-20 ramp', () => {
    assert.equal(calcSCP(1000, 100, 5), 0); // below floor
    assert.ok(approx(calcSCP(1000, 100, 30), 1.0)); // capped at 1.0
    assert.ok(approx(calcSCP(2000, 200, 15), 3.0)); // 2 * 2 * 0.75
});

// ---- Wind interpolation across the 0/360 wrap ----

test('bulk shear interpolates through the 0/360 wrap correctly', () => {
    // Reference (surface) and the across-wrap level aloft are all near-northerly,
    // so the true shear is tiny. A naive degree average (350+10 → 180°) would
    // flip the top wind to southerly and report ~40 kt of phantom shear.
    const levels = [
        { pressure: 1000, height: 0, temp: 20, dewpoint: 10, windDir: 360, windSpd: 20 },
        { pressure: 950, height: 900, temp: 18, dewpoint: 9, windDir: 350, windSpd: 20 },
        { pressure: 900, height: 1100, temp: 15, dewpoint: 8, windDir: 10, windSpd: 20 },
    ];
    const magKt = bulkShear(levels, 0, 1000).mag * 1.94384;
    assert.ok(magKt < 5, `expected near-zero shear, got ${magKt.toFixed(1)} kt`);
});

// ---- Parcel / CAPE-CIN logic ----

test('a superadiabatic surface layer does not hide a cap above the LCL', () => {
    // Hot surface air is briefly buoyant in the lowest few hPa (superadiabatic),
    // but a warm layer near 850 hPa caps it. The LFC must be found at/above the
    // LCL — not at the ground — so the cap shows up as CIN.
    const levels = buildLevels([
        [1000, 30, 20], [990, 28, 19.8], [950, 25, 18.5], [900, 21, 16.5],
        [850, 20, 10], [800, 18, 2], [750, 13, -2], ...UPPER,
    ]);
    const a = analyzeSounding(levels);
    assert.ok(a.sbcape > 500, `sbcape=${a.sbcape}`);
    assert.ok(a.sbcin < -10, `expected a cap, got sbcin=${a.sbcin}`);
    assert.ok(a.lfcPressure < a.lclPressure, `LFC ${a.lfcPressure} should be above LCL ${a.lclPressure}`);
});

test('mixed-layer parcel averages theta and mixing ratio (well-mixed layer ≈ surface parcel)', () => {
    // Constant potential temperature and mixing ratio through the lowest
    // 100 hPa: the mixed-layer parcel IS the surface parcel. Averaging raw
    // temperature instead would start the parcel ~4 °C too cold.
    const theta = 303.15, w = 15; // K, g/kg
    const bl = [1000, 975, 950, 925, 900, 875, 850].map((p) => {
        const t = theta * Math.pow(p / 1000, 287.04 / 1005.7) - 273.15;
        return [p, t, Math.min(t, dewpointFromMixingRatio(w, p))];
    });
    const levels = buildLevels([...bl, [800, 14, 4], [750, 10, -2], ...UPPER]);
    const a = analyzeSounding(levels);
    assert.ok(a.sbcape > 1000, `sbcape=${a.sbcape}`);
    assert.ok(Math.abs(a.mlcape - a.sbcape) / a.sbcape < 0.05,
        `mlcape ${a.mlcape} should match sbcape ${a.sbcape} in a well-mixed layer`);
});

test('a stable profile has no LFC, CAPE, CIN or EL', () => {
    const levels = buildLevels([
        [1000, 5, 0], [950, 6, -2], [900, 5, -6], [850, 3, -10], [700, -6, -20],
        [500, -22, -35], [300, -45, -55], [200, -55, -65],
    ]);
    const a = analyzeSounding(levels);
    assert.equal(a.sbcape, 0);
    assert.equal(a.sbcin, 0);
    assert.equal(a.lfcHeight, null);
    assert.equal(a.elHeight, null);
});

test('lapse rate is null (not 0) when 700 hPa is below ground', () => {
    const levels = buildLevels([
        [690, 20, 0], [650, 16, -3], [600, 11, -7], [550, 5, -12], [500, -1, -18],
        [400, -15, -30], [300, -32, -45], [200, -52, -62],
    ], 3100);
    const a = analyzeSounding(levels);
    assert.equal(a.lr700_500, null);
    assert.ok(Number.isFinite(a.lr03));
});

// ---- SRH layer boundaries ----

test('SRH closes the layer with a wind interpolated at the layer top', () => {
    // Levels at 0, 600 and 1200 m. 0–1 km SRH must include the 600–1000 m
    // segment, so adding an explicit level at 1000 m (on the interpolated
    // wind) must not change the result.
    const base = [
        { pressure: 1000, height: 0, temp: 25, dewpoint: 18, windDir: 150, windSpd: 15 },
        { pressure: 935, height: 600, temp: 21, dewpoint: 16, windDir: 200, windSpd: 35 },
        { pressure: 870, height: 1200, temp: 17, dewpoint: 13, windDir: 240, windSpd: 45 },
    ];
    const a = windComponents(200, 35), b = windComponents(240, 45);
    const f = (1000 - 600) / (1200 - 600);
    const u = a.u + f * (b.u - a.u), v = a.v + f * (b.v - a.v);
    const spd = Math.hypot(u, v) / 0.51444;
    const dir = (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360;
    const withTop = [base[0], base[1],
        { pressure: 892, height: 1000, temp: 18, dewpoint: 14, windDir: dir, windSpd: spd }, base[2]];

    const storm = { u: 5, v: -2 };
    const s1 = calcSRH(base, 0, 1000, storm.u, storm.v);
    const s2 = calcSRH(withTop, 0, 1000, storm.u, storm.v);
    assert.ok(approx(s1, s2, 1e-6), `${s1} vs ${s2}`);
});

test('STP terms multiply to STP and expose the limiting ingredient', () => {
    const t = stpTerms(3000, 2500, 300, 25, 0); // LCL above 2000 m zeroes its term
    assert.equal(t.lcl, 0);
    assert.equal(calcSTP(3000, 2500, 300, 25, 0), 0);
    assert.ok(t.cape > 1 && t.srh > 1 && t.shear > 1);
});

// ---- Integration over the bundled samples ----

function analyzeSample(key) {
    const s = SAMPLE_SOUNDINGS[key];
    const { levels } = parseSounding(s.raw, s.station, s.time);
    return analyzeSounding(levels);
}

test('tornadic sample yields a strongly unstable, sheared, tornadic profile', () => {
    const a = analyzeSample('tornadic');
    assert.ok(a.sbcape > 500, `sbcape=${a.sbcape}`);
    assert.ok(a.mucape >= a.sbcape, 'MUCAPE must be >= SBCAPE');
    assert.ok(a.shear06 > 50, `shear06=${a.shear06} kt`); // strong deep shear
    assert.ok(a.stp > 0 && Number.isFinite(a.stp), `stp=${a.stp}`);
    assert.ok(a.scp > 0 && Number.isFinite(a.scp), `scp=${a.scp}`);
    // EL must sit above the LFC when both are defined.
    if (a.lfcHeight != null && a.elHeight != null) {
        assert.ok(a.elHeight > a.lfcHeight, 'EL should be above LFC');
    }
});

test('pulse sample is unstable but weakly sheared, with low tornado potential', () => {
    const pulse = analyzeSample('pulse');
    const tor = analyzeSample('tornadic');
    assert.ok(pulse.sbcape > 1500 && pulse.sbcape < 5000, `pulse sbcape=${pulse.sbcape}`);
    assert.ok(pulse.shear06 < 25, `pulse shear06=${pulse.shear06} kt`);
    assert.ok(pulse.stp < tor.stp, 'pulse STP should be below tornadic STP');
});

test('elevated sample has its instability above a stable surface layer', () => {
    const a = analyzeSample('elevated');
    assert.ok(a.mucape > 1000, `mucape=${a.mucape}`);
    assert.ok(a.sbcape < 0.25 * a.mucape, `sbcape=${a.sbcape} should be small vs mucape`);
    assert.ok(a.muHeight > 500, `MU source should be well above ground, got ${a.muHeight} m`);
});

test('sample heights are hypsometrically realistic (500 hPa near 5.5–6 km)', () => {
    // Inflated heights inflate CAPE (∫ g·B dz); guard against regressions.
    for (const key of Object.keys(SAMPLE_SOUNDINGS)) {
        const { levels } = parseSounding(SAMPLE_SOUNDINGS[key].raw);
        const h500 = levels.find((l) => l.pressure === 500)?.height;
        assert.ok(h500 > 5400 && h500 < 6000, `${key} 500 hPa height ${h500} m`);
    }
});

test('every analysis field is finite', () => {
    for (const key of Object.keys(SAMPLE_SOUNDINGS)) {
        const a = analyzeSample(key);
        for (const [k, v] of Object.entries(a)) {
            if (typeof v === 'number') {
                assert.ok(Number.isFinite(v), `${key}.${k} = ${v}`);
            }
        }
    }
});
