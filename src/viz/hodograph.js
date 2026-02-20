/**
 * Hodograph Diagram Renderer
 * Displays wind profile as a color-coded trace with storm motion vectors and SRH shading
 */

const RING_MAX = 80;  // Max speed in knots for rings

// Height layer colors (by AGL in km)
const LAYER_COLORS = [
    { min: 0, max: 1000, color: '#22c55e', label: '0-1 km' },
    { min: 1000, max: 3000, color: '#06b6d4', label: '1-3 km' },
    { min: 3000, max: 6000, color: '#eab308', label: '3-6 km' },
    { min: 6000, max: 9000, color: '#ef4444', label: '6-9 km' },
    { min: 9000, max: 99999, color: '#94a3b8', label: '9+ km' },
];

export class HodographDiagram {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.data = null;
        this.analysis = null;
        this.hoverIdx = -1;
        this.padding = 50;

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
        this.size = Math.min(this.W, this.H);
        this.cx = this.W / 2;
        this.cy = this.H / 2;
        this.radius = (this.size - this.padding * 2) / 2;
    }

    // Convert u,v (m/s) to canvas coordinates
    uvToXY(u, v) {
        const kts = 1.94384; // m/s to knots
        const scale = this.radius / RING_MAX;
        return {
            x: this.cx + u * kts * scale,
            y: this.cy - v * kts * scale, // y inverted
        };
    }

    draw() {
        this._resize();
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.W, this.H);

        this._drawBackground();
        this._drawRings();
        this._drawAxes();

        if (this.data && this.analysis) {
            this._drawSRHShading();
            this._drawWindTrace();
            this._drawStormMotion();
            this._drawLegend();
            this._drawHeightLabels();
        }

        this._drawHover();
    }

    _drawBackground() {
        const ctx = this.ctx;
        const grad = ctx.createRadialGradient(this.cx, this.cy, 0, this.cx, this.cy, this.radius * 1.2);
        grad.addColorStop(0, '#111d30');
        grad.addColorStop(1, '#0d1320');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, this.W, this.H);
    }

    _drawRings() {
        const ctx = this.ctx;
        const scale = this.radius / RING_MAX;

        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';

        for (let spd = 20; spd <= RING_MAX; spd += 20) {
            const r = spd * scale;
            ctx.strokeStyle = 'rgba(255,255,255,0.06)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(this.cx, this.cy, r, 0, Math.PI * 2);
            ctx.stroke();

            ctx.fillStyle = 'rgba(255,255,255,0.25)';
            ctx.fillText(`${spd} kt`, this.cx, this.cy - r - 3);
        }
    }

    _drawAxes() {
        const ctx = this.ctx;
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;

        // Horizontal axis
        ctx.beginPath();
        ctx.moveTo(this.cx - this.radius, this.cy);
        ctx.lineTo(this.cx + this.radius, this.cy);
        ctx.stroke();

        // Vertical axis
        ctx.beginPath();
        ctx.moveTo(this.cx, this.cy - this.radius);
        ctx.lineTo(this.cx, this.cy + this.radius);
        ctx.stroke();
    }

    _getWindUV(level) {
        const spdMs = level.windSpd * 0.51444;
        const rad = (level.windDir * Math.PI) / 180;
        return {
            u: -spdMs * Math.sin(rad),
            v: -spdMs * Math.cos(rad),
        };
    }

    _getLayerColor(agl) {
        for (const layer of LAYER_COLORS) {
            if (agl >= layer.min && agl < layer.max) return layer.color;
        }
        return '#94a3b8';
    }

    _drawSRHShading() {
        if (!this.analysis || !this.analysis.bunkers) return;
        const ctx = this.ctx;
        const sfcH = this.analysis.sfcHeight;
        const bunkers = this.analysis.bunkers;
        const storm = this.uvToXY(bunkers.right.u, bunkers.right.v);

        // Shade 0-3km SRH area
        const layerLevels = this.data.filter(l => (l.height - sfcH) >= 0 && (l.height - sfcH) <= 3000);
        if (layerLevels.length < 2) return;

        ctx.fillStyle = 'rgba(6,182,212,0.06)';
        ctx.beginPath();
        ctx.moveTo(storm.x, storm.y);

        for (const l of layerLevels) {
            const uv = this._getWindUV(l);
            const pt = this.uvToXY(uv.u, uv.v);
            ctx.lineTo(pt.x, pt.y);
        }

        ctx.closePath();
        ctx.fill();
    }

    _drawWindTrace() {
        const ctx = this.ctx;
        const levels = this.data;
        const sfcH = this.analysis.sfcHeight;

        // Draw line segments colored by height layer
        for (let i = 0; i < levels.length - 1; i++) {
            const a = levels[i], b = levels[i + 1];
            const agl = a.height - sfcH;
            const uvA = this._getWindUV(a);
            const uvB = this._getWindUV(b);
            const ptA = this.uvToXY(uvA.u, uvA.v);
            const ptB = this.uvToXY(uvB.u, uvB.v);

            ctx.strokeStyle = this._getLayerColor(agl);
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(ptA.x, ptA.y);
            ctx.lineTo(ptB.x, ptB.y);
            ctx.stroke();
        }

        // Draw dots at each level
        for (let i = 0; i < levels.length; i++) {
            const l = levels[i];
            const agl = l.height - sfcH;
            if (agl > 12000) break;
            const uv = this._getWindUV(l);
            const pt = this.uvToXY(uv.u, uv.v);

            ctx.fillStyle = this._getLayerColor(agl);
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, i === this.hoverIdx ? 5 : 3, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    _drawHeightLabels() {
        const ctx = this.ctx;
        const levels = this.data;
        const sfcH = this.analysis.sfcHeight;

        ctx.font = 'bold 9px Inter, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';

        const labelAt = [1000, 3000, 6000, 9000];

        for (const h of labelAt) {
            // Find closest level
            let closest = null;
            let minDiff = Infinity;
            for (const l of levels) {
                const diff = Math.abs((l.height - sfcH) - h);
                if (diff < minDiff) {
                    minDiff = diff;
                    closest = l;
                }
            }
            if (!closest || minDiff > 500) continue;

            const uv = this._getWindUV(closest);
            const pt = this.uvToXY(uv.u, uv.v);
            const agl = closest.height - sfcH;

            ctx.fillStyle = this._getLayerColor(agl);
            ctx.fillText(`${Math.round(agl / 1000)}km`, pt.x + 6, pt.y - 4);
        }
    }

    _drawStormMotion() {
        if (!this.analysis || !this.analysis.bunkers) return;
        const ctx = this.ctx;
        const b = this.analysis.bunkers;

        // Right mover
        const rPt = this.uvToXY(b.right.u, b.right.v);
        ctx.fillStyle = '#ef4444';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(rPt.x, rPt.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.font = 'bold 9px Inter, sans-serif';
        ctx.fillStyle = '#ef4444';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('RM', rPt.x + 10, rPt.y);

        // Left mover
        const lPt = this.uvToXY(b.left.u, b.left.v);
        ctx.fillStyle = '#3b82f6';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(lPt.x, lPt.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#3b82f6';
        ctx.fillText('LM', lPt.x + 10, lPt.y);
    }

    _drawLegend() {
        const ctx = this.ctx;
        const x = 10;
        let y = this.H - 10;

        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';

        for (let i = LAYER_COLORS.length - 1; i >= 0; i--) {
            const layer = LAYER_COLORS[i];
            ctx.fillStyle = layer.color;
            ctx.fillRect(x, y - 10, 12, 10);
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.fillText(layer.label, x + 16, y);
            y -= 16;
        }
    }

    _drawHover() {
        if (this.hoverIdx < 0 || !this.data) return;
        const l = this.data[this.hoverIdx];
        const uv = this._getWindUV(l);
        const pt = this.uvToXY(uv.u, uv.v);

        const ctx = this.ctx;
        // Crosshair
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(pt.x, this.cy - this.radius);
        ctx.lineTo(pt.x, this.cy + this.radius);
        ctx.moveTo(this.cx - this.radius, pt.y);
        ctx.lineTo(this.cx + this.radius, pt.y);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    _onMouseMove(e) {
        if (!this.data) return;
        const rect = this.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        // Find closest level
        let closest = -1;
        let minDist = 20;
        const sfcH = this.analysis ? this.analysis.sfcHeight : 0;

        for (let i = 0; i < this.data.length; i++) {
            if (this.data[i].height - sfcH > 12000) break;
            const uv = this._getWindUV(this.data[i]);
            const pt = this.uvToXY(uv.u, uv.v);
            const d = Math.sqrt((mx - pt.x) ** 2 + (my - pt.y) ** 2);
            if (d < minDist) {
                minDist = d;
                closest = i;
            }
        }

        this.hoverIdx = closest;
        this.draw();
        this._emitHover();
    }

    _onMouseLeave() {
        this.hoverIdx = -1;
        this.draw();
        const infoEl = document.getElementById('hodo-hover-info');
        if (infoEl) infoEl.textContent = '';
    }

    _emitHover() {
        const infoEl = document.getElementById('hodo-hover-info');
        if (!infoEl) return;

        if (this.hoverIdx < 0 || !this.data) {
            infoEl.textContent = '';
            return;
        }

        const l = this.data[this.hoverIdx];
        const sfcH = this.analysis ? this.analysis.sfcHeight : 0;
        const agl = l.height - sfcH;
        infoEl.textContent = `${Math.round(agl)}m AGL  |  ${l.windDir}° @ ${l.windSpd} kt`;
    }

    destroy() {
        this.canvas.removeEventListener('mousemove', this._onMouseMove);
        this.canvas.removeEventListener('mouseleave', this._onMouseLeave);
    }
}
