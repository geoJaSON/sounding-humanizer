/**
 * Humanizer Engine
 * Translates computed sounding parameters into a plain-language briefing.
 *
 * Everything here describes the ENVIRONMENT the sounding samples — what storms
 * could do if they form — not a forecast of whether they will. Wording is kept
 * conditional for that reason.
 */

const COLORS = {
    extreme: '#a855f7',
    high: '#ef4444',
    enhanced: '#f97316',
    marginal: '#eab308',
    low: '#22c55e',
};

/** Integer with thousands separators: 4817 → "4,817". */
const fmt = (n) => Math.round(n).toLocaleString('en-US');

/**
 * Storms would be elevated — rooted in a warm, moist layer above a stable
 * near-surface layer — when the instability is found aloft but a surface
 * parcel has little or none of it.
 */
export function isElevated(a) {
    return a.mucape >= 250
        && a.muHeight >= 250
        && a.sbcape < Math.max(100, 0.25 * a.mucape);
}

/** High-shear, low-CAPE: hard-to-forecast cool-season / Southeast setups. */
function isHSLC(a, elevated) {
    return !elevated && a.mucape >= 100 && a.mucape < 500 && a.shear06 >= 35;
}

// ---- Descriptors (kept consistent with the section thresholds below) ----

function capeWord(cape) {
    if (cape >= 4000) return 'extreme';
    if (cape >= 2500) return 'strong';
    if (cape >= 1000) return 'moderate';
    if (cape >= 300) return 'weak';
    if (cape > 0) return 'marginal';
    return 'no';
}

function shearWord(kt) {
    if (kt >= 50) return 'very strong';
    if (kt >= 35) return 'strong';
    if (kt >= 20) return 'moderate';
    return 'weak';
}

/**
 * Determine overall severity level from the key ingredients
 */
function overallSeverity(a, elevated) {
    let score = 0;
    // MUCAPE captures elevated instability too; for surface-based profiles
    // it usually equals SBCAPE.
    const cape = a.mucape;

    // CAPE contribution
    if (cape > 4000) score += 4;
    else if (cape > 2500) score += 3;
    else if (cape > 1000) score += 2;
    else if (cape > 500) score += 1;

    // Shear contribution
    if (a.shear06 > 50) score += 3;
    else if (a.shear06 > 40) score += 2.5;
    else if (a.shear06 > 30) score += 2;
    else if (a.shear06 > 20) score += 1;

    // SRH contribution — only for storms that ingest near-surface air.
    // Elevated storms draw from above the layer this SRH describes.
    if (!elevated) {
        if (a.srh03 > 400) score += 3;
        else if (a.srh03 > 200) score += 2;
        else if (a.srh03 > 100) score += 1;
    }

    // STP contribution
    if (a.stp > 6) score += 3;
    else if (a.stp > 3) score += 2;
    else if (a.stp > 1) score += 1;

    // Shear without instability does not produce severe convection.
    if (cape < 100) {
        score = Math.min(score, 2); // virtually no instability → Low
    } else if (cape < 500) {
        score = Math.min(score, 4); // weak instability → at most Marginal
    }

    if (score >= 10) return { level: 'extreme', label: 'Extreme', color: COLORS.extreme };
    if (score >= 7) return { level: 'high', label: 'High', color: COLORS.high };
    if (score >= 5) return { level: 'enhanced', label: 'Enhanced', color: COLORS.enhanced };
    if (score >= 3) return { level: 'marginal', label: 'Marginal', color: COLORS.marginal };
    return { level: 'low', label: 'Low', color: COLORS.low };
}

/** Likely storm mode, from deep-layer shear and the supercell composite. */
function stormMode(a, hslc) {
    if (hslc) {
        return 'Storms would likely be low-topped and fast-moving, often in lines — and these setups can still produce damaging gusts and brief tornadoes despite the weak buoyancy.';
    }
    if (a.shear06 >= 35 && a.scp >= 1) return 'If storms develop, supercells are favored.';
    if (a.shear06 >= 35) {
        return 'Shear is sufficient for supercells, but other ingredients are marginal, so organized multicells and short-lived supercells are more likely.';
    }
    if (a.shear06 >= 20) return 'Expect organized multicell clusters or line segments rather than long-lived supercells.';
    return 'Expect pulse-type storms that grow, rain out and collapse within an hour or so, with little organization.';
}

