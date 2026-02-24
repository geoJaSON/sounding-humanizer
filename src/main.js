/**
 * Sounding Humanizer — Main Entry Point
 * Fetch-only flow: fetch from UWyo archive → parse → analyze → display
 */

import './style.css';
import { parseSounding } from './parser/sounding.js';
import { analyzeSounding } from './calc/thermo.js';
import { SkewTDiagram } from './viz/skewt.js';
import { HodographDiagram } from './viz/hodograph.js';
import { humanize } from './analysis/humanizer.js';
import { resolveStation, populateStationDropdown } from './data/stations.js';

// ---- DOM refs ----
const fetchLanding = document.getElementById('fetch-landing');
const dataView = document.getElementById('data-view');
const headerControls = document.getElementById('header-controls');
const stationNameEl = document.getElementById('station-name');
const stationTimeEl = document.getElementById('station-time');
const severityBadge = document.getElementById('severity-badge');
const paramsBar = document.getElementById('params-bar');
const analysisSection = document.getElementById('analysis-section');
const fetchError = document.getElementById('fetch-error');

// ---- Diagrams ----
let skewtDiagram = null;
let hodoDiagram = null;

// ---- Init ----
function init() {
    // Default to the latest available sounding
    // Soundings launch at 00Z and 12Z — data typically appears ~2 hrs later
    const dateInput = document.getElementById('fetch-date');
    const hourSelect = document.getElementById('fetch-hour');
    if (dateInput && hourSelect) {
        const now = new Date();
        const utcHour = now.getUTCHours();
        let targetDate = new Date(now);
        let targetHour = '12';

        if (utcHour >= 14) {
            // After 14Z → today's 12Z should be available
            targetHour = '12';
        } else if (utcHour >= 2) {
            // After 02Z → today's 00Z should be available
            targetHour = '00';
        } else {
            // Before 02Z → yesterday's 12Z is the latest
            targetDate.setUTCDate(targetDate.getUTCDate() - 1);
            targetHour = '12';
        }

        const y = targetDate.getUTCFullYear();
        const m = String(targetDate.getUTCMonth() + 1).padStart(2, '0');
        const d = String(targetDate.getUTCDate()).padStart(2, '0');
        dateInput.value = `${y}-${m}-${d}`;
        hourSelect.value = targetHour;
    }

    // Populate station dropdown
    const stationSelect = document.getElementById('fetch-station');
    if (stationSelect) {
        populateStationDropdown(stationSelect, 'OUN');
    }

    // Fetch submit
    document.getElementById('btn-fetch-submit')?.addEventListener('click', handleFetch);

    // Enter key on station input
    document.getElementById('fetch-station')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleFetch();
    });

    // "Fetch New Sounding" header button — go back to landing
    document.getElementById('btn-new-fetch')?.addEventListener('click', showFetchLanding);

    // Resize handling
    window.addEventListener('resize', () => {
        if (skewtDiagram) skewtDiagram.draw();
        if (hodoDiagram) hodoDiagram.draw();
    });
}

