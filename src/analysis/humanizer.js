/**
 * Humanizer Engine
 * Translates raw sounding parameters into plain-language weather briefings
 */

/**
 * Determine overall severity level from composite parameters
 */
function overallSeverity(a) {
    // Weight different factors
    let score = 0;

    // CAPE contribution
    if (a.sbcape > 4000) score += 4;
    else if (a.sbcape > 2500) score += 3;
    else if (a.sbcape > 1000) score += 2;
    else if (a.sbcape > 500) score += 1;

    // Shear contribution
    if (a.shear06 > 50) score += 3;
    else if (a.shear06 > 40) score += 2.5;
    else if (a.shear06 > 30) score += 2;
    else if (a.shear06 > 20) score += 1;

    // SRH contribution
    if (a.srh03 > 400) score += 3;
    else if (a.srh03 > 200) score += 2;
    else if (a.srh03 > 100) score += 1;

    // STP contribution
    if (a.stp > 6) score += 3;
    else if (a.stp > 3) score += 2;
    else if (a.stp > 1) score += 1;

    // Recalibrate based on available instability (CAPE)
    // Wind shear without instability does not produce severe convection.
    if (a.sbcape < 100) {
        // Virtually no instability. Cap risk at Low.
        score = Math.min(score, 2);
    } else if (a.sbcape < 500) {
        // Weak instability. High shear can only elevate risk so much. Cap at Marginal.
        score = Math.min(score, 4);
    }

    if (score >= 10) return { level: 'extreme', label: 'Extreme', color: '#a855f7' };
    if (score >= 7) return { level: 'high', label: 'High', color: '#ef4444' };
    if (score >= 5) return { level: 'enhanced', label: 'Enhanced', color: '#f97316' };
    if (score >= 3) return { level: 'marginal', label: 'Marginal', color: '#eab308' };
    return { level: 'low', label: 'Low', color: '#22c55e' };
}

/**
 * Generate headline summary
 */
function headline(a, severity) {
    const cape = a.sbcape;
    const shear = a.shear06;

    if (severity.level === 'extreme') {
        return `Extremely dangerous environment with ${cape} J/kg of CAPE and ${shear} kt of deep-layer shear. This profile supports violent supercells and potentially significant tornadoes.`;
    }
    if (severity.level === 'high') {
        return `Highly favorable environment for severe thunderstorms. Strong instability (${cape} J/kg) combined with significant wind shear (${shear} kt) supports supercells capable of large hail and tornadoes.`;
    }
    if (severity.level === 'enhanced') {
        return `Enhanced severe weather threat with moderate-to-strong instability (${cape} J/kg) and organized wind shear (${shear} kt). Supercells or other organized convection are possible.`;
    }
    if (severity.level === 'marginal') {
        if (cape > 1000 && shear < 20) {
            return `Moderate instability (${cape} J/kg) but weak wind shear (${shear} kt). Expect pulse-type thunderstorms with isolated strong wind gusts or small hail, but no sustained rotation.`;
        }
        return `Marginal severe potential. Some combination of instability (${cape} J/kg) and shear (${shear} kt) may support isolated strong storms, but the overall environment is not strongly favorable.`;
    }
    if (cape < 100) {
        return `Very stable atmosphere with minimal buoyancy (${cape} J/kg). Thunderstorm development is unlikely in this environment.`;
    }
    return `Low severe threat overall. Instability is limited (${cape} J/kg) and/or shear is weak (${shear} kt). Any convection would be weak and short-lived.`;
}

/**
 * Generate instability analysis
 */