/**
 * Generate headline summary
 */
function headline(a, severity, ctx) {
    const { elevated, hslc } = ctx;
    const cape = a.mucape;
    const capeTxt = `${capeWord(cape)} instability (${fmt(cape)} J/kg)`;
    const shearTxt = `${shearWord(a.shear06)} deep-layer shear (${a.shear06} kt)`;
    const out = [];

    switch (severity.level) {
        case 'extreme':
            out.push(`An extremely volatile environment: ${capeTxt} combined with ${shearTxt}.`);
            break;
        case 'high':
            out.push(`A highly favorable environment for severe thunderstorms, with ${capeTxt} and ${shearTxt}.`);
            break;
        case 'enhanced':
            out.push(`An environment supportive of organized severe storms, with ${capeTxt} and ${shearTxt}.`);
            break;
        case 'marginal':
            if (hslc) out.push(`Limited instability (${fmt(cape)} J/kg) but ${shearTxt} — a "high-shear, low-CAPE" setup.`);
            else if (cape >= 1000 && a.shear06 < 20) out.push(`Plenty of instability (${fmt(cape)} J/kg) but ${shearTxt}.`);
            else out.push(`Marginal severe potential, with ${capeTxt} and ${shearTxt}.`);
            break;
        default: {
            if (cape < 100) {
                out.push(`Very little instability (${fmt(cape)} J/kg) — deep, sustained thunderstorms are unlikely with this profile as it stands.`);
                return out.join(' ');
            }
            const lacking = [];
            if (cape < 500) lacking.push('instability is limited');
            if (a.shear06 < 20) lacking.push('shear is weak');
            out.push(lacking.length
                ? `Low severe potential: ${lacking.join(' and ')} (${fmt(cape)} J/kg, ${a.shear06} kt).`
                : `Low severe potential, with ${capeTxt} and ${shearTxt}.`);
        }
    }

    out.push(stormMode(a, hslc));

    if (elevated) {
        out.push(`The instability is elevated — the most unstable air sits near ${a.muPressure} hPa, above a stable near-surface layer — so storms would likely be rooted above the ground, favoring hail over tornadoes.`);
    } else if (cape >= 500 && a.lfcHeight != null) {
        if (a.sbcin <= -100) {
            out.push(`A strong cap (SBCIN ${a.sbcin} J/kg) makes all of this conditional: storms will need a strong trigger to form at all.`);
        } else if (a.sbcin <= -50) {
            out.push(`A modest cap (SBCIN ${a.sbcin} J/kg) may delay storm initiation.`);
        }
    }

    return out.join(' ');
}

/**
 * Most likely hazards IF storms form, from simple ingredient checks.
 * Returns [{ name, text }] — empty when there is no meaningful instability.
 */
