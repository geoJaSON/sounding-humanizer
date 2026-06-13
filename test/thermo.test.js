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
    calcSTP,
    calcSCP,
    analyzeSounding,
} from '../src/calc/thermo.js';
import { parseSounding } from '../src/parser/sounding.js';
import { SAMPLE_SOUNDINGS } from '../src/data/samples.js';

const approx = (a, b, tol = 1e-2) => Math.abs(a - b) <= tol;

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
    assert.ok(pulse.shear06 < 25, `pulse shear06=${pulse.shear06} kt`);
    assert.ok(pulse.stp < tor.stp, 'pulse STP should be below tornadic STP');
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