function instabilityAnalysis(a) {
    const parts = [];
    const cape = a.sbcape;
    const cin = a.sbcin;

    // CAPE interpretation
    if (cape >= 4000) {
        parts.push(`<strong>CAPE of ${cape} J/kg is extreme.</strong> Think of this as a rocket engine for thunderstorm updrafts — updraft speeds could exceed 150 mph. This much energy fuels very large hail and violent wind gusts.`);
    } else if (cape >= 2500) {
        parts.push(`<strong>CAPE of ${cape} J/kg represents strong instability.</strong> There's a lot of fuel available for thunderstorms — expect vigorous updrafts capable of producing large hail (>1 inch) and strong wind gusts.`);
    } else if (cape >= 1000) {
        parts.push(`<strong>CAPE of ${cape} J/kg is moderate.</strong> There's a solid amount of energy for storm updrafts. This can support sustained thunderstorms with moderate hail and gusty winds.`);
    } else if (cape >= 300) {
        parts.push(`<strong>CAPE of ${cape} J/kg is weak-to-moderate.</strong> Some buoyancy exists, but updrafts won't be exceptionally strong. Storms may still produce brief heavy rain and gusty winds.`);
    } else {
        parts.push(`<strong>CAPE of ${cape} J/kg is marginal.</strong> Very limited buoyancy means any convection will struggle to sustain itself. Storms, if they form, will be shallow and weak.`);
    }

    // CIN interpretation
    if (cin < -200) {
        parts.push(`CIN of <span class="highlight">${cin} J/kg is extremely strong</span> — a thick "cap" or lid preventing surface air from rising. Only a very powerful trigger (like a dryline or strong cold front) could bust through this. Storms are unlikely without a focused forcing mechanism.`);
    } else if (cin < -100) {
        parts.push(`CIN of <span class="highlight">${cin} J/kg is a substantial cap</span>. Storms will need a decent trigger (frontal passage, outflow boundary, or terrain forcing) to break through. Delayed initiation is likely, but can lead to explosive development once the cap breaks.`);
    } else if (cin < -25) {
        parts.push(`CIN of <span class="highlight">${cin} J/kg is moderate</span>. There's a noticeable cap, but it's weak enough that afternoon heating or a modest boundary could break it. Once storms initiate, they should sustain easily.`);
    } else {
        parts.push(`CIN of <span class="highlight">${cin} J/kg is weak or nonexistent</span>. There's virtually no cap — storms can fire easily with minimal forcing. This can mean widespread initiation, which may limit individual storm intensity.`);
    }

    // LCL interpretation
    if (a.lclHeight < 800) {
        parts.push(`The LCL is very low at ${a.lclHeight}m AGL, indicating a moist surface layer. Low LCLs correlate with increased tornado probability if storms rotate.`);
    } else if (a.lclHeight < 1500) {
        parts.push(`LCL at ${a.lclHeight}m AGL is reasonably low, suggesting adequate low-level moisture for organized convection.`);
    } else {
        parts.push(`The LCL is relatively high at ${a.lclHeight}m AGL, suggesting drier surface air. High-based storms with increased wind/downburst risk but reduced tornado threat.`);
    }

    return parts.join('<br><br>');
}

/**
 * Generate wind shear analysis
 */
