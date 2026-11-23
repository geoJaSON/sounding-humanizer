import { test } from 'node:test';
import assert from 'node:assert/strict';
import { humanize, isElevated } from '../src/analysis/humanizer.js';
import { analyzeSounding } from '../src/calc/thermo.js';
import { parseSounding } from '../src/parser/sounding.js';
import { SAMPLE_SOUNDINGS } from '../src/data/samples.js';

/** A neutral analysis object; override fields per test. */
function analysis(over = {}) {
    return {
        sbcape: 0, sbcin: 0, mlcape: 0, mlcin: 0, mucape: 0, mucin: 0,
        muPressure: 1000, muHeight: 0, sfcPressure: 1000,
        lclHeight: 800, lfcHeight: null, elHeight: null,
        shear01: 10, shear06: 20, srh01: 50, srh03: 80,
        lr03: 7, lr700_500: 6.5, pw: 1.0,
        stp: 0, stpTerms: { cape: 0, lcl: 1, srh: 0.3, shear: 0.5, cin: 1 }, scp: 0,
        ...over,
    };
}

const text = (h) => [h.headline, ...h.sections.map((s) => s.body), ...h.hazards.map((z) => z.text)].join(' ');

test('headline describes CAPE with the word that matches its size', () => {
    // Huge CAPE with weak shear rates "Marginal" overall — but the CAPE itself
    // must not be called "moderate".
    const h = humanize(analysis({ sbcape: 6000, mlcape: 5000, mucape: 6000, lfcHeight: 900, shear06: 10 }));
    assert.equal(h.severity.level, 'marginal');
    assert.doesNotMatch(h.headline, /moderate instability/i);
    assert.match(h.headline, /6,000 J\/kg/);
});

test('no LFC: CIN is not described as "no cap, storms fire easily"', () => {
    const h = humanize(analysis());
    const instability = h.sections.find((s) => s.id === 'instability').body;
    assert.doesNotMatch(instability, /little or no cap|form with minimal forcing/i);
    assert.match(instability, /isn't meaningful/);
    assert.equal(h.severity.level, 'low');
});

test('elevated instability is recognized and steers away from tornado language', () => {
    const a = analysis({
        mucape: 2000, muHeight: 1200, muPressure: 850, mucin: -20,
        shear06: 60, shear01: 35, srh01: 350, srh03: 450, scp: 9, lr700_500: 8,
    });
    assert.ok(isElevated(a));
    const h = humanize(a);
    assert.notEqual(h.severity.level, 'low');
    assert.match(h.headline, /elevated/);
    const tor = h.hazards.find((z) => z.name === 'Tornadoes');
    assert.match(tor.text, /Unlikely/);
    assert.ok(h.hazards.some((z) => z.name === 'Hail'));
    assert.doesNotMatch(h.sections.find((s) => s.id === 'shear').body, /key ingredient for strong tornadoes/);
});

test('high-shear, low-CAPE setups are called out', () => {
    const h = humanize(analysis({
        sbcape: 350, mlcape: 300, mucape: 350, lfcHeight: 700, shear06: 55,
        srh01: 250, srh03: 350, stp: 0.6, scp: 1.2,
    }));
    assert.equal(h.severity.level, 'marginal'); // capped by weak instability
    assert.match(h.headline, /high-shear, low-CAPE/);
    assert.ok(h.hazards.some((z) => z.name === 'Tornadoes'));
});

test('STP explanation names the missing ingredient', () => {
    const h = humanize(analysis({
        sbcape: 3000, mlcape: 2500, mucape: 3000, lfcHeight: 2600, lclHeight: 2400,
        shear06: 50, srh01: 300, stp: 0,
        stpTerms: { cape: 2, lcl: 0, srh: 2, shear: 1.5, cin: 1 },
    }));
    const severe = h.sections.find((s) => s.id === 'severe').body;
    assert.match(severe, /cloud bases that are too high/);
});

test('every sample briefing renders cleanly', () => {
    for (const [key, s] of Object.entries(SAMPLE_SOUNDINGS)) {
        const h = humanize(analyzeSounding(parseSounding(s.raw).levels));
        const all = text(h) + h.sections.flatMap((x) => x.chips.map((c) => c.value)).join(' ');
        assert.doesNotMatch(all, /undefined|NaN|null/, key);
        assert.ok(h.hazards.length > 0, `${key} should list hazards`);
    }
});

test('samples get the briefing their archetype implies', () => {
    const h = (key) => humanize(analyzeSounding(parseSounding(SAMPLE_SOUNDINGS[key].raw).levels));

    const tor = h('tornadic');
    assert.ok(['high', 'extreme'].includes(tor.severity.level));
    assert.match(tor.hazards.find((z) => z.name === 'Tornadoes').text, /Significant/);

    const elev = h('elevated');
    assert.match(elev.headline, /elevated/);
    assert.match(elev.hazards.find((z) => z.name === 'Tornadoes').text, /Unlikely/);

    const pulse = h('pulse');
    assert.equal(pulse.severity.level, 'marginal');
    assert.match(pulse.headline, /pulse-type/);
    assert.ok(pulse.hazards.some((z) => z.name === 'Flooding'));
});
