/**
 * WMO Station ID Lookup
 * Maps common 3-letter station identifiers to WMO numeric IDs used by UWyo
 */

export const STATIONS = {
    // Southern Plains
    'OUN': { wmo: '72357', name: 'Norman, OK' },
    'AMA': { wmo: '72363', name: 'Amarillo, TX' },
    'FWD': { wmo: '72249', name: 'Fort Worth, TX' },
    'SHV': { wmo: '72248', name: 'Shreveport, LA' },
    'LZK': { wmo: '72340', name: 'Little Rock, AR' },
    'MAF': { wmo: '72265', name: 'Midland, TX' },
    'DRT': { wmo: '72261', name: 'Del Rio, TX' },
    'CRP': { wmo: '72251', name: 'Corpus Christi, TX' },
    'BRO': { wmo: '72250', name: 'Brownsville, TX' },
    'EPZ': { wmo: '72364', name: 'Santa Teresa, NM' },

    // Central Plains
    'DDC': { wmo: '72451', name: 'Dodge City, KS' },
    'TOP': { wmo: '72456', name: 'Topeka, KS' },
    'ICT': { wmo: '72450', name: 'Wichita, KS' },
    'OAX': { wmo: '72558', name: 'Omaha, NE' },
    'LBF': { wmo: '72562', name: 'North Platte, NE' },

    // Northern Plains
    'ABR': { wmo: '72659', name: 'Aberdeen, SD' },
    'RAP': { wmo: '72662', name: 'Rapid City, SD' },
    'UNR': { wmo: '72668', name: 'Rapid City (UNR), SD' },
    'BIS': { wmo: '72764', name: 'Bismarck, ND' },
    'FGZ': { wmo: '72376', name: 'Flagstaff, AZ' },

    // Upper Midwest
    'MPX': { wmo: '72649', name: 'Minneapolis, MN' },
    'DVN': { wmo: '74455', name: 'Davenport, IA' },
    'ILX': { wmo: '74560', name: 'Lincoln, IL' },
    'GRB': { wmo: '72645', name: 'Green Bay, WI' },
    'INL': { wmo: '72747', name: 'International Falls, MN' },
    'APX': { wmo: '72634', name: 'Gaylord, MI' },
    'DTX': { wmo: '72632', name: 'Detroit, MI' },

    // Southeast
    'JAN': { wmo: '72235', name: 'Jackson, MS' },
    'BMX': { wmo: '72230', name: 'Birmingham, AL' },
    'TLH': { wmo: '72214', name: 'Tallahassee, FL' },
    'JAX': { wmo: '72206', name: 'Jacksonville, FL' },
    'TBW': { wmo: '72210', name: 'Tampa Bay, FL' },
    'MFL': { wmo: '72202', name: 'Miami, FL' },
    'GSO': { wmo: '72317', name: 'Greensboro, NC' },
    'MHX': { wmo: '72305', name: 'Morehead City, NC' },
    'CHS': { wmo: '72208', name: 'Charleston, SC' },
    'FFC': { wmo: '72215', name: 'Peachtree City, GA' },

    // Mid-Atlantic / Northeast
    'IAD': { wmo: '72403', name: 'Dulles, VA' },
    'WAL': { wmo: '72402', name: 'Wallops Island, VA' },
    'RNK': { wmo: '72318', name: 'Blacksburg, VA' },
    'PIT': { wmo: '72520', name: 'Pittsburgh, PA' },
    'BUF': { wmo: '72528', name: 'Buffalo, NY' },
    'ALB': { wmo: '72518', name: 'Albany, NY' },
    'OKX': { wmo: '72501', name: 'Upton, NY' },
    'CHH': { wmo: '74494', name: 'Chatham, MA' },
    'GYX': { wmo: '74389', name: 'Gray, ME' },
    'CAR': { wmo: '72712', name: 'Caribou, ME' },

    // Ohio Valley
    'ILN': { wmo: '72426', name: 'Wilmington, OH' },
    'SGF': { wmo: '72440', name: 'Springfield, MO' },

    // West
    'DNR': { wmo: '72469', name: 'Denver, CO' },
    'GJT': { wmo: '72476', name: 'Grand Junction, CO' },
    'SLC': { wmo: '72572', name: 'Salt Lake City, UT' },
    'BOI': { wmo: '72681', name: 'Boise, ID' },
    'TFX': { wmo: '72776', name: 'Great Falls, MT' },
    'GGW': { wmo: '72768', name: 'Glasgow, MT' },
    'MFR': { wmo: '72597', name: 'Medford, OR' },
    'SLE': { wmo: '72694', name: 'Salem, OR' },
    'UIL': { wmo: '72797', name: 'Quillayute, WA' },
    'OTX': { wmo: '72786', name: 'Spokane, WA' },
    'REV': { wmo: '72489', name: 'Reno, NV' },
    'VEF': { wmo: '72388', name: 'Las Vegas, NV' },
    'NKX': { wmo: '72293', name: 'San Diego, CA' },
    'VBG': { wmo: '72393', name: 'Vandenberg, CA' },
    'OAK': { wmo: '72493', name: 'Oakland, CA' },
    'RIW': { wmo: '72672', name: 'Riverton, WY' },

    // Alaska
    'ANC': { wmo: '70273', name: 'Anchorage, AK' },
    'FAI': { wmo: '70261', name: 'Fairbanks, AK' },
    'OTZ': { wmo: '70133', name: 'Kotzebue, AK' },
    'YAK': { wmo: '70361', name: 'Yakutat, AK' },

    // Hawaii
    'HIL': { wmo: '91285', name: 'Hilo, HI' },
    'LIH': { wmo: '91165', name: 'Lihue, HI' },
};