function shearAnalysis(a) {
    const parts = [];
    const shear06 = a.shear06;
    const shear01 = a.shear01;
    const srh01 = a.srh01;
    const srh03 = a.srh03;

    // Deep-layer shear
    if (shear06 >= 50) {
        parts.push(`<strong>0-6 km bulk shear of ${shear06} kt is exceptionally strong.</strong> This is a "loaded gun" for supercells — storms will be long-lived, organized, and the hodograph supports persistent rotation. This level of shear is associated with discrete supercells capable of all severe hazards.`);
    } else if (shear06 >= 35) {
        parts.push(`<strong>0-6 km bulk shear of ${shear06} kt is strong.</strong> Well into the supercell regime. Expect storm organization, with updraft-downdraft separation allowing storms to persist for hours. Discrete supercells are favored.`);
    } else if (shear06 >= 20) {
        parts.push(`<strong>0-6 km bulk shear of ${shear06} kt is moderate.</strong> Enough to support multicell clusters or borderline supercell development. Storms will have some organization but may struggle to become fully discrete.`);
    } else {
        parts.push(`<strong>0-6 km bulk shear of ${shear06} kt is weak.</strong> Not enough to organize storms meaningfully — expect pulse-type convection that fires, rains out quickly, and fades. Severe wind or hail would be brief and isolated.`);
    }

    // Low-level shear & SRH
    if (srh01 > 300) {
        parts.push(`<strong>0-1 km SRH of ${srh01} m²/s² is extreme.</strong> The low-level wind profile shows violent veering — winds rapidly turn clockwise in the lowest kilometer. This creates intense horizontal spin that rotating updrafts can tilt into tornadoes. Combined with low-level shear of ${shear01} kt, the tornado potential is very high, including the possibility of strong (EF2+) tornadoes.`);
    } else if (srh01 > 150) {
        parts.push(`<strong>0-1 km SRH of ${srh01} m²/s² is significant.</strong> Strong low-level wind veering creates ample spin for mesocyclones. With ${shear01} kt of 0-1 km shear, any storm that develops a rotating updraft has solid tornado potential.`);
    } else if (srh01 > 50) {
        parts.push(`0-1 km SRH of <span class="highlight">${srh01} m²/s²</span> is moderate. Some low-level directional shear exists (${shear01} kt in 0-1 km), meaning brief, weak tornadoes are possible with supercells, but the tornado threat isn't the dominant concern.`);
    } else {
        parts.push(`0-1 km SRH of <span class="highlight">${srh01} m²/s²</span> is weak. Limited low-level turning means the tornado risk is low, even if storms rotate at mid-levels. The primary wind hazard would be straight-line gusts.`);
    }

    // Hodograph shape commentary
    if (srh03 > 300 && shear06 > 40) {
        parts.push(`The hodograph shows a strongly curved and elongated shape — classic for long-lived supercells with sustained mesocyclones. The 0-3 km SRH of ${srh03} m²/s² reinforces a significant tornado environment.`);
    } else if (srh03 > 150) {
        parts.push(`The hodograph displays moderate curvature in the low-to-mid levels (0-3 km SRH: ${srh03} m²/s²). This curved profile favors right-moving supercells with rotating updrafts.`);
    } else if (shear06 > 30 && srh03 < 100) {
        parts.push(`The hodograph is primarily straight (low curvature with only ${srh03} m²/s² 0-3 km SRH but ${shear06} kt deep shear). Straight hodographs favor splitting storms — both left and right movers — with the main threat being large hail and damaging winds rather than tornadoes.`);
    }

    return parts.join('<br><br>');
}

/**
 * Generate severe potential analysis
 */