// ---- Show Fetch Landing ----
function showFetchLanding() {
    fetchLanding.style.display = '';
    dataView.classList.add('hidden');
    headerControls.style.display = 'none';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---- Handle Fetch ----
async function handleFetch() {
    const stationCode = document.getElementById('fetch-station').value;
    const date = document.getElementById('fetch-date').value;
    const hour = document.getElementById('fetch-hour').value;

    if (!date) {
        showError('Please select a date.');
        return;
    }

    // Resolve station code to WMO ID
    const resolved = resolveStation(stationCode);
    if (!resolved) {
        showError('Invalid station selection.');
        return;
    }

    hideError();

    const [year, month, day] = date.split('-');

    // Use Vite's dev server proxy to bypass CORS
    const url = `/api/sounding?region=naconf&TYPE=TEXT%3ALIST&YEAR=${year}&MONTH=${month}&FROM=${day}${hour}&TO=${day}${hour}&STNM=${resolved.wmo}`;

    const submitBtn = document.getElementById('btn-fetch-submit');
    const origContent = submitBtn.innerHTML;
    submitBtn.innerHTML = `<span class="spinner-inline"></span> Fetching...`;
    submitBtn.disabled = true;

    try {
        const resp = await fetch(url);

        if (!resp.ok) {
            throw new Error(`Server returned ${resp.status}. The station or date may be invalid.`);
        }

        const html = await resp.text();

        // Check for "Can't get" error from UWyo
        if (html.includes("Can't get") || html.includes('Sorry')) {
            throw new Error('No data available for this station/date/time combination. Try a different date or station.');
        }

        // Extract the <pre> content from the HTML response
        const preMatch = html.match(/<pre>([\s\S]*?)<\/pre>/i);
        if (!preMatch) {
            throw new Error('No sounding data found in the response. The station may not have data for this date/time.');
        }

        const rawText = preMatch[1]
            .replace(/<[^>]*>/g, '') // strip any HTML tags inside <pre>
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&');

        const parsed = parseSounding(rawText, resolved.name, `${hour}Z ${day} ${monthName(parseInt(month))} ${year}`);

        if (parsed.levels.length < 5) {
            throw new Error('Could not parse enough data levels from the response. The sounding may be incomplete or the format unexpected.');
        }

        processData(parsed);

    } catch (err) {
        showError(err.message);
    } finally {
        submitBtn.innerHTML = origContent;
        submitBtn.disabled = false;
    }
}

function monthName(m) {
    return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1] || '';
}

function showError(msg) {
    fetchError.textContent = msg;
    fetchError.classList.remove('hidden');
}

function hideError() {
    fetchError.classList.add('hidden');
    fetchError.textContent = '';
}

