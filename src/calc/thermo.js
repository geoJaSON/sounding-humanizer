/**
 * Thermodynamic & Kinematic Calculations
 * Standard meteorological formulas for sounding analysis
 */

const Rd = 287.04;    // Gas constant for dry air (J/kg/K)
const Rv = 461.5;     // Gas constant for water vapor
const Cp = 1005.7;    // Specific heat at const pressure
const Lv = 2.501e6;   // Latent heat of vaporization
const g = 9.80665;    // Gravity
const eps = Rd / Rv;  // 0.622

/** Convert Celsius to Kelvin */
function CtoK(c) { return c + 273.15; }
/** Convert Kelvin to Celsius */
function KtoC(k) { return k - 273.15; }
/** Convert knots to m/s */
function ktsToMs(kts) { return kts * 0.51444; }

/**
 * Saturation vapor pressure (Bolton 1980) in hPa
 */
function es(tc) {
    return 6.112 * Math.exp((17.67 * tc) / (tc + 243.5));
}

/**
 * Mixing ratio in g/kg given temperature (°C) and pressure (hPa)
 */
function mixingRatio(tc, p) {
    const e = es(tc);
    return (1000 * eps * e) / (p - e);
}

/**
 * Virtual temperature in K
 */
function virtualTemp(tc, tdc, p) {
    const w = mixingRatio(tdc, p) / 1000; // kg/kg
    return CtoK(tc) * (1 + 0.61 * w);
}

/**
 * Theta-e (equivalent potential temperature) in K
 * Simplified Bolton formula
 */
function thetaE(tc, tdc, p) {
    const tk = CtoK(tc);
    const w = mixingRatio(tdc, p) / 1000;
    const theta = tk * Math.pow(1000 / p, 0.2854 * (1 - 0.28 * w));
    return theta * Math.exp((3.376 / lclTemp(tc, tdc) - 0.00254) * w * 1000 * (1 + 0.81 * w));
}

/**
 * Temperature at LCL (K) using Bolton approximation
 */
function lclTemp(tc, tdc) {
    const tk = CtoK(tc);
    const tdk = CtoK(tdc);
    return 1 / (1 / (tdk - 56) + Math.log(tk / tdk) / 800) + 56;
}

/**
 * LCL pressure using Poisson equation
 */
function lclPressure(tc, tdc, p) {
    const tlcl = lclTemp(tc, tdc);
    const tk = CtoK(tc);
    return p * Math.pow(tlcl / tk, 1 / 0.2854);
}

/**
 * Dry adiabatic lapse rate temperature at pressure p2, starting at T (°C) and p1
 */
function dryAdiabat(tc, p1, p2) {
    const tk = CtoK(tc);
    return KtoC(tk * Math.pow(p2 / p1, Rd / Cp));
}

/**
 * Moist adiabatic temperature at pressure p given starting temp (°C) and pressure
 * Uses iterative step method
 */
function moistAdiabat(tc, pStart, pEnd, steps = 200) {
    let t = CtoK(tc);
    let p = pStart;
    const dp = (pEnd - pStart) / steps;

    for (let i = 0; i < steps; i++) {
        const w = mixingRatio(KtoC(t), p) / 1000;
        const gamma_m = (Rd * t + Lv * w) / (Cp + (Lv * Lv * w * eps) / (Rd * t * t));
        const dtdp = gamma_m / p;
        t += dtdp * dp;
        p += dp;
    }
    return KtoC(t);
}

/**
 * Lift a parcel from surface, following dry adiabat to LCL then moist adiabat above.
 * Returns array of {pressure, temp} for the parcel path.
 */
function liftParcel(tSfc, tdSfc, pSfc, levels) {
    const pLCL = lclPressure(tSfc, tdSfc, pSfc);
    const tLCL = KtoC(lclTemp(tSfc, tdSfc));

    const parcel = [];

    for (const lev of levels) {
        if (lev.pressure > pSfc) continue;

        let parcelT;
        if (lev.pressure >= pLCL) {
            // Below LCL: dry adiabat
            parcelT = dryAdiabat(tSfc, pSfc, lev.pressure);
        } else {
            // Above LCL: moist adiabat
            parcelT = moistAdiabat(tLCL, pLCL, lev.pressure);
        }

        parcel.push({ pressure: lev.pressure, temp: parcelT });
    }

    return { parcel, pLCL, tLCL };
}

/**
 * Interpolate temperature or wind at a given pressure level
 */
