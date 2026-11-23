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
const KAPPA = Rd / Cp; // Poisson exponent (~0.2854)

// Buoyancy integration stops here to avoid stratospheric contamination.
const CAPE_TOP_P = 100; // hPa

/** Convert Celsius to Kelvin */
function CtoK(c) { return c + 273.15; }
/** Convert Kelvin to Celsius */
function KtoC(k) { return k - 273.15; }
/** Convert knots to m/s */
function ktsToMs(kts) { return kts * 0.51444; }

/**
 * Saturation vapor pressure (Bolton 1980) in hPa
 */
export function es(tc) {
    return 6.112 * Math.exp((17.67 * tc) / (tc + 243.5));
}

/**
 * Mixing ratio in g/kg given temperature (°C) and pressure (hPa)
 */
export function mixingRatio(tc, p) {
    const e = es(tc);
    return (1000 * eps * e) / (p - e);
}

/**
 * Virtual temperature in K from temperature (°C), dewpoint (°C), pressure (hPa).
 * Used for the environment, whose vapor content is set by its dewpoint.
 */
export function virtualTemp(tc, tdc, p) {
    const w = mixingRatio(tdc, p) / 1000; // kg/kg
    return CtoK(tc) * (1 + 0.61 * w);
}

/**
 * Virtual temperature in K from temperature (°C) and a known mixing ratio (kg/kg).
 * Used for a lifted parcel, whose vapor content is carried with it rather than
 * implied by a dewpoint.
 */
export function virtualTempFromW(tc, w) {
    return CtoK(tc) * (1 + 0.61 * w);
}

/** Potential temperature (K) from temperature (°C) and pressure (hPa). */
function potentialTemp(tc, p) {
    return CtoK(tc) * Math.pow(1000 / p, KAPPA);
}

/**
 * Dewpoint (°C) from a mixing ratio (g/kg) at pressure p (hPa) — the inverse of
 * mixingRatio() via the Bolton vapor-pressure formula.
 */