function hazards(a, ctx) {
    const { elevated, hslc } = ctx;
    const cape = a.mucape;
    const list = [];
    if (cape < 100) return list;

    // Tornadoes — surface-based storms only.
    if (elevated) {
        list.push({ name: 'Tornadoes', text: 'Unlikely — storms would be rooted above the stable surface layer.' });
    } else if (a.stp >= 3) {
        list.push({ name: 'Tornadoes', text: 'Significant (EF2+) tornadoes possible with any discrete supercell.' });
    } else if (a.stp >= 1) {
        list.push({ name: 'Tornadoes', text: 'Tornadoes possible with supercells; a few could be significant (EF2+).' });
    } else if (a.stp >= 0.3 || (hslc && a.srh01 >= 100)) {
        list.push({ name: 'Tornadoes', text: 'Brief, weak tornadoes can’t be ruled out.' });
    }

    // Hail — instability, shear to sustain updrafts, and steep mid-level lapse rates.
    const steepMid = a.lr700_500 === null || a.lr700_500 >= 7;
    if (cape >= 2000 && a.shear06 >= 40 && steepMid) {
        list.push({ name: 'Hail', text: 'Very large hail (2"+) possible with supercells.' });
    } else if (cape >= 1000 && a.shear06 >= 30) {
        list.push({ name: 'Hail', text: 'Large hail (1"+) possible.' });
    } else if (cape >= 1500) {
        list.push({ name: 'Hail', text: 'Brief hail in the strongest cores, occasionally reaching severe size (1").' });
    }

    // Wind — elevated storms rarely mix strong winds down through the stable layer.
    if (!elevated) {
        const highBase = (a.lclHeight >= 1500 || (a.lr03 ?? 0) >= 8.5) && cape >= 500;
        if (hslc) {
            list.push({ name: 'Wind', text: 'Damaging gusts with fast-moving lines or bowing segments.' });
        } else if (a.shear06 >= 30 && cape >= 1000) {
            list.push({ name: 'Wind', text: 'Damaging winds, especially if storms merge into lines or bowing clusters.' });
        } else if (highBase) {
            list.push({ name: 'Wind', text: 'Strong downburst gusts from high-based storms (dry air below cloud base).' });
        } else if (cape >= 1500 && a.pw >= 1.5) {
            list.push({ name: 'Wind', text: 'Wet microbursts — brief, localized damaging gusts as rain-loaded cores collapse.' });
        }
    }

    // Flooding — deep moisture, worst when storms are slow or train.
    if (a.pw >= 1.75) {
        list.push({
            name: 'Flooding',
            text: a.shear06 < 20
                ? 'Flash flooding — very moist air and slow-moving storms.'
                : 'Flash flooding where storms repeatedly cross the same area (training).',
        });
    } else if (a.pw >= 1.5 && a.shear06 < 20) {
        list.push({ name: 'Flooding', text: 'Locally heavy rain from slow-moving storms.' });
    }

    if (!list.some((h) => h.name !== 'Tornadoes')) {
        list.push({ name: 'Lightning', text: 'Lightning and gusty winds with any storms that form; organized severe weather is unlikely.' });
    }
    return list;
}

/**
 * Generate instability analysis
 */
function instabilityAnalysis(a, ctx) {
    const parts = [];
    const cape = a.sbcape;

    // CAPE interpretation
    if (ctx.elevated) {
        const sbTxt = cape > 0 ? `Surface-based CAPE is only ${fmt(cape)} J/kg` : `There's no surface-based CAPE`;
        parts.push(`<strong>${sbTxt}, but the most-unstable parcel has ${fmt(a.mucape)} J/kg.</strong> That parcel starts near ${a.muPressure} hPa (about ${fmt(a.muHeight)} m above ground), above a cool, stable surface layer. Storms would be <em>elevated</em> — fed by the warm, moist layer aloft rather than by surface air — which tends to favor hail over tornadoes and damaging winds.`);
    } else if (cape >= 4000) {
        // Parcel-theory updraft ceiling: w_max = sqrt(2·CAPE).
        const wmaxMph = Math.round(Math.sqrt(2 * cape) * 2.23694);
        parts.push(`<strong>SBCAPE of ${fmt(cape)} J/kg is extreme.</strong> That's an enormous reservoir of energy for updrafts: parcel theory puts their ceiling near ${wmaxMph} mph (√(2·CAPE)). Real updrafts reach perhaps half that after mixing in drier air and carrying rain and ice — still easily enough to loft very large hail.`);
    } else if (cape >= 2500) {
        parts.push(`<strong>SBCAPE of ${fmt(cape)} J/kg is strong.</strong> There's plenty of fuel for vigorous updrafts capable of large hail (1"+) and strong downdrafts.`);
    } else if (cape >= 1000) {
        parts.push(`<strong>SBCAPE of ${fmt(cape)} J/kg is moderate.</strong> That's enough energy for robust, sustained updrafts — with sufficient shear, severe hail and wind become possible.`);
    } else if (cape >= 300) {
        parts.push(`<strong>SBCAPE of ${fmt(cape)} J/kg is weak.</strong> Updrafts would be modest. Storms can still produce lightning, gusty winds and brief heavy rain, but severe weather usually needs strong shear to compensate.`);
    } else if (cape > 0) {
        parts.push(`<strong>SBCAPE of ${fmt(cape)} J/kg is marginal.</strong> With very little buoyancy, any convection would likely be shallow and struggle to sustain itself.`);
    } else {
        parts.push(`<strong>There is no surface-based CAPE.</strong> A parcel lifted from the surface never becomes warmer than its surroundings, so surface-based thunderstorms aren't supported as this profile stands.`);
    }

    // Surface vs mixed-layer spread
    if (!ctx.elevated && a.sbcape >= 500 && a.mlcape < 0.6 * a.sbcape) {
        parts.push(`MLCAPE is notably lower (${fmt(a.mlcape)} J/kg), so much of the surface-based instability comes from a shallow layer of hot or very moist air right at the ground. If that layer mixes out, expect instability closer to the mixed-layer value.`);
    }

    parts.push(cinText(a, ctx));
    parts.push(lclText(a, ctx));

    return parts.join('<br><br>');
}