function interpAtPressure(levels, pTarget, field) {
    for (let i = 0; i < levels.length - 1; i++) {
        const a = levels[i], b = levels[i + 1];
        if ((a.pressure >= pTarget && b.pressure <= pTarget) ||
            (a.pressure <= pTarget && b.pressure >= pTarget)) {
            const frac = (Math.log(pTarget) - Math.log(a.pressure)) / (Math.log(b.pressure) - Math.log(a.pressure));
            return a[field] + frac * (b[field] - a[field]);
        }
    }
    return null;
}

/**
 * Interpolate height at a given pressure level
 */
function heightAtPressure(levels, pTarget) {
    return interpAtPressure(levels, pTarget, 'height');
}

/**
 * Find the pressure at a given height AGL
 */
function pressureAtHeight(levels, hTarget) {
    const sfcH = levels[0].height;
    const target = sfcH + hTarget;

    for (let i = 0; i < levels.length - 1; i++) {
        const a = levels[i], b = levels[i + 1];
        if ((a.height <= target && b.height >= target) ||
            (a.height >= target && b.height <= target)) {
            const frac = (target - a.height) / (b.height - a.height);
            return a.pressure + frac * (b.pressure - a.pressure);
        }
    }
    return levels[levels.length - 1].pressure;
}

/**
 * Calculate CAPE and CIN for a given parcel path
 */
function calcCAPE_CIN(levels, parcel) {
    let cape = 0, cin = 0;
    let lfc = null, el = null;

    for (let i = 0; i < parcel.length - 1; i++) {
        const p1 = parcel[i].pressure;
        const p2 = parcel[i + 1].pressure;
        const parcelT1 = CtoK(parcel[i].temp);
        const parcelT2 = CtoK(parcel[i + 1].temp);

        const envT1 = interpAtPressure(levels, p1, 'temp');
        const envT2 = interpAtPressure(levels, p2, 'temp');
        if (envT1 === null || envT2 === null) continue;

        const envTv1 = CtoK(envT1);
        const envTv2 = CtoK(envT2);

        const buoy1 = (parcelT1 - envTv1) / envTv1;
        const buoy2 = (parcelT2 - envTv2) / envTv2;
        const avgBuoy = (buoy1 + buoy2) / 2;

        const z1 = heightAtPressure(levels, p1);
        const z2 = heightAtPressure(levels, p2);
        if (z1 === null || z2 === null) continue;
        const dz = z2 - z1;

        const energy = g * avgBuoy * dz;

        if (energy > 0) {
            cape += energy;
            if (!lfc) {
                lfc = { pressure: p1, height: z1 };
            }
            el = { pressure: p2, height: z2 };
        } else {
            if (!lfc) cin += energy;
        }
    }

    return { cape: Math.max(0, cape), cin: Math.min(0, cin), lfc, el };
}

/**
 * Mixed-layer average (bottom 100 hPa)
 */
function mixedLayerAvg(levels, depth = 100) {
    const sfcP = levels[0].pressure;
    const topP = sfcP - depth;
    let tSum = 0, tdSum = 0, count = 0;

    for (const lev of levels) {
        if (lev.pressure < topP) break;
        if (lev.pressure > sfcP) continue;
        tSum += lev.temp;
        tdSum += lev.dewpoint;
        count++;
    }

    if (count === 0) return { temp: levels[0].temp, dewpoint: levels[0].dewpoint };
    return { temp: tSum / count, dewpoint: tdSum / count };
}

/**
 * Find Most Unstable parcel (max theta-e in lowest 300 hPa)
 */
function mostUnstableParcel(levels) {
    const sfcP = levels[0].pressure;
    const topP = sfcP - 300;
    let maxThetaE = -Infinity;
    let muLevel = levels[0];

    for (const lev of levels) {
        if (lev.pressure < topP) break;
        const te = thetaE(lev.temp, lev.dewpoint, lev.pressure);
        if (te > maxThetaE) {
            maxThetaE = te;
            muLevel = lev;
        }
    }

    return muLevel;
}

/**
 * Wind components (u, v) in m/s from direction and speed in knots
 */
function windComponents(dir, spd) {
    const spdMs = ktsToMs(spd);
    const rad = (dir * Math.PI) / 180;
    return {
        u: -spdMs * Math.sin(rad),
        v: -spdMs * Math.cos(rad),
    };
}

/**
 * Mean wind in a layer (pressure-weighted average of u, v)
 */
function meanWind(levels, pBot, pTop) {
    let uSum = 0, vSum = 0, wSum = 0;

    for (const lev of levels) {
        if (lev.pressure > pBot || lev.pressure < pTop) continue;
        const { u, v } = windComponents(lev.windDir, lev.windSpd);
        const w = lev.pressure; // pressure weight
        uSum += u * w;
        vSum += v * w;
        wSum += w;
    }

    if (wSum === 0) return { u: 0, v: 0 };
    return { u: uSum / wSum, v: vSum / wSum };
}

