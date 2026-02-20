/**
 * Sounding Data Parser
 * Parses SPC/RAOB upper-air sounding text format
 */

/**
 * @typedef {Object} SoundingLevel
 * @property {number} pressure  - hPa
 * @property {number} height    - meters AGL
 * @property {number} temp      - °C
 * @property {number} dewpoint  - °C
 * @property {number} windDir   - degrees
 * @property {number} windSpd   - knots
 */

/**
 * @typedef {Object} SoundingData
 * @property {string} station
 * @property {string} time
 * @property {SoundingLevel[]} levels
 */

/**
 * Parse SPC-style sounding text into structured data.
 * Handles formats with header lines containing PRES, HGHT, TEMP, DWPT, DRCT, SKNT
 * and also plain numeric lines.
 */
export function parseSounding(text, stationName = 'Unknown', time = '') {
    const lines = text.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const levels = [];

    // Try to detect header to find column mapping
    let headerIndex = -1;
    let colMap = null;

    for (let i = 0; i < Math.min(lines.length, 20); i++) {
        const upper = lines[i].toUpperCase();
        if (upper.includes('PRES') && (upper.includes('HGHT') || upper.includes('HGT')) && upper.includes('TEMP')) {
            headerIndex = i;
            const tokens = upper.split(/\s+/);
            colMap = {};
            tokens.forEach((t, idx) => {
                if (t === 'PRES' || t === 'PRESSURE') colMap.pres = idx;
                else if (t === 'HGHT' || t === 'HGT' || t === 'HEIGHT') colMap.hght = idx;
                else if (t === 'TEMP' || t === 'TMPC') colMap.temp = idx;
                else if (t === 'DWPT' || t === 'TMDC' || t === 'DWPC') colMap.dwpt = idx;
                else if (t === 'DRCT' || t === 'WDIR') colMap.drct = idx;
                else if (t === 'SKNT' || t === 'WSPD' || t === 'KNOT') colMap.sknt = idx;
            });
            break;
        }
    }

    // Skip separator lines (dashes)
    const startIdx = headerIndex >= 0 ? headerIndex + 1 : 0;

    for (let i = startIdx; i < lines.length; i++) {
        const line = lines[i];

        // Skip separators and non-data lines
        if (/^[-=]+$/.test(line)) continue;
        if (/^[a-zA-Z]/.test(line) && !/^\d/.test(line)) continue;
        if (line.startsWith('%') || line.startsWith('#')) continue;

        const tokens = line.split(/[\s,;]+/).filter(t => t.length > 0);
        if (tokens.length < 6) continue;

        // All tokens should be numbers
        const nums = tokens.map(Number);
        if (nums.some(n => isNaN(n))) continue;

        let pres, hght, temp, dwpt, drct, sknt;

        if (colMap) {
            pres = nums[colMap.pres ?? 0];
            hght = nums[colMap.hght ?? 1];
            temp = nums[colMap.temp ?? 2];
            dwpt = nums[colMap.dwpt ?? 3];
            drct = nums[colMap.drct ?? 4];
            sknt = nums[colMap.sknt ?? 5];
        } else {
            // Default column order: PRES HGHT TEMP DWPT DRCT SKNT
            [pres, hght, temp, dwpt, drct, sknt] = nums;
        }

        // Sanity checks
        if (pres < 50 || pres > 1100) continue;
        if (temp < -100 || temp > 60) continue;
        if (dwpt < -100 || dwpt > 60) continue;
        // Some datasets use 9999 for missing
        if (temp > 9990 || dwpt > 9990) continue;

        levels.push({
            pressure: pres,
            height: hght,
            temp,
            dewpoint: dwpt,
            windDir: drct,
            windSpd: sknt,
        });
    }

    // Sort by pressure descending (surface first)
    levels.sort((a, b) => b.pressure - a.pressure);

    // Try to extract station/time from text header
    let parsedStation = stationName;
    let parsedTime = time;

    for (let i = 0; i < Math.min(lines.length, 10); i++) {
        const line = lines[i];
        // Look for station ID pattern
        const stMatch = line.match(/Station:\s*(\S+)/i) || line.match(/^(\w{3,4})\s+\d{6,}/);
        if (stMatch && parsedStation === 'Unknown') {
            parsedStation = stMatch[1];
        }
        // Look for time pattern
        const tmMatch = line.match(/(\d{2}Z?\s*\d{1,2}\s+\w{3}\s+\d{4})/i) || line.match(/(\d{4}-\d{2}-\d{2}\s+\d{2}Z?)/);
        if (tmMatch && !parsedTime) {
            parsedTime = tmMatch[1];
        }
    }

    return {
        station: parsedStation,
        time: parsedTime,
        levels,
    };
}