function cinText(a, ctx) {
    const cin = a.sbcin;

    // Without an LFC there is no free convection for a cap to hold back.
    if (a.lfcHeight == null) {
        if (ctx.elevated) {
            return `A surface parcel never reaches a level of free convection (LFC), so SBCIN isn't meaningful here. The elevated parcel faces ${a.mucin} J/kg of CIN.`;
        }
        return `No surface parcel reaches a level of free convection (LFC), so there's nothing for a cap to hold back — CIN isn't meaningful here.`;
    }

    let text;
    if (cin <= -200) {
        text = `SBCIN of <span class="highlight">${cin} J/kg</span> is a very strong cap — a warm layer aloft acting as a lid. Surface-based storms are unlikely unless a powerful trigger (a strong front or dryline, or substantial heating and moistening) erodes it.`;
    } else if (cin <= -100) {
        text = `SBCIN of <span class="highlight">${cin} J/kg</span> is a substantial cap. Storms will need a decent trigger — a front, outflow boundary or terrain — and initiation may be delayed. Where the cap does break, storms often stay isolated, with little competition from neighbors.`;
    } else if (cin <= -25) {
        text = `SBCIN of <span class="highlight">${cin} J/kg</span> is a modest cap. Daytime heating or a weak boundary can usually overcome it, and it can help keep early storms isolated.`;
    } else {
        text = `SBCIN of <span class="highlight">${cin} J/kg</span> means there's little or no cap. Storms can form with minimal forcing, which often means numerous storms that quickly interfere with one another.`;
    }
    if (cin <= -50) {
        text += ' If this is a morning sounding (12Z in the U.S.), daytime heating will usually erode some of it.';
    }
    return text;
}

function lclText(a, ctx) {
    const lcl = fmt(a.lclHeight);
    if (ctx.elevated) {
        return `The surface-parcel LCL is ${lcl} m AGL, but elevated storms take their cloud bases from the air aloft, so it says little about tornado potential here.`;
    }
    // Cloud-base height only matters for tornadoes when there's enough shear
    // for rotating storms in the first place.
    const tornadoRelevant = a.shear06 >= 30 || a.srh01 >= 100;
    if (a.lclHeight < 1000) {
        return tornadoRelevant
            ? `The LCL is low at ${lcl} m AGL — a moist boundary layer and low cloud bases, one of the ingredients most closely associated with tornadic supercells.`
            : `The LCL is low at ${lcl} m AGL, reflecting a moist boundary layer and low cloud bases.`;
    }
    if (a.lclHeight < 1500) {
        return tornadoRelevant
            ? `The LCL at ${lcl} m AGL is moderate. Low-level moisture is adequate, and cloud-base height isn't a major limit on tornado potential.`
            : `The LCL at ${lcl} m AGL is moderate — typical cloud bases with adequate low-level moisture.`;
    }
    if (a.lclHeight < 2000) {
        return `The LCL is fairly high at ${lcl} m AGL, pointing to drier air near the ground. Rain evaporating below cloud base can drive stronger downdrafts and outflow, while tornado potential is reduced.`;
    }
    return `The LCL is high at ${lcl} m AGL — a deep, dry layer below cloud base. High-based storms favor strong, evaporatively driven downbursts; tornadoes are unlikely.`;
}