/**
 * Bulk wind shear between two height layers (m AGL)
 */
function bulkShear(levels, hBot, hTop) {
    const pBot = pressureAtHeight(levels, hBot);
    const pTop = pressureAtHeight(levels, hTop);

    const dirBot = interpAtPressure(levels, pBot, 'windDir');
    const spdBot = interpAtPressure(levels, pBot, 'windSpd');
    const dirTop = interpAtPressure(levels, pTop, 'windDir');
    const spdTop = interpAtPressure(levels, pTop, 'windSpd');

    if (dirBot == null || spdBot == null || dirTop == null || spdTop == null) return { mag: 0, u: 0, v: 0 };

    const bot = windComponents(dirBot, spdBot);
    const top = windComponents(dirTop, spdTop);

    const du = top.u - bot.u;
    const dv = top.v - bot.v;
    const mag = Math.sqrt(du * du + dv * dv);

    return { mag, u: du, v: dv };
}

/**
 * Bunkers storm motion (right-mover and left-mover)
 */
function bunkersMotion(levels) {
    const sfcP = levels[0].pressure;
    const p6km = pressureAtHeight(levels, 6000);

    const mw = meanWind(levels, sfcP, p6km);

    const shear = bulkShear(levels, 0, 6000);

    const d = 7.5; // deviation magnitude m/s
    const shearMag = Math.sqrt(shear.u * shear.u + shear.v * shear.v);
    if (shearMag === 0) {
        return {
            right: { u: mw.u, v: mw.v },
            left: { u: mw.u, v: mw.v },
        };
    }

    const crossU = shear.v / shearMag;
    const crossV = -shear.u / shearMag;

    return {
        right: { u: mw.u + d * crossU, v: mw.v + d * crossV },
        left: { u: mw.u - d * crossU, v: mw.v - d * crossV },
    };
}

/**
 * Storm-Relative Helicity (SRH) in m²/s²
 */
function calcSRH(levels, hBot, hTop, stormU, stormV) {
    const sfcH = levels[0].height;
    let srh = 0;

    const layerLevels = levels.filter(l => {
        const agl = l.height - sfcH;
        return agl >= hBot && agl <= hTop;
    });

    for (let i = 0; i < layerLevels.length - 1; i++) {
        const a = layerLevels[i], b = layerLevels[i + 1];
        const wa = windComponents(a.windDir, a.windSpd);
        const wb = windComponents(b.windDir, b.windSpd);

        const sru1 = wa.u - stormU;
        const srv1 = wa.v - stormV;
        const sru2 = wb.u - stormU;
        const srv2 = wb.v - stormV;

        srh += (sru2 * srv1) - (sru1 * srv2);
    }

    return srh;
}

/**
 * Lapse rate between two heights in °C/km
 */
function lapseRate(levels, hBot, hTop) {
    const pBot = pressureAtHeight(levels, hBot);
    const pTop = pressureAtHeight(levels, hTop);
    const tBot = interpAtPressure(levels, pBot, 'temp');
    const tTop = interpAtPressure(levels, pTop, 'temp');
    if (tBot == null || tTop == null) return 0;
    return -((tTop - tBot) / ((hTop - hBot) / 1000));
}

/**
 * 700-500 hPa lapse rate
 */
function lapseRate700_500(levels) {
    const t700 = interpAtPressure(levels, 700, 'temp');
    const t500 = interpAtPressure(levels, 500, 'temp');
    const h700 = heightAtPressure(levels, 700);
    const h500 = heightAtPressure(levels, 500);
    if (t700 == null || t500 == null || h700 == null || h500 == null) return 0;
    return -((t500 - t700) / ((h500 - h700) / 1000));
}

/**
 * Precipitable water in inches
 */
function precipitableWater(levels) {
    let pw = 0;
    for (let i = 0; i < levels.length - 1; i++) {
        const a = levels[i], b = levels[i + 1];
        const w1 = mixingRatio(a.dewpoint, a.pressure) / 1000;
        const w2 = mixingRatio(b.dewpoint, b.pressure) / 1000;
        const dp = (a.pressure - b.pressure) * 100; // Pa
        pw += ((w1 + w2) / 2) * dp / g;
    }
    return pw / 25.4; // kg/m² to inches
}

/**
 * Calculate Significant Tornado Parameter (STP)
 */
