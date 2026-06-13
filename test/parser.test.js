import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSounding } from '../src/parser/sounding.js';

test('parses a simple 6-column sounding, surface-first', () => {
    const raw = `PRES   HGHT   TEMP   DWPT   DRCT   SKNT
1000.0    100   25.0   20.0    180    10
 925.0    800   20.0   15.0    200    20
 850.0   1500   15.0   10.0    220    30
 700.0   3200    5.0   -5.0    250    40
 500.0   5800  -10.0  -20.0    270    50`;

    const { levels } = parseSounding(raw);
    assert.equal(levels.length, 5);
    // Sorted by descending pressure (surface first)
    assert.equal(levels[0].pressure, 1000);
    assert.equal(levels[4].pressure, 500);
    assert.deepEqual(
        {
            t: levels[0].temp,
            td: levels[0].dewpoint,
            dir: levels[0].windDir,
            spd: levels[0].windSpd,
        },
        { t: 25, td: 20, dir: 180, spd: 10 }
    );
});

test('maps columns from an 11-column UWyo header', () => {
    const raw = `   PRES   HGHT   TEMP   DWPT   RELH   MIXR   DRCT   SKNT   THTA   THTE   THTV
 1000.0    100   25.0   20.0     74  15.30    180     10  300.0  340.0  302.0
  850.0   1500   15.0   10.0     71   9.20    220     30  305.0  330.0  307.0
  700.0   3200    5.0   -5.0     48   3.40    250     40  315.0  330.0  316.0
  500.0   5800  -10.0  -20.0     45   1.10    270     50  330.0  338.0  331.0`;

    const { levels } = parseSounding(raw);
    assert.equal(levels.length, 4);
    // DRCT/SKNT are columns 6/7, not 4/5 — verify they were read correctly.
    assert.equal(levels[0].windDir, 180);
    assert.equal(levels[0].windSpd, 10);
    assert.equal(levels[3].windDir, 270);
});

test('drops levels that have thermo data but no wind columns', () => {
    // The 850 hPa row stops after MIXR — emitting it would feed undefined/NaN
    // wind into the hodograph and shear/SRH math.
    const raw = `   PRES   HGHT   TEMP   DWPT   RELH   MIXR   DRCT   SKNT   THTA   THTE   THTV
 1000.0    100   25.0   20.0     74  15.30    180     10  300.0  340.0  302.0
  925.0    800   20.0   15.0     72  11.80    200     20  302.0  336.0  304.0
  850.0   1500   15.0   10.0     71   9.20
  700.0   3200    5.0   -5.0     48   3.40    250     40  315.0  330.0  316.0
  500.0   5800  -10.0  -20.0     45   1.10    270     50  330.0  338.0  331.0`;

    const { levels } = parseSounding(raw);
    assert.equal(levels.length, 4);
    assert.ok(!levels.some((l) => l.pressure === 850), '850 hPa level should be dropped');
    // Every surviving level must have finite wind.
    for (const l of levels) {
        assert.ok(Number.isFinite(l.windDir) && Number.isFinite(l.windSpd));
    }
});

test('rejects out-of-range sentinel values', () => {
    const raw = `PRES   HGHT   TEMP   DWPT   DRCT   SKNT
1000.0    100   25.0   20.0    180    10
 925.0    800   20.0   15.0    999   999
 850.0   1500   15.0   10.0    220    30
 700.0   3200    5.0   -5.0    250    40
 500.0   5800  -10.0  -20.0    270    50`;

    const { levels } = parseSounding(raw);
    // The 999/999 wind row is a sentinel and must be dropped.
    assert.equal(levels.length, 4);
    assert.ok(!levels.some((l) => l.windSpd === 999));
});