/**
 * Generate wind shear analysis
 */
function shearAnalysis(a, ctx) {
    const parts = [];
    const { shear06, shear01, srh01, srh03 } = a;

    // Deep-layer shear
    if (shear06 >= 50) {
        parts.push(`<strong>0–6 km bulk shear of ${shear06} kt is very strong.</strong> That's well into the supercell range: updrafts and downdrafts stay separated, so storms that form can persist for hours${ctx.elevated ? '' : ', and discrete storms in shear like this can produce every severe hazard'}.`);
    } else if (shear06 >= 35) {
        parts.push(`<strong>0–6 km bulk shear of ${shear06} kt is strong</strong> — enough to support supercells. Storms that form can organize, develop rotating updrafts and last for hours.`);
    } else if (shear06 >= 20) {
        parts.push(`<strong>0–6 km bulk shear of ${shear06} kt is moderate.</strong> That's enough for organized multicell clusters and line segments; a few short-lived supercells are possible toward the upper end of this range.`);
    } else {
        parts.push(`<strong>0–6 km bulk shear of ${shear06} kt is weak.</strong> Storms will be poorly organized — pulse-type cells that grow, rain out and collapse within an hour or so. Any severe hail or wind would be brief and isolated.`);
    }

    // Low-level SRH (relative to the Bunkers right-moving supercell)
    let srhText;
    if (ctx.elevated && srh01 >= 50) {
        const size = srh01 >= 300 ? 'very large' : srh01 >= 150 ? 'significant' : 'moderate';
        srhText = `0–1 km SRH of <span class="highlight">${srh01} m²/s²</span> is ${size}, but storms here would be elevated — drawing in air from above this near-surface layer — so it matters much less than usual for tornado potential. (0–1 km shear: ${shear01} kt.)`;
    } else if (srh01 >= 300) {
        srhText = `<strong>0–1 km SRH of ${srh01} m²/s² is very large.</strong> The lowest kilometer holds strong streamwise spin relative to a right-moving supercell, which a storm's updraft can tilt and stretch into intense low-level rotation — a key ingredient for strong tornadoes. (0–1 km shear: ${shear01} kt.)`;
    } else if (srh01 >= 150) {
        srhText = `<strong>0–1 km SRH of ${srh01} m²/s² is significant.</strong> There's plenty of low-level spin for a right-moving supercell to ingest, so rotating storms would have solid tornado potential. (0–1 km shear: ${shear01} kt.)`;
    } else if (srh01 >= 50) {
        srhText = `0–1 km SRH of <span class="highlight">${srh01} m²/s²</span> is moderate. There's some low-level spin (${shear01} kt of 0–1 km shear), so brief tornadoes are possible with supercells, but this isn't a strongly favorable tornado profile.`;
    } else {
        srhText = `0–1 km SRH of <span class="highlight">${srh01} m²/s²</span> is weak. With little low-level spin, tornado potential is low even if storms rotate at mid levels; straight-line gusts would be the main wind hazard.`;
    }
    parts.push(srhText);

    // Hodograph shape, as implied by 0–3 km SRH relative to deep shear
    if (srh03 >= 300 && shear06 >= 40) {
        parts.push(`0–3 km SRH of ${srh03} m²/s² points to a long, curved low-level hodograph — the classic signature of long-lived supercells with persistent mesocyclones.`);
    } else if (srh03 >= 150) {
        parts.push(`0–3 km SRH of ${srh03} m²/s² indicates meaningful low-level hodograph curvature, which favors right-moving supercells.`);
    } else if (shear06 >= 30 && srh03 < 100) {
        parts.push(`With ${shear06} kt of deep shear but only ${srh03} m²/s² of 0–3 km SRH, the hodograph is mostly straight. Straight hodographs favor splitting storms (left- and right-movers), with large hail and damaging winds a bigger concern than tornadoes.`);
    }

    return parts.join('<br><br>');
}