/**
 * Resolve a user-entered station string to a WMO numeric ID.
 * Accepts either a 3-letter code (OUN) or a numeric WMO ID (72357).
 * Returns { wmo, name } or null if not found.
 */
export function resolveStation(input) {
    const upper = input.trim().toUpperCase();

    // If it's already numeric, use it directly
    if (/^\d{4,5}$/.test(upper)) {
        // Try to find the name
        for (const [code, info] of Object.entries(STATIONS)) {
            if (info.wmo === upper) {
                return { wmo: upper, name: `${code} (${info.name})`, code };
            }
        }
        return { wmo: upper, name: `Station ${upper}`, code: upper };
    }

    // Look up by 3-letter code
    const entry = STATIONS[upper];
    if (entry) {
        return { wmo: entry.wmo, name: `${upper} (${entry.name})`, code: upper };
    }

    return null;
}

/**
 * Get a formatted list of stations for display
 */
export function getStationHints() {
    return getRegions();
}

/**
 * Region groupings for the dropdown
 */
function getRegions() {
    return {
        'Southern Plains': ['OUN', 'AMA', 'FWD', 'SHV', 'LZK', 'MAF', 'DRT', 'CRP', 'BRO', 'EPZ'],
        'Central Plains': ['DDC', 'TOP', 'ICT', 'OAX', 'LBF'],
        'Northern Plains': ['ABR', 'RAP', 'BIS'],
        'Upper Midwest': ['MPX', 'DVN', 'ILX', 'GRB', 'INL', 'APX', 'DTX'],
        'Ohio Valley': ['ILN', 'SGF'],
        'Southeast': ['JAN', 'BMX', 'TLH', 'JAX', 'TBW', 'MFL', 'GSO', 'MHX', 'CHS', 'FFC'],
        'Mid-Atlantic / Northeast': ['IAD', 'WAL', 'RNK', 'PIT', 'BUF', 'ALB', 'OKX', 'CHH', 'GYX', 'CAR'],
        'West': ['DNR', 'GJT', 'SLC', 'BOI', 'TFX', 'GGW', 'MFR', 'SLE', 'UIL', 'OTX', 'REV', 'VEF', 'NKX', 'VBG', 'OAK', 'RIW', 'FGZ'],
        'Alaska': ['ANC', 'FAI', 'OTZ', 'YAK'],
        'Hawaii': ['HIL', 'LIH'],
    };
}

/**
 * Populate a <select> element with station options grouped by region
 */
export function populateStationDropdown(selectEl, defaultCode = 'OUN') {
    const regions = getRegions();

    for (const [region, codes] of Object.entries(regions)) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = region;

        for (const code of codes) {
            const info = STATIONS[code];
            if (!info) continue;
            const option = document.createElement('option');
            option.value = code;
            option.textContent = `${code} — ${info.name}`;
            if (code === defaultCode) option.selected = true;
            optgroup.appendChild(option);
        }

        selectEl.appendChild(optgroup);
    }
}