export function dewpointFromMixingRatio(wGkg, p) {
    const w = wGkg / 1000;
    const e = (w * p) / (eps + w);
    const ln = Math.log(e / 6.112);
    return (243.5 * ln) / (17.67 - ln);
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
export function lclTemp(tc, tdc) {
    const tk = CtoK(tc);
    const tdk = CtoK(tdc);
    return 1 / (1 / (tdk - 56) + Math.log(tk / tdk) / 800) + 56;
}

/**
 * LCL pressure using Poisson equation
 */
export function lclPressure(tc, tdc, p) {
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
    // Mixing ratio of the source parcel — conserved during dry (sub-LCL) ascent.
    const wSource = mixingRatio(tdSfc, pSfc) / 1000; // kg/kg

    const parcel = [];

    for (const lev of levels) {
        if (lev.pressure > pSfc) continue;

        // Insert the LCL itself as a path point. The parcel curve has a kink
        // there (dry → moist), and the LFC test needs to evaluate buoyancy
        // exactly at the LCL rather than at the nearest sounding level.
        const last = parcel[parcel.length - 1];
        if (lev.pressure < pLCL && last && last.pressure > pLCL) {
            parcel.push({ pressure: pLCL, temp: tLCL, w: wSource });
        }

        let parcelT, w;
        if (lev.pressure >= pLCL) {
            // Below LCL: dry adiabat, unsaturated — carries the source mixing ratio
            parcelT = dryAdiabat(tSfc, pSfc, lev.pressure);
            w = wSource;
        } else {
            // Above LCL: moist adiabat, saturated — mixing ratio = saturation value
            parcelT = moistAdiabat(tLCL, pLCL, lev.pressure);
            w = mixingRatio(parcelT, lev.pressure) / 1000;
        }

        parcel.push({ pressure: lev.pressure, temp: parcelT, w });
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
 * Buoyancy B = (Tv_parcel - Tv_env) / Tv_env at each parcel-path point, with
 * its height. Buoyancy uses virtual temperature (Doswell & Rasmussen 1994): the
 * moist parcel is less dense than its temperature alone implies, and the
 * correction can add hundreds of J/kg of CAPE in humid profiles.
 */
function buoyancyProfile(levels, parcel) {
    const prof = [];
    for (const pt of parcel) {
        if (pt.pressure < CAPE_TOP_P) break;
        const t = interpAtPressure(levels, pt.pressure, 'temp');
        const td = interpAtPressure(levels, pt.pressure, 'dewpoint');
        const z = heightAtPressure(levels, pt.pressure);
        if (t === null || td === null || z === null) continue;
        const envTv = virtualTemp(t, td, pt.pressure);
        const parcelTv = virtualTempFromW(pt.temp, pt.w);
        prof.push({ p: pt.pressure, z, b: (parcelTv - envTv) / envTv });
    }
    return prof;
}

/** Height/pressure where buoyancy crosses zero between two profile points. */
function zeroCrossing(a, c) {
    const f = a.b / (a.b - c.b);
    return {
        z: a.z + f * (c.z - a.z),
        p: Math.exp(Math.log(a.p) + f * (Math.log(c.p) - Math.log(a.p))),
    };
}

/**
 * Integrate g·B·dz over the part of the profile between heights zBot and zTop,
 * splitting layers at zero crossings so positive and negative areas are
 * accounted separately even when a sign change falls mid-layer.
 */
function buoyantEnergy(prof, zBot, zTop) {
    let pos = 0, neg = 0;
    for (let i = 0; i < prof.length - 1; i++) {
        const a = prof[i], c = prof[i + 1];
        const lo = Math.max(a.z, zBot);
        const hi = Math.min(c.z, zTop);
        if (!(hi > lo)) continue;
        const bAt = (z) => a.b + (c.b - a.b) * (z - a.z) / (c.z - a.z);
        const b1 = bAt(lo), b2 = bAt(hi);
        if (b1 >= 0 && b2 >= 0) {
            pos += g * (b1 + b2) / 2 * (hi - lo);
        } else if (b1 <= 0 && b2 <= 0) {
            neg += g * (b1 + b2) / 2 * (hi - lo);
        } else {
            const zc = lo + (hi - lo) * b1 / (b1 - b2);
            const e1 = g * b1 / 2 * (zc - lo);
            const e2 = g * b2 / 2 * (hi - zc);
            if (b1 > 0) { pos += e1; neg += e2; } else { neg += e1; pos += e2; }
        }
    }
    return { pos, neg };
}

/**
 * CAPE, CIN, LFC and EL for a lifted parcel.
 *
 * - LFC: the lowest level AT OR ABOVE THE LCL where the parcel becomes
 *   positively buoyant. A superadiabatic surface layer can make an unsaturated
 *   parcel briefly buoyant near the ground; that is not free convection, and
 *   treating it as the LFC would hide any cap above it (CIN = 0).
 * - EL: the highest level where the parcel is still positively buoyant.
 * - CAPE: positive area between the LFC and EL.
 * - CIN: negative area between the parcel source and the LFC.
 *
 * If the parcel never reaches an LFC, CAPE and CIN are reported as 0 and the
 * LFC/EL as null — inhibition isn't meaningful without free convection above.
 */
function calcCAPE_CIN(levels, parcel, pLCL) {
    const none = { cape: 0, cin: 0, lfc: null, el: null };
    const prof = buoyancyProfile(levels, parcel);
    if (prof.length < 2) return none;

    let lfc = null;
    for (let i = 0; i < prof.length; i++) {
        const pt = prof[i];
        if (pt.p > pLCL) continue; // still below the LCL
        if (pt.b > 0) {
            const prev = prof[i - 1];
            lfc = prev && prev.p <= pLCL && prev.b <= 0
                ? zeroCrossing(prev, pt)
                : { z: pt.z, p: pt.p };
            break;
        }
    }
    if (!lfc) return none;

    let k = -1;
    for (let i = prof.length - 1; i >= 0; i--) {
        if (prof[i].b > 0 && prof[i].z >= lfc.z) { k = i; break; }
    }
    if (k < 0) return none;
    const el = k === prof.length - 1
        ? { z: prof[k].z, p: prof[k].p }
        : zeroCrossing(prof[k], prof[k + 1]);

    const cape = buoyantEnergy(prof, lfc.z, el.z).pos;
    const cin = buoyantEnergy(prof, prof[0].z, lfc.z).neg;

    return {
        cape: Math.max(0, cape),
        cin: Math.min(0, cin),
        lfc: { pressure: lfc.p, height: lfc.z },
        el: { pressure: el.p, height: el.z },
    };
}

/**
 * Mixed-layer parcel (lowest 100 hPa), per the SPC convention: average the
 * POTENTIAL temperature and MIXING RATIO through the layer (pressure-weighted),
 * then start the parcel at the surface with those conserved values.
 *
 * Averaging raw temperature instead would yield the mid-layer temperature —
 * several degrees colder than a well-mixed layer has at the surface — and
 * lifting that from surface pressure would understate MLCAPE and overstate
 * MLCIN.
 */
function mixedLayerParcel(levels, depth = 100) {
    const sfcP = levels[0].pressure;
    const topP = sfcP - depth;
    const pts = [];

    for (const lev of levels) {
        if (lev.pressure < topP) break;
        pts.push({
            p: lev.pressure,
            theta: potentialTemp(lev.temp, lev.pressure),
            w: mixingRatio(lev.dewpoint, lev.pressure),
        });
    }
    // Close the layer exactly at its top.
    const last = pts[pts.length - 1];
    if (last && last.p > topP) {
        const t = interpAtPressure(levels, topP, 'temp');
        const td = interpAtPressure(levels, topP, 'dewpoint');
        if (t !== null && td !== null) {
            pts.push({ p: topP, theta: potentialTemp(t, topP), w: mixingRatio(td, topP) });
        }
    }

    let thetaSum = 0, wSum = 0, pSum = 0;
    for (let i = 0; i < pts.length - 1; i++) {
        const dp = pts[i].p - pts[i + 1].p;
        thetaSum += (pts[i].theta + pts[i + 1].theta) / 2 * dp;
        wSum += (pts[i].w + pts[i + 1].w) / 2 * dp;
        pSum += dp;
    }
    if (pSum <= 0) return { temp: levels[0].temp, dewpoint: levels[0].dewpoint };

    const temp = KtoC((thetaSum / pSum) * Math.pow(sfcP / 1000, KAPPA));
    const dewpoint = Math.min(temp, dewpointFromMixingRatio(wSum / pSum, sfcP));
    return { temp, dewpoint };
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
export function windComponents(dir, spd) {
    const spdMs = ktsToMs(spd);
    const rad = (dir * Math.PI) / 180;
    return {
        u: -spdMs * Math.sin(rad),
        v: -spdMs * Math.cos(rad),
    };
}

/**
 * Find the pair of levels bracketing a height AGL, with the linear fraction
 * between them. Returns null if the height is outside the sounding.
 */
function bracketHeight(levels, hAGL) {
    const target = levels[0].height + hAGL;
    for (let i = 0; i < levels.length - 1; i++) {
        const a = levels[i], b = levels[i + 1];
        if (a.height <= target && b.height >= target) {
            const span = b.height - a.height;
            return { a, b, frac: span > 0 ? (target - a.height) / span : 0 };
        }
    }
    return null;
}

/** Linearly interpolate a level field at a height AGL (m). */
function interpAtHeight(levels, hAGL, field) {
    const br = bracketHeight(levels, hAGL);
    if (!br) return null;
    return br.a[field] + br.frac * (br.b[field] - br.a[field]);
}

/**
 * Interpolate the wind vector (u, v in m/s) at a height AGL (m).
 * Interpolates the u/v components rather than direction/speed — interpolating
 * degrees linearly is wrong across the 0°/360° wrap (e.g. 350° and 10° would
 * average to 180°, the exact opposite direction).
 */
function windAtHeight(levels, hAGL) {
    const br = bracketHeight(levels, hAGL);
    if (!br) return null;
    const ua = windComponents(br.a.windDir, br.a.windSpd);
    const ub = windComponents(br.b.windDir, br.b.windSpd);
    return {
        u: ua.u + br.frac * (ub.u - ua.u),
        v: ua.v + br.frac * (ub.v - ua.v),
    };
}

/**
 * Mean wind (u, v in m/s) over a height layer (m AGL), sampled at even height
 * steps so it isn't biased toward wherever the sounding happens to have
 * closely spaced levels (usually near the ground).
 */
function meanWindLayer(levels, hBot, hTop, step = 100) {
    let u = 0, v = 0, n = 0;
    for (let h = hBot; h <= hTop + 1e-6; h += step) {
        const w = windAtHeight(levels, h);
        if (!w) continue;
        u += w.u;
        v += w.v;
        n++;
    }
    return n ? { u: u / n, v: v / n } : null;
}

/**
 * Bulk wind shear between two height layers (m AGL)
 */
export function bulkShear(levels, hBot, hTop) {
    const bot = windAtHeight(levels, hBot);
    const top = windAtHeight(levels, hTop);
    if (!bot || !top) return { mag: 0, u: 0, v: 0 };

    const du = top.u - bot.u;
    const dv = top.v - bot.v;
    const mag = Math.sqrt(du * du + dv * dv);

    return { mag, u: du, v: dv };
}

/**
 * Bunkers et al. (2000) "internal dynamics" storm motion: the 0–6 km
 * non-pressure-weighted mean wind, deviated 7.5 m/s perpendicular to a shear
 * vector taken between the 0–0.5 km and 5.5–6 km mean winds.
 */
function bunkersMotion(levels) {
    const mw = meanWindLayer(levels, 0, 6000) || { u: 0, v: 0 };
    const low = meanWindLayer(levels, 0, 500);
    const high = meanWindLayer(levels, 5500, 6000);

    const d = 7.5; // deviation magnitude m/s
    const su = low && high ? high.u - low.u : 0;
    const sv = low && high ? high.v - low.v : 0;
    const shearMag = Math.sqrt(su * su + sv * sv);
    if (shearMag === 0) {
        return {
            right: { u: mw.u, v: mw.v },
            left: { u: mw.u, v: mw.v },
            mean: mw,
        };
    }

    const crossU = sv / shearMag;
    const crossV = -su / shearMag;

    return {
        right: { u: mw.u + d * crossU, v: mw.v + d * crossV },
        left: { u: mw.u - d * crossU, v: mw.v - d * crossV },
        mean: mw,
    };
}

/**
 * Storm-Relative Helicity (SRH) in m²/s² over a height layer (m AGL).
 * The layer is closed with winds interpolated exactly at hBot and hTop, so
 * the result doesn't depend on whether a sounding level happens to sit on the
 * layer boundary.
 */
export function calcSRH(levels, hBot, hTop, stormU, stormV) {
    const sfcH = levels[0].height;
    const winds = [];

    const bot = windAtHeight(levels, hBot);
    if (bot) winds.push(bot);
    for (const l of levels) {
        const agl = l.height - sfcH;
        if (agl > hBot && agl < hTop) winds.push(windComponents(l.windDir, l.windSpd));
    }
    const top = windAtHeight(levels, hTop);
    if (top) winds.push(top);

    let srh = 0;
    for (let i = 0; i < winds.length - 1; i++) {
        const sru1 = winds[i].u - stormU;
        const srv1 = winds[i].v - stormV;
        const sru2 = winds[i + 1].u - stormU;
        const srv2 = winds[i + 1].v - stormV;
        srh += (sru2 * srv1) - (sru1 * srv2);
    }

    return srh;
}

/**
 * Lapse rate between two heights AGL in °C/km, or null if the layer isn't
 * covered by the sounding.
 */
function lapseRate(levels, hBot, hTop) {
    const tBot = interpAtHeight(levels, hBot, 'temp');
    const tTop = interpAtHeight(levels, hTop, 'temp');
    if (tBot === null || tTop === null) return null;
    return (tBot - tTop) / ((hTop - hBot) / 1000);
}

/**
 * 700-500 hPa lapse rate in °C/km, or null when 700 hPa is below ground
 * (high-elevation stations) or the sounding ends below 500 hPa.
 */
function lapseRate700_500(levels) {
    const t700 = interpAtPressure(levels, 700, 'temp');
    const t500 = interpAtPressure(levels, 500, 'temp');
    const h700 = heightAtPressure(levels, 700);
    const h500 = heightAtPressure(levels, 500);
    if (t700 === null || t500 === null || h700 === null || h500 === null) return null;
    return (t700 - t500) / ((h500 - h700) / 1000);
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
 * The individual (normalized) terms of the fixed-layer STP. Each is ~1 at the
 * benchmark value, so the smallest term is the ingredient holding STP back.
 * Arguments as for calcSTP().
 */
export function stpTerms(sbcape, lcl, srh01, shear06, cin) {
    const capeTerm = sbcape / 1500;
    const srhTerm = srh01 / 150;

    // LCL term: 1.0 at/below 1000 m, 0.0 at/above 2000 m, linear between
    let lclTerm;
    if (lcl < 1000) lclTerm = 1.0;
    else if (lcl > 2000) lclTerm = 0.0;
    else lclTerm = (2000 - lcl) / 1000;

    // Shear term: 0 below 12.5 m/s, capped at 1.5 above 30 m/s, BWD/20 between
    let shearTerm;
    if (shear06 < 12.5) shearTerm = 0.0;
    else if (shear06 > 30) shearTerm = 1.5;
    else shearTerm = shear06 / 20;

    // CIN term: 1.0 above -50, 0.0 below -200, (200+CIN)/150 between
    let cinTerm;
    if (cin > -50) cinTerm = 1.0;
    else if (cin < -200) cinTerm = 0.0;
    else cinTerm = (200 + cin) / 150;

    return { cape: capeTerm, lcl: lclTerm, srh: srhTerm, shear: shearTerm, cin: cinTerm };
}

/**
 * Significant Tornado Parameter (STP), SPC fixed-layer formulation.
 * @param {number} sbcape   Surface-based CAPE (J/kg)
 * @param {number} lcl      Surface-based LCL height (m AGL)
 * @param {number} srh01    0-1 km storm-relative helicity (m²/s²)
 * @param {number} shear06  0-6 km bulk shear in METERS PER SECOND
 * @param {number} cin      Surface-based CIN (J/kg, negative)
 */
export function calcSTP(sbcape, lcl, srh01, shear06, cin) {
    const t = stpTerms(sbcape, lcl, srh01, shear06, cin);
    return t.cape * t.lcl * t.srh * t.shear * t.cin;
}

/**
 * Supercell Composite Parameter (SCP), Thompson et al. fixed-layer form.
 * @param {number} mucape   Most-unstable CAPE (J/kg)
 * @param {number} srh03    0-3 km storm-relative helicity (m²/s²)
 * @param {number} shear06  0-6 km bulk shear in METERS PER SECOND
 */
export function calcSCP(mucape, srh03, shear06) {
    const capeTerm = mucape / 1000;
    const srhTerm = srh03 / 100;

    // Shear term: 0 below 10 m/s, capped at 1.0 above 20 m/s, BWD/20 between
    let shearTerm;
    if (shear06 < 10) shearTerm = 0.0;
    else if (shear06 > 20) shearTerm = 1.0;
    else shearTerm = shear06 / 20;

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
    const sbResult = calcCAPE_CIN(levels, sbLift.parcel, sbLift.pLCL);

    // Mixed-layer
    const ml = mixedLayerParcel(levels);
    const mlLift = liftParcel(ml.temp, ml.dewpoint, sfc.pressure, levels);
    const mlResult = calcCAPE_CIN(levels, mlLift.parcel, mlLift.pLCL);

    // Most-unstable
    const muLev = mostUnstableParcel(levels);
    const muLift = liftParcel(muLev.temp, muLev.dewpoint, muLev.pressure, levels);
    const muResult = calcCAPE_CIN(levels, muLift.parcel, muLift.pLCL);

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
    // STP/SCP shear terms are defined in m/s — pass the magnitude directly.
    const stp = calcSTP(sbResult.cape, lclAGL, srh01, shear06.mag, sbResult.cin);
    const stpParts = stpTerms(sbResult.cape, lclAGL, srh01, shear06.mag, sbResult.cin);
    const scp = calcSCP(muResult.cape, srh03, shear06.mag);
    const round1 = (x) => (x === null ? null : Math.round(x * 10) / 10);

    // ---- Parcel paths for plotting ----
    return {
        sbcape: Math.round(sbResult.cape),
        sbcin: Math.round(sbResult.cin),
        mlcape: Math.round(mlResult.cape),
        mlcin: Math.round(mlResult.cin),
        mucape: Math.round(muResult.cape),
        mucin: Math.round(muResult.cin),
        // Where the most-unstable parcel originates; well above the surface
        // means any storms would be elevated (not rooted in surface air).
        muPressure: Math.round(muLev.pressure),
        muHeight: Math.round(muLev.height - sfcH),
        sfcPressure: sfc.pressure,

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

        // null when the layer isn't covered by the sounding
        lr03: round1(lr03),
        lr700_500: round1(lr700_500),

        pw: Math.round(pw * 100) / 100,

        stp: round1(stp),
        stpTerms: stpParts,
        scp: round1(scp),

        // Parcel path for Skew-T plotting
        sbParcel: sbLift.parcel,
        sfcHeight: sfcH,

        levels,
    };
}