// What each STP term represents when it's the one holding STP down.
const STP_LIMITERS = {
    cape: 'too little surface-based instability',
    lcl: 'cloud bases that are too high',
    srh: 'too little low-level spin (0–1 km SRH)',
    shear: 'too little deep-layer shear',
    cin: 'too strong a cap',
};

/** Name the ingredient(s) holding STP down: every term near zero, else the smallest. */
function stpLimiters(terms) {
    if (!terms) return [];
    const entries = Object.entries(terms).filter(([k]) => k in STP_LIMITERS);
    const nearZero = entries.filter(([, v]) => v <= 0.25).map(([k]) => k);
    if (nearZero.length) return nearZero.map((k) => STP_LIMITERS[k]);
    const [minKey, minVal] = entries.reduce((m, e) => (e[1] < m[1] ? e : m));
    return minVal < 1 ? [STP_LIMITERS[minKey]] : [];
}

/**
 * Generate severe potential analysis
 */
function severePotential(a, ctx) {
    const parts = [];
    const { stp, scp } = a;

    // STP (surface-based; describes what a supercell could do, not whether one forms)
    let stpText;
    if (stp >= 6) {
        stpText = `<strong>Significant Tornado Parameter (STP) of ${stp} is exceptionally high</strong> — far above the 1.0 benchmark for significant-tornado environments. Values like this are rare and turn up most often in major tornado outbreaks. Like all composites, STP describes what a supercell <em>could</em> do here; it doesn't say whether one will form.`;
    } else if (stp >= 3) {
        stpText = `<strong>Significant Tornado Parameter (STP) of ${stp}</strong> is well above the 1.0 benchmark. If supercells develop, the combined ingredients strongly favor tornadoes, including significant (EF2+) ones.`;
    } else if (stp >= 1) {
        stpText = `<strong>Significant Tornado Parameter (STP) of ${stp}</strong> is above 1.0, the range where most significant (EF2+) tornadoes occur. Tornadoes are possible with supercells, a few of them potentially significant.`;
    } else if (stp >= 0.3) {
        stpText = `<strong>Significant Tornado Parameter (STP) of ${stp}</strong> is below the 1.0 benchmark but not negligible. Brief, weak tornadoes can't be ruled out, though they'd likely need local help — such as a storm interacting with a boundary.`;
    } else {
        stpText = `<strong>Significant Tornado Parameter (STP) of ${stp}</strong> is near zero, so the tornado risk is minimal.`;
    }
    if (stp < 1) {
        const limits = stpLimiters(a.stpTerms);
        if (limits.length) stpText += ` What's holding it down: ${limits.join(' and ')}.`;
    }
    parts.push(stpText);

    // SCP
    let scpText;
    if (scp >= 8) {
        scpText = `<strong>Supercell Composite Parameter (SCP) of ${scp} is very high.</strong> Instability, deep shear and low-level SRH all strongly favor supercells — any storm that forms would likely rotate. SCP doesn't predict storm mode, though: storms can still merge into clusters or lines, especially along strong fronts.`;
    } else if (scp >= 4) {
        scpText = `<strong>Supercell Composite Parameter (SCP) of ${scp}</strong> strongly supports supercells; storms that form would likely organize into right-moving supercells.`;
    } else if (scp >= 1) {
        scpText = `<strong>Supercell Composite Parameter (SCP) of ${scp}</strong> is above the supercell benchmark of 1. Supercells are possible, especially if storms stay discrete.`;
    } else {
        scpText = `<strong>Supercell Composite Parameter (SCP) of ${scp}</strong> is below the supercell benchmark of 1. Organized rotating updrafts are unlikely; expect multicell or pulse-type storms.`;
    }
    if (ctx.elevated && scp >= 1) {
        scpText += ' Here they would be elevated supercells, which are mainly hail producers.';
    }
    parts.push(scpText);

    // Mid-level lapse rates — the main thermodynamic hail signal
    const lr = a.lr700_500;
    if (lr !== null && lr >= 8) {
        parts.push(`700–500 hPa lapse rates of <span class="highlight">${lr} °C/km</span> are very steep — close to dry-adiabatic through the mid levels. That adds buoyancy where hail grows, strongly favoring large hail in robust updrafts.`);
    } else if (lr !== null && lr >= 7) {
        parts.push(`700–500 hPa lapse rates of <span class="highlight">${lr} °C/km</span> are steep, adding buoyancy in the hail-growth zone and supporting large hail.`);
    } else if (lr !== null && lr <= 5.5) {
        parts.push(`700–500 hPa lapse rates of <span class="highlight">${lr} °C/km</span> are weak, which limits mid-level buoyancy and tends to keep hail smaller.`);
    }

    // Low-level lapse rates
    if (!ctx.elevated && a.lr03 !== null && a.lr03 >= 8) {
        parts.push(`0–3 km lapse rates of <span class="highlight">${a.lr03} °C/km</span> are steep (close to dry-adiabatic), meaning a deep, well-mixed boundary layer. That helps updrafts accelerate near the ground but also supports strong, evaporatively cooled downdrafts and gusty outflow.`);
    }

    return parts.join('<br><br>');
}