function severePotential(a) {
    const parts = [];

    // STP
    if (a.stp > 6) {
        parts.push(`<strong>Significant Tornado Parameter (STP) of ${a.stp}</strong> is far above the significant tornado threshold of 1.0. This composite index — which combines CAPE, low-level shear, SRH, LCL height, and CIN — is screaming for violent tornadoes. Historically, STP values this high are associated with EF3+ events.`);
    } else if (a.stp > 3) {
        parts.push(`<strong>STP of ${a.stp}</strong> is well above the significant tornado threshold (1.0). The combination of ingredients strongly favors significant (EF2+) tornadoes if storms develop. This is an environment to take very seriously.`);
    } else if (a.stp > 1) {
        parts.push(`<strong>STP of ${a.stp}</strong> exceeds the significant tornado benchmark of 1.0. Conditions are favorable for tornadoes, including the potential for at least some significant (EF2+) events if sustained supercells develop.`);
    } else if (a.stp > 0.3) {
        parts.push(`<strong>STP of ${a.stp}</strong> is below the significant tornado threshold but non-zero. Brief, weak tornadoes (EF0-EF1) can't be ruled out, but the overall tornado risk is conditional — likely requiring unusually favorable mesoscale features.`);
    } else {
        parts.push(`<strong>STP of ${a.stp}</strong> is near zero. The tornado risk is minimal based on the overall parameter space.`);
    }

    // SCP
    if (a.scp > 8) {
        parts.push(`<strong>Supercell Composite (SCP) of ${a.scp}</strong> is extremely high. Discrete supercells are virtually guaranteed if storms initiate, and they should be long-lived with intense updrafts.`);
    } else if (a.scp > 4) {
        parts.push(`<strong>SCP of ${a.scp}</strong> strongly supports supercell development. Any storm that forms in this shear/instability regime should organize into a right-moving supercell.`);
    } else if (a.scp > 1) {
        parts.push(`<strong>SCP of ${a.scp}</strong> is above the supercell threshold. Supercells are possible, especially if storms can remain discrete and not congeal into a cluster.`);
    } else {
        parts.push(`<strong>SCP of ${a.scp}</strong> is below the supercell threshold. Organized rotating updrafts are unlikely — expect multicellular or pulse-type convection.`);
    }

    // Lapse rates
    if (a.lr03 > 8.5) {
        parts.push(`0-3 km lapse rates are <span class="highlight">${a.lr03}°C/km</span> — nearly dry-adiabatic. This steep near-surface mixing zone enhances updraft acceleration and increases the risk of any tornado being rain-wrapped or HP supercell mode.`);
    } else if (a.lr700_500 > 7.5) {
        parts.push(`700-500 hPa lapse rates of <span class="highlight">${a.lr700_500}°C/km</span> are steep, which enhances mid-level instability and supports explosive updraft growth above the LFC.`);
    }

    return parts.join('<br><br>');
}

/**
 * Generate moisture analysis
 */
function moistureAnalysis(a) {
    const parts = [];
    const pw = a.pw;

    if (pw > 2.0) {
        parts.push(`<strong>Precipitable water of ${pw.toFixed(2)} inches is extremely high</strong> — a tropical-like moisture column. Flash flooding is a major concern with any training or slow-moving storms. Rain rates can easily exceed 3-4 inches per hour.`);
    } else if (pw > 1.5) {
        parts.push(`<strong>Precipitable water of ${pw.toFixed(2)} inches indicates a very moist atmosphere.</strong> Heavy rainfall rates are likely with any convection. Flash flooding becomes a significant risk if storms repeatedly pass over the same area (training).`);
    } else if (pw > 1.0) {
        parts.push(`<strong>Precipitable water of ${pw.toFixed(2)} inches represents moderate-to-high moisture.</strong> Storms will produce heavy rain, but flash flooding risk is more conditional — dependent on storm motion and training.`);
    } else if (pw > 0.5) {
        parts.push(`Precipitable water of <span class="highlight">${pw.toFixed(2)} inches</span> is modest. Rain amounts will be manageable, though microbursts from high-based storms could still produce localized wind damage.`);
    } else {
        parts.push(`Precipitable water of <span class="highlight">${pw.toFixed(2)} inches</span> is low, indicating a dry column. Any convection would be high-based with virga. Dry lightning and dust storms are possible.`);
    }

    return parts.join('<br><br>');
}

/**
 * Main humanize function
 */