function calcSTP(sbcape, lcl, srh01, shear06, cin) {
    const lclTerm = lcl < 1000 ? ((2000 - lcl) / 1000) : (lcl < 2000 ? ((2000 - lcl) / 1000) : 0);
    const shearTerm = Math.min(shear06 / 20, 1.5);
    const cinTerm = cin > -50 ? 1 : (cin > -150 ? ((200 + cin) / 150) : 0);
    const capeTerm = sbcape / 1500;
    const srhTerm = srh01 / 150;

    return capeTerm * lclTerm * srhTerm * shearTerm * cinTerm;
}

/**
 * Calculate Supercell Composite Parameter (SCP)
 */
function calcSCP(mucape, srh03, shear06) {
    const capeTerm = mucape / 1000;
    const srhTerm = srh03 / 100;
    const shearTerm = shear06 / 20;
    return capeTerm * srhTerm * shearTerm;
}


/**
 * Full analysis of a sounding
 * @param {SoundingLevel[]} levels
 * @returns {Object} All computed parameters and parcel data
 */
export function analyzeSounding(levels) {
    if (!levels || levels.length < 5) {
        return null;
    }

    const sfc = levels[0];
    const sfcH = sfc.height;

    // ---- Parcel computations ----

    // Surface-based
    const sbLift = liftParcel(sfc.temp, sfc.dewpoint, sfc.pressure, levels);
    const sbResult = calcCAPE_CIN(levels, sbLift.parcel);

    // Mixed-layer
    const ml = mixedLayerAvg(levels);
    const mlLift = liftParcel(ml.temp, ml.dewpoint, sfc.pressure, levels);
    const mlResult = calcCAPE_CIN(levels, mlLift.parcel);

    // Most-unstable
    const muLev = mostUnstableParcel(levels);
    const muLift = liftParcel(muLev.temp, muLev.dewpoint, muLev.pressure, levels);
    const muResult = calcCAPE_CIN(levels, muLift.parcel);

    // LCL height AGL
    const sbLCL_hgt = heightAtPressure(levels, sbLift.pLCL);
    const lclAGL = sbLCL_hgt ? sbLCL_hgt - sfcH : 0;

    // ---- Shear / Helicity ----
    const bunkers = bunkersMotion(levels);
    const shear01 = bulkShear(levels, 0, 1000);
    const shear06 = bulkShear(levels, 0, 6000);
    const srh01 = calcSRH(levels, 0, 1000, bunkers.right.u, bunkers.right.v);
    const srh03 = calcSRH(levels, 0, 3000, bunkers.right.u, bunkers.right.v);

    // ---- Lapse rates ----
    const lr03 = lapseRate(levels, 0, 3000);
    const lr700_500 = lapseRate700_500(levels);

    // ---- Moisture ----
    const pw = precipitableWater(levels);

    // ---- Composite Parameters ----
    const stp = calcSTP(sbResult.cape, lclAGL, srh01, shear06.mag * 1.94384, sbResult.cin);
    const scp = calcSCP(muResult.cape, srh03, shear06.mag * 1.94384);

    // ---- Parcel paths for plotting ----
    return {
        sbcape: Math.round(sbResult.cape),
        sbcin: Math.round(sbResult.cin),
        mlcape: Math.round(mlResult.cape),
        mlcin: Math.round(mlResult.cin),
        mucape: Math.round(muResult.cape),
        mucin: Math.round(muResult.cin),

        lclPressure: Math.round(sbLift.pLCL),
        lclHeight: Math.round(lclAGL),
        lclTemp: Math.round(sbLift.tLCL * 10) / 10,

        lfcPressure: sbResult.lfc ? Math.round(sbResult.lfc.pressure) : null,
        lfcHeight: sbResult.lfc ? Math.round(sbResult.lfc.height - sfcH) : null,
        elPressure: sbResult.el ? Math.round(sbResult.el.pressure) : null,
        elHeight: sbResult.el ? Math.round(sbResult.el.height - sfcH) : null,

        shear01: Math.round(shear01.mag * 1.94384), // m/s to kts
        shear06: Math.round(shear06.mag * 1.94384),
        srh01: Math.round(srh01),
        srh03: Math.round(srh03),

        bunkers,

        lr03: Math.round(lr03 * 10) / 10,
        lr700_500: Math.round(lr700_500 * 10) / 10,

        pw: Math.round(pw * 100) / 100,

        stp: Math.round(stp * 10) / 10,
        scp: Math.round(scp * 10) / 10,

        // Parcel path for Skew-T plotting
        sbParcel: sbLift.parcel,
        sfcHeight: sfcH,

        levels,
    };
}