/**
 * Generate moisture analysis
 */
function moistureAnalysis(a) {
    const pw = a.pw;
    const pwTxt = pw.toFixed(2);
    let text;

    if (pw > 2.0) {
        text = `<strong>Precipitable water of ${pwTxt} inches is very high</strong> — a tropical-like moisture column. Storms would be very efficient rain producers, with rates of 2–3+ inches per hour possible; flash flooding is a real concern with slow-moving or training storms.`;
    } else if (pw > 1.5) {
        text = `<strong>Precipitable water of ${pwTxt} inches indicates a very moist atmosphere.</strong> Heavy rain is likely with any storm, and flash flooding becomes a concern if storms move slowly or repeatedly cross the same area (training).`;
    } else if (pw > 1.0) {
        text = `<strong>Precipitable water of ${pwTxt} inches is moderate to high.</strong> Storms would produce heavy downpours; whether that becomes flooding depends mostly on storm motion and training.`;
    } else if (pw > 0.5) {
        text = `Precipitable water of <span class="highlight">${pwTxt} inches</span> is modest. Rainfall amounts would generally be manageable.`;
    } else {
        text = `Precipitable water of <span class="highlight">${pwTxt} inches</span> is low — a dry column.`;
        if (a.mucape >= 100) {
            text += ' Any storms would likely be high-based, with much of the rain evaporating before it reaches the ground (virga) — a setup for dry lightning and gusty downbursts.';
        }
    }

    if (pw > 1.5 && a.shear06 < 20 && a.mucape >= 100) {
        text += ' Weak winds aloft mean storms would move slowly, concentrating rain over the same spots.';
    }
    if (pw > 1.0) {
        text += ' Keep in mind that "high" is relative: typical PW varies a lot with season and region.';
    }
    return text;
}

/**
 * Main humanize function
 */