export function humanize(analysis) {
    if (!analysis) return null;

    const severity = overallSeverity(analysis);

    return {
        severity,
        headline: headline(analysis, severity),
        sections: [
            {
                id: 'instability',
                title: 'Instability & Energy',
                icon: '⚡',
                iconBg: 'rgba(251,191,36,0.15)',
                severity: capeLevel(analysis.sbcape),
                body: instabilityAnalysis(analysis),
                chips: [
                    { label: 'SBCAPE', value: `${analysis.sbcape} J/kg` },
                    { label: 'MLCAPE', value: `${analysis.mlcape} J/kg` },
                    { label: 'MUCAPE', value: `${analysis.mucape} J/kg` },
                    { label: 'CIN', value: `${analysis.sbcin} J/kg` },
                    { label: 'LCL', value: `${analysis.lclHeight}m` },
                    { label: 'LFC', value: analysis.lfcHeight != null ? `${analysis.lfcHeight}m` : 'N/A' },
                    { label: 'EL', value: analysis.elHeight != null ? `${analysis.elHeight}m` : 'N/A' },
                ],
            },
            {
                id: 'shear',
                title: 'Wind Shear & Hodograph',
                icon: '🌀',
                iconBg: 'rgba(6,182,212,0.15)',
                severity: shearLevel(analysis.shear06, analysis.srh03),
                body: shearAnalysis(analysis),
                chips: [
                    { label: '0-1km Shear', value: `${analysis.shear01} kt` },
                    { label: '0-6km Shear', value: `${analysis.shear06} kt` },
                    { label: '0-1km SRH', value: `${analysis.srh01} m²/s²` },
                    { label: '0-3km SRH', value: `${analysis.srh03} m²/s²` },
                ],
            },
            {
                id: 'severe',
                title: 'Severe Potential',
                icon: '🔴',
                iconBg: 'rgba(239,68,68,0.15)',
                severity: compositeLevel(analysis.stp, analysis.scp),
                body: severePotential(analysis),
                chips: [
                    { label: 'STP', value: `${analysis.stp}` },
                    { label: 'SCP', value: `${analysis.scp}` },
                    { label: '0-3km LR', value: `${analysis.lr03}°C/km` },
                    { label: '700-500 LR', value: `${analysis.lr700_500}°C/km` },
                ],
            },
            {
                id: 'moisture',
                title: 'Moisture Profile',
                icon: '💧',
                iconBg: 'rgba(59,130,246,0.15)',
                severity: pwLevel(analysis.pw),
                body: moistureAnalysis(analysis),
                chips: [
                    { label: 'PW', value: `${analysis.pw.toFixed(2)} in` },
                ],
            },
        ],
    };
}

// Severity helpers for individual sections
function capeLevel(cape) {
    if (cape >= 4000) return { label: 'Extreme', color: '#a855f7' };
    if (cape >= 2500) return { label: 'High', color: '#ef4444' };
    if (cape >= 1000) return { label: 'Moderate', color: '#f97316' };
    if (cape >= 300) return { label: 'Marginal', color: '#eab308' };
    return { label: 'Low', color: '#22c55e' };
}

function shearLevel(shear06, srh03) {
    const score = (shear06 >= 50 ? 3 : shear06 >= 35 ? 2 : shear06 >= 20 ? 1 : 0)
        + (srh03 >= 300 ? 3 : srh03 >= 150 ? 2 : srh03 >= 50 ? 1 : 0);
    if (score >= 5) return { label: 'Extreme', color: '#a855f7' };
    if (score >= 4) return { label: 'High', color: '#ef4444' };
    if (score >= 2) return { label: 'Enhanced', color: '#f97316' };
    if (score >= 1) return { label: 'Marginal', color: '#eab308' };
    return { label: 'Low', color: '#22c55e' };
}

function compositeLevel(stp, scp) {
    if (stp > 6 || scp > 8) return { label: 'Extreme', color: '#a855f7' };
    if (stp > 3 || scp > 4) return { label: 'High', color: '#ef4444' };
    if (stp > 1 || scp > 1) return { label: 'Enhanced', color: '#f97316' };
    if (stp > 0.3 || scp > 0.5) return { label: 'Marginal', color: '#eab308' };
    return { label: 'Low', color: '#22c55e' };
}

function pwLevel(pw) {
    if (pw > 2.0) return { label: 'Extreme', color: '#a855f7' };
    if (pw > 1.5) return { label: 'High', color: '#ef4444' };
    if (pw > 1.0) return { label: 'Moderate', color: '#f97316' };
    if (pw > 0.5) return { label: 'Marginal', color: '#eab308' };
    return { label: 'Low', color: '#22c55e' };
}
