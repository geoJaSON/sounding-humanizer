/**
 * Skew-T / Log-P Diagram Renderer
 * Draws temperature/dewpoint traces, adiabats, wind barbs, CAPE/CIN shading, and parcel path
 */

const PMIN = 100;   // top of diagram (hPa)
const PMAX = 1050;  // bottom
const TMIN = -40;   // left edge (°C) at PMAX
const TMAX = 50;    // right edge (°C) at PMAX
const SKEW = 37;    // skew angle in degrees

export class SkewTDiagram {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.data = null;
        this.analysis = null;
        this.hoverP = null;
        this.padding = { top: 30, right: 55, bottom: 30, left: 50 };

        this._onMouseMove = this._onMouseMove.bind(this);
        this._onMouseLeave = this._onMouseLeave.bind(this);
        canvas.addEventListener('mousemove', this._onMouseMove);
        canvas.addEventListener('mouseleave', this._onMouseLeave);
    }

    setData(levels, analysis) {
        this.data = levels;
        this.analysis = analysis;
        this.draw();
    }

    _resize() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.W = rect.width;
        this.H = rect.height;
    }

    // Convert pressure to y-coordinate (log scale)
    pToY(p) {
        const { top, bottom } = this.padding;
        const h = this.H - top - bottom;
        const logP = Math.log(p);
        const logPmin = Math.log(PMIN);
        const logPmax = Math.log(PMAX);
        return top + h * (logP - logPmin) / (logPmax - logPmin);
    }

    // Convert y-coordinate back to pressure
    yToP(y) {
        const { top, bottom } = this.padding;
        const h = this.H - top - bottom;
        const logPmin = Math.log(PMIN);
        const logPmax = Math.log(PMAX);
        const logP = logPmin + (y - top) / h * (logPmax - logPmin);
        return Math.exp(logP);
    }

    // Convert temperature to x-coordinate (skewed)
    tToX(t, p) {
        const { left, right } = this.padding;
        const w = this.W - left - right;
        const y = this.pToY(p);
        const yBot = this.pToY(PMAX);
        const skewOffset = (yBot - y) * Math.tan(SKEW * Math.PI / 180);
        const tRange = TMAX - TMIN;
        return left + (t - TMIN) / tRange * w + skewOffset;
    }

    draw() {
        this._resize();
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.W, this.H);

        this._drawBackground();
        this._drawIsobars();
        this._drawIsotherms();
        this._drawDryAdiabats();
        this._drawMoistAdiabats();

        if (this.data && this.analysis) {
            this._drawCAPE_CIN();
            this._drawTraces();
            this._drawParcel();
            this._drawWindBarbs();
            this._drawMarkers();
        }

        this._drawHoverLine();
    }

    _drawBackground() {
        const ctx = this.ctx;
        const grad = ctx.createLinearGradient(0, 0, 0, this.H);
        grad.addColorStop(0, '#0d1320');
        grad.addColorStop(1, '#111d30');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, this.W, this.H);
    }

    _drawIsobars() {
        const ctx = this.ctx;
        const pressures = [1000, 925, 850, 700, 500, 400, 300, 250, 200, 150];
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.font = '10px Inter, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';

        for (const p of pressures) {
            const y = this.pToY(p);
            ctx.beginPath();
            ctx.moveTo(this.padding.left, y);
            ctx.lineTo(this.W - this.padding.right, y);
            ctx.stroke();
            ctx.fillText(`${p}`, this.padding.left - 5, y);
        }
    }

    _drawIsotherms() {
        const ctx = this.ctx;
        ctx.lineWidth = 0.5;

        for (let t = -80; t <= 50; t += 10) {
            ctx.strokeStyle = t === 0 ? 'rgba(6,182,212,0.25)' : 'rgba(255,255,255,0.04)';
            ctx.beginPath();
            ctx.moveTo(this.tToX(t, PMAX), this.pToY(PMAX));
            ctx.lineTo(this.tToX(t, PMIN), this.pToY(PMIN));
            ctx.stroke();
        }
    }

    _drawDryAdiabats() {
        const ctx = this.ctx;
        ctx.strokeStyle = 'rgba(239,68,68,0.08)';
        ctx.lineWidth = 0.5;
        const Rd_Cp = 287.04 / 1005.7;

        for (let theta = -30; theta <= 80; theta += 10) {
            ctx.beginPath();
            let first = true;
            for (let p = PMAX; p >= PMIN; p -= 10) {
                const t = (theta + 273.15) * Math.pow(p / 1000, Rd_Cp) - 273.15;
                const x = this.tToX(t, p);
                const y = this.pToY(p);
                if (first) { ctx.moveTo(x, y); first = false; }
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
    }

    _drawMoistAdiabats() {
        const ctx = this.ctx;
        ctx.strokeStyle = 'rgba(34,197,94,0.06)';
        ctx.lineWidth = 0.5;

        const es = (tc) => 6.112 * Math.exp((17.67 * tc) / (tc + 243.5));
        const eps = 0.622;

        for (let tStart = -10; tStart <= 40; tStart += 5) {
            ctx.beginPath();
            let t = tStart;
            let first = true;
            for (let p = 1050; p >= PMIN; p -= 5) {
                const x = this.tToX(t, p);
                const y = this.pToY(p);
                if (first) { ctx.moveTo(x, y); first = false; }
                else ctx.lineTo(x, y);
                // Step moist adiabat
                const e = es(t);
                const w = eps * e / (p - e);
                const Lv = 2.501e6;
                const Cp = 1005.7;
                const Rd = 287.04;
                const gamma = (Rd * (t + 273.15) + Lv * w) / (Cp + (Lv * Lv * w * eps) / (Rd * (t + 273.15) * (t + 273.15)));
                t -= gamma / p * 5;
            }
            ctx.stroke();
        }
    }

    _drawCAPE_CIN() {
        if (!this.analysis || !this.analysis.sbParcel) return;
        const ctx = this.ctx;
        const parcel = this.analysis.sbParcel;
        const levels = this.data;

        // Draw CAPE (positive buoyancy) and CIN (negative buoyancy) areas
        for (let i = 0; i < parcel.length - 1; i++) {
            const p1 = parcel[i].pressure;
            const p2 = parcel[i + 1].pressure;
            const pt1 = parcel[i].temp;
            const pt2 = parcel[i + 1].temp;

            // Find env temp
            let et1 = null, et2 = null;
            for (let j = 0; j < levels.length - 1; j++) {
                const a = levels[j], b = levels[j + 1];
                if (a.pressure >= p1 && b.pressure <= p1) {
                    const frac = (Math.log(p1) - Math.log(a.pressure)) / (Math.log(b.pressure) - Math.log(a.pressure));
                    et1 = a.temp + frac * (b.temp - a.temp);
                }
                if (a.pressure >= p2 && b.pressure <= p2) {
                    const frac = (Math.log(p2) - Math.log(a.pressure)) / (Math.log(b.pressure) - Math.log(a.pressure));
                    et2 = a.temp + frac * (b.temp - a.temp);
                }
            }
            if (et1 === null || et2 === null) continue;

            const isPositive = (pt1 + pt2) / 2 > (et1 + et2) / 2;

            ctx.fillStyle = isPositive ? 'rgba(239,68,68,0.12)' : 'rgba(59,130,246,0.1)';
            ctx.beginPath();
            ctx.moveTo(this.tToX(et1, p1), this.pToY(p1));
            ctx.lineTo(this.tToX(et2, p2), this.pToY(p2));
            ctx.lineTo(this.tToX(pt2, p2), this.pToY(p2));
            ctx.lineTo(this.tToX(pt1, p1), this.pToY(p1));
            ctx.closePath();
            ctx.fill();
        }
    }

    _drawTraces() {
        const ctx = this.ctx;
        const levels = this.data;

        // Temperature trace
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        levels.forEach((l, i) => {
            const x = this.tToX(l.temp, l.pressure);
            const y = this.pToY(l.pressure);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // Dewpoint trace
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        levels.forEach((l, i) => {
            const x = this.tToX(l.dewpoint, l.pressure);
            const y = this.pToY(l.pressure);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
    }

    _drawParcel() {
        if (!this.analysis || !this.analysis.sbParcel) return;
        const ctx = this.ctx;
        const parcel = this.analysis.sbParcel;

        ctx.strokeStyle = 'rgba(251,191,36,0.7)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        parcel.forEach((p, i) => {
            const x = this.tToX(p.temp, p.pressure);
            const y = this.pToY(p.pressure);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.setLineDash([]);
    }

    _drawWindBarbs() {
        if (!this.data) return;
        const ctx = this.ctx;
        const barbX = this.W - this.padding.right + 25;
        const levels = this.data;

        // Draw at select pressure levels
        const drawn = new Set();
        const targetPs = [1000, 975, 950, 925, 900, 875, 850, 800, 750, 700, 650, 600, 550, 500, 400, 300, 250, 200, 150];

        for (const lev of levels) {
            // Find closest target
            let closest = null;
            for (const tp of targetPs) {
                if (!drawn.has(tp) && Math.abs(lev.pressure - tp) < 20) {
                    closest = tp;
                    break;
                }
            }
            if (closest === null) continue;
            drawn.add(closest);

            const y = this.pToY(lev.pressure);
            this._drawBarb(ctx, barbX, y, lev.windDir, lev.windSpd);
        }
    }

    _drawBarb(ctx, cx, cy, dir, spdKts) {
        const len = 18;
        const rad = ((dir + 180) * Math.PI) / 180;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rad);

        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1.2;
        ctx.lineCap = 'round';

        // Staff
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -len);
        ctx.stroke();

        let remaining = spdKts;
        let pos = -len;
        const barbLen = 8;
        const gap = 3.5;

        // Flags (50 kt)
        while (remaining >= 50) {
            ctx.beginPath();
            ctx.moveTo(0, pos);
            ctx.lineTo(barbLen, pos + gap);
            ctx.lineTo(0, pos + gap * 2);
            ctx.fill();
            pos += gap * 2 + 1;
            remaining -= 50;
        }

        // Full barbs (10 kt)
        while (remaining >= 10) {
            ctx.beginPath();
            ctx.moveTo(0, pos);
            ctx.lineTo(barbLen, pos + gap / 2);
            ctx.stroke();
            pos += gap;
            remaining -= 10;
        }

        // Half barb (5 kt)
        if (remaining >= 5) {
            ctx.beginPath();
            ctx.moveTo(0, pos);
            ctx.lineTo(barbLen / 2, pos + gap / 3);
            ctx.stroke();
        }

        // Circle for calm
        if (spdKts < 3) {
            ctx.beginPath();
            ctx.arc(0, 0, 3, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.restore();
    }

    _drawMarkers() {
        if (!this.analysis) return;
        const ctx = this.ctx;
        const a = this.analysis;

        const markers = [];
        if (a.lclPressure) markers.push({ p: a.lclPressure, label: 'LCL', color: '#06b6d4' });
        if (a.lfcPressure) markers.push({ p: a.lfcPressure, label: 'LFC', color: '#f59e0b' });
        if (a.elPressure) markers.push({ p: a.elPressure, label: 'EL', color: '#a855f7' });

        ctx.font = 'bold 10px Inter, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        for (const m of markers) {
            const y = this.pToY(m.p);
            // Dashed line
            ctx.strokeStyle = m.color;
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(this.padding.left, y);
            ctx.lineTo(this.W - this.padding.right, y);
            ctx.stroke();
            ctx.setLineDash([]);

            // Label
            ctx.fillStyle = m.color;
            ctx.fillText(m.label, this.padding.left + 3, y - 8);
        }
    }

    _drawHoverLine() {
        if (this.hoverP === null || !this.data) return;
        const ctx = this.ctx;
        const y = this.pToY(this.hoverP);

        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(this.padding.left, y);
        ctx.lineTo(this.W - this.padding.right, y);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    _onMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const y = e.clientY - rect.top;
        this.hoverP = this.yToP(y);

        if (this.hoverP < PMIN || this.hoverP > PMAX) {
            this.hoverP = null;
        }

        this.draw();
        this._emitHover();
    }

    _onMouseLeave() {
        this.hoverP = null;
        this.draw();
        const infoEl = document.getElementById('skewt-hover-info');
        if (infoEl) infoEl.textContent = '';
    }

    _emitHover() {
        if (!this.hoverP || !this.data) return;
        const infoEl = document.getElementById('skewt-hover-info');
        if (!infoEl) return;

        // Interpolate values
        const levels = this.data;
        let t = null, td = null, h = null;
        for (let i = 0; i < levels.length - 1; i++) {
            const a = levels[i], b = levels[i + 1];
            if (a.pressure >= this.hoverP && b.pressure <= this.hoverP) {
                const frac = (Math.log(this.hoverP) - Math.log(a.pressure)) / (Math.log(b.pressure) - Math.log(a.pressure));
                t = (a.temp + frac * (b.temp - a.temp)).toFixed(1);
                td = (a.dewpoint + frac * (b.dewpoint - a.dewpoint)).toFixed(1);
                h = Math.round(a.height + frac * (b.height - a.height));
                break;
            }
        }

        if (t !== null) {
            infoEl.textContent = `${Math.round(this.hoverP)} hPa  |  ${h}m  |  T: ${t}°C  Td: ${td}°C`;
        }
    }

    destroy() {
        this.canvas.removeEventListener('mousemove', this._onMouseMove);
        this.canvas.removeEventListener('mouseleave', this._onMouseLeave);
    }
}