export function humanize(analysis) {
    if (!analysis) return null;

    const a = analysis;
    const elevated = isElevated(a);
    const ctx = { elevated, hslc: isHSLC(a, elevated) };
    const severity = overallSeverity(a, elevated);
    const na = (v, unit) => (v != null ? `${v}${unit}` : 'N/A');

    const instabilityChips = [
        { label: 'SBCAPE', value: `${fmt(a.sbcape)} J/kg` },
        { label: 'MLCAPE', value: `${fmt(a.mlcape)} J/kg` },
        { label: 'MUCAPE', value: `${fmt(a.mucape)} J/kg` },
        { label: 'SBCIN', value: `${a.sbcin} J/kg` },
        { label: 'LCL', value: `${fmt(a.lclHeight)} m` },
        { label: 'LFC', value: na(a.lfcHeight != null ? fmt(a.lfcHeight) : null, ' m') },
        { label: 'EL', value: na(a.elHeight != null ? fmt(a.elHeight) : null, ' m') },
    ];
    if (elevated) instabilityChips.push({ label: 'MU source', value: `${a.muPressure} hPa` });

    return {
        severity,
        headline: headline(a, severity, ctx),
        hazards: hazards(a, ctx),
        sections: [
            {
                id: 'instability',
                title: 'Instability & Energy',
                icon: '⚡',
                iconBg: 'rgba(251,191,36,0.15)',
                severity: capeLevel(a.mucape),
                body: instabilityAnalysis(a, ctx),
                chips: instabilityChips,
            },
            {
                id: 'shear',
                title: 'Wind Shear & Hodograph',
                icon: '🌀',
                iconBg: 'rgba(6,182,212,0.15)',
                severity: shearLevel(a.shear06, a.srh03),
                body: shearAnalysis(a, ctx),
                chips: [
                    { label: '0–1 km Shear', value: `${a.shear01} kt` },
                    { label: '0–6 km Shear', value: `${a.shear06} kt` },
                    { label: '0–1 km SRH', value: `${a.srh01} m²/s²` },
                    { label: '0–3 km SRH', value: `${a.srh03} m²/s²` },
                ],
            },
            {
                id: 'severe',
                title: 'Supercell & Tornado Potential',
                icon: '🔴',
                iconBg: 'rgba(239,68,68,0.15)',
                severity: compositeLevel(a.stp, a.scp),
                body: severePotential(a, ctx),
                chips: [
                    { label: 'STP', value: `${a.stp}` },
                    { label: 'SCP', value: `${a.scp}` },
                    { label: '0–3 km LR', value: na(a.lr03, ' °C/km') },
                    { label: '700–500 LR', value: na(a.lr700_500, ' °C/km') },
                ],
            },
            {
                id: 'moisture',
                title: 'Moisture Profile',
                icon: '💧',
                iconBg: 'rgba(59,130,246,0.15)',
                severity: pwLevel(a.pw),
                body: moistureAnalysis(a),
                chips: [
                    { label: 'PW', value: `${a.pw.toFixed(2)} in` },
                ],
            },
        ],
    };
}

// Severity helpers for individual sections
function capeLevel(cape) {
    if (cape >= 4000) return { label: 'Extreme', color: COLORS.extreme };
    if (cape >= 2500) return { label: 'High', color: COLORS.high };
    if (cape >= 1000) return { label: 'Moderate', color: COLORS.enhanced };
    if (cape >= 300) return { label: 'Marginal', color: COLORS.marginal };
    return { label: 'Low', color: COLORS.low };
}

function shearLevel(shear06, srh03) {
    const score = (shear06 >= 50 ? 3 : shear06 >= 35 ? 2 : shear06 >= 20 ? 1 : 0)
        + (srh03 >= 300 ? 3 : srh03 >= 150 ? 2 : srh03 >= 50 ? 1 : 0);
    if (score >= 5) return { label: 'Extreme', color: COLORS.extreme };
    if (score >= 4) return { label: 'High', color: COLORS.high };
    if (score >= 3) return { label: 'Enhanced', color: COLORS.enhanced };
    if (score >= 1) return { label: 'Marginal', color: COLORS.marginal };
    return { label: 'Low', color: COLORS.low };
}

function compositeLevel(stp, scp) {
    if (stp >= 6 || scp >= 8) return { label: 'Extreme', color: COLORS.extreme };
    if (stp >= 3 || scp >= 4) return { label: 'High', color: COLORS.high };
    if (stp >= 1 || scp >= 1) return { label: 'Enhanced', color: COLORS.enhanced };
    if (stp >= 0.3 || scp >= 0.5) return { label: 'Marginal', color: COLORS.marginal };
    return { label: 'Low', color: COLORS.low };
}

function pwLevel(pw) {
    if (pw > 2.0) return { label: 'Very High', color: COLORS.extreme };
    if (pw > 1.5) return { label: 'High', color: COLORS.high };
    if (pw > 1.0) return { label: 'Moderate', color: COLORS.enhanced };
    if (pw > 0.5) return { label: 'Modest', color: COLORS.marginal };
    return { label: 'Low', color: COLORS.low };
}