// ---- Process & Display ----
function processData(parsed) {
    const analysis = analyzeSounding(parsed.levels);
    if (!analysis) {
        showError('Error computing analysis — not enough valid data levels.');
        return;
    }

    const humanized = humanize(analysis);

    // Switch from fetch landing to data view
    fetchLanding.style.display = 'none';
    dataView.classList.remove('hidden');
    headerControls.style.display = '';

    // Station bar
    stationNameEl.textContent = parsed.station || 'Unknown Station';
    stationTimeEl.textContent = parsed.time || '';

    // Severity badge
    const sev = humanized.severity;
    severityBadge.dataset.level = sev.level;
    severityBadge.querySelector('.badge-text').textContent = `${sev.label} Risk`;

    // Init diagrams
    if (!skewtDiagram) {
        skewtDiagram = new SkewTDiagram(document.getElementById('skewt-canvas'));
    }
    if (!hodoDiagram) {
        hodoDiagram = new HodographDiagram(document.getElementById('hodo-canvas'));
    }

    // Small delay so layout is settled before drawing
    requestAnimationFrame(() => {
        skewtDiagram.setData(parsed.levels, analysis);
        hodoDiagram.setData(parsed.levels, analysis);
    });

    // Parameters bar
    renderParams(analysis);

    // Analysis cards
    renderAnalysis(humanized);

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---- Render Parameters ----
function renderParams(a) {
    const params = [
        { label: 'SBCAPE', value: a.sbcape, unit: 'J/kg', max: 6000, color: capeColor(a.sbcape), desc: 'Surface-Based Convective Available Potential Energy. Measures total instability for air parcels originating from the surface.' },
        { label: 'MLCAPE', value: a.mlcape, unit: 'J/kg', max: 6000, color: capeColor(a.mlcape), desc: 'Mixed-Layer CAPE. Measures instability for air parcels mixed over the lowest 100 mb, often a better representation of afternoon storm potential.' },
        { label: 'CIN', value: a.sbcin, unit: 'J/kg', max: 300, color: '#3b82f6', desc: 'Convective Inhibition. The negative energy or "cap" that suppresses rising parcels. Large negative values mean a strong cap and fewer storms; near-zero means storms can form easily.' },
        { label: 'LCL', value: a.lclHeight, unit: 'm', max: 3000, color: '#06b6d4', desc: 'Lifted Condensation Level. The estimated height of cloud bases. Lower LCLs (under 1000m) are generally more favorable for tornadoes.' },
        { label: '0-6km Shear', value: a.shear06, unit: 'kt', max: 80, color: shearColor(a.shear06), desc: 'Deep-layer wind shear. Critical for thunderstorm organization and supercell development.' },
        { label: '0-1km Shear', value: a.shear01, unit: 'kt', max: 50, color: shearColor(a.shear01), desc: 'Low-level wind shear. Important for low-level mesocyclone and tornado potential.' },
        { label: '0-1km SRH', value: a.srh01, unit: 'm²/s²', max: 500, color: srhColor(a.srh01), desc: 'Storm-Relative Helicity in the lowest 1km. Measures the potential for cyclonic updraft rotation.' },
        { label: '0-3km SRH', value: a.srh03, unit: 'm²/s²', max: 600, color: srhColor(a.srh03), desc: 'Storm-Relative Helicity in the lowest 3km. Measures overall potential for mid-level updraft rotation.' },
        { label: 'STP', value: a.stp, unit: '', max: 10, color: stpColor(a.stp), desc: 'Significant Tornado Parameter. A composite index combining CAPE, LCL, SRH, and Shear to assess significant tornado risk.' },
        { label: 'SCP', value: a.scp, unit: '', max: 10, color: stpColor(a.scp), desc: 'Supercell Composite Parameter. A composite index of CAPE, SRH, and Bulk Shear indicating conditions favorable for supercells.' },
        { label: 'PW', value: a.pw.toFixed(2), unit: 'in', max: 3, color: '#3b82f6', desc: 'Precipitable Water. Total column moisture. High values indicate heavy rain potential; low values increase dry microburst risk.' },
        { label: '700-500 LR', value: a.lr700_500, unit: '°C/km', max: 10, color: '#f97316', desc: 'Mid-level Lapse Rate. Rate of cooling with height. Steeper rates (over 7°C/km) enhance updraft acceleration and large hail potential.' },
    ];

    paramsBar.innerHTML = params.map(p => {
        const pct = Math.min(100, Math.abs(parseFloat(p.value)) / p.max * 100);
        return `
      <div class="param-card" title="${p.desc}">
        <div class="param-label">${p.label}</div>
        <div class="param-value">${p.value}<span class="param-unit">${p.unit}</span></div>
        <div class="param-bar" style="width:${pct}%;background:${p.color};"></div>
      </div>
    `;
    }).join('');
}

function capeColor(c) {
    if (c >= 4000) return '#a855f7';
    if (c >= 2500) return '#ef4444';
    if (c >= 1000) return '#f97316';
    if (c >= 300) return '#eab308';
    return '#22c55e';
}

function shearColor(s) {
    if (s >= 50) return '#ef4444';
    if (s >= 35) return '#f97316';
    if (s >= 20) return '#eab308';
    return '#22c55e';
}

function srhColor(s) {
    if (s >= 300) return '#a855f7';
    if (s >= 150) return '#ef4444';
    if (s >= 50) return '#eab308';
    return '#22c55e';
}

function stpColor(s) {
    if (s >= 6) return '#a855f7';
    if (s >= 3) return '#ef4444';
    if (s >= 1) return '#f97316';
    if (s > 0) return '#eab308';
    return '#22c55e';
}

// ---- Render Analysis Cards ----
function renderAnalysis(h) {
    let html = `
    <div class="analysis-card full-width" style="animation-delay:0s;">
      <div class="card-header">
        <div class="card-icon" style="background:rgba(255,255,255,0.05);">📋</div>
        <h3>At a Glance</h3>
      </div>
      <div class="card-body" style="font-size:0.95rem;line-height:1.8;">
        ${h.headline}
      </div>
    </div>
  `;

    h.sections.forEach((s, idx) => {
        html += `
      <div class="analysis-card" style="animation-delay:${(idx + 1) * 0.08}s;">
        <div class="card-header">
          <div class="card-icon" style="background:${s.iconBg};">${s.icon}</div>
          <h3>${s.title}</h3>
          <div class="card-severity" style="background:${s.severity.color}20;color:${s.severity.color};">${s.severity.label}</div>
        </div>
        <div class="card-body">
          ${s.body}
        </div>
        <div class="card-detail">
          ${s.chips.map(c => `<div class="detail-chip"><span>${c.label}:</span> <span class="chip-value">${c.value}</span></div>`).join('')}
        </div>
      </div>
    `;
    });

    analysisSection.innerHTML = html;
}

// ---- Boot ----
init();
