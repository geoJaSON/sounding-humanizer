/**
 * Bundled example soundings — idealized ARCHETYPES, not observed data.
 *
 * Each profile is synthetic but physically consistent: heights are integrated
 * hypsometrically from the virtual temperature, and temperatures, moisture and
 * winds are in realistic ranges for the setting described. They exist so the
 * app can be explored offline; they should not be cited as real soundings.
 *
 * Format: pressure (hPa), height (m MSL), temp (°C), dewpoint (°C), wind dir (°), wind speed (kt)
 */

export const SAMPLE_SOUNDINGS = {
    tornadic: {
        station: 'Southern Plains (idealized)',
        time: 'Spring evening · inspired by OUN 00Z 4 May 1999',
        description: 'Classic Great Plains tornadic supercell environment',
        raw: `  PRES   HGHT   TEMP   DWPT   DRCT   SKNT
 966.0    357   28.6   20.4    160     15
 950.0    506   27.0   19.8    165     22
 925.0    741   24.8   18.8    170     30
 900.0    981   22.4   17.6    180     35
 875.0   1226   20.2   16.0    190     38
 850.0   1476   18.4   13.6    200     40
 825.0   1732   17.8    9.0    210     38
 800.0   1995   16.4    4.0    215     36
 775.0   2264   14.2    0.0    220     36
 750.0   2539   11.8   -3.0    225     38
 700.0   3111    7.0   -6.0    230     40
 650.0   3715    2.4  -10.0    235     43
 600.0   4356   -2.4  -14.0    240     47
 550.0   5039   -7.6  -19.0    240     52
 500.0   5773  -13.2  -25.0    245     56
 450.0   6566  -19.4  -32.0    245     62
 400.0   7429  -26.4  -39.0    245     68
 350.0   8377  -34.4  -46.0    245     75
 300.0   9435  -43.0  -53.0    245     82
 250.0  10640  -52.0  -61.0    250     90
 200.0  12068  -57.0  -68.0    250     85
 175.0  12911  -58.0  -72.0    250     75
 150.0  13877  -60.0  -75.0    250     65
 125.0  15012  -61.0  -78.0    250     55
 100.0  16391  -63.0  -80.0    250     45`,
    },

    elevated: {
        station: 'Central Plains (idealized)',
        time: 'Spring night · north of a warm front',
        description: 'Elevated instability above a cool surface layer — hail threat, low tornado risk',
        raw: `  PRES   HGHT   TEMP   DWPT   DRCT   SKNT
 975.0    270   10.0    8.0    120     10
 950.0    486    9.0    7.6    140     15
 925.0    707    9.8    8.2    170     22
 900.0    936   12.6   10.2    195     28
 875.0   1174   13.8   11.0    205     32
 850.0   1419   13.4   10.8    215     35
 825.0   1670   12.2    8.6    220     36
 800.0   1927   10.6    5.6    225     37
 775.0   2191    8.6    1.6    230     38
 750.0   2461    6.4   -2.4    235     39
 700.0   3023    2.0   -9.0    240     41
 650.0   3615   -2.6  -15.0    245     43
 600.0   4244   -7.6  -20.0    245     45
 550.0   4914  -13.0  -26.0    250     48
 500.0   5631  -19.0  -32.0    250     51
 450.0   6406  -25.4  -39.0    250     60
 400.0   7247  -32.6  -46.0    250     65
 350.0   8172  -40.8  -53.0    250     70
 300.0   9201  -49.4  -60.0    250     75
 250.0  10381  -54.4  -66.0    250     80
 200.0  11804  -56.4  -71.0    250     72
 150.0  13620  -58.4  -76.0    250     58
 100.0  16148  -62.0  -80.0    250     40`,
    },

    pulse: {
        station: 'Florida (idealized)',
        time: 'Summer afternoon · after daytime heating',
        description: 'Summer pulse/airmass storms — high CAPE, weak shear, heavy rain',
        raw: `  PRES   HGHT   TEMP   DWPT   DRCT   SKNT
1014.0     10   33.0   22.6    250      6
1000.0    136   31.4   22.2    240      7
 975.0    363   28.8   21.8    230      8
 950.0    594   26.4   20.6    230      8
 925.0    829   24.0   19.4    225      8
 900.0   1068   22.0   18.0    225      8
 875.0   1313   20.2   16.6    225      8
 850.0   1563   18.4   15.0    230      8
 800.0   2081   14.8   11.0    235      9
 750.0   2624   11.0    6.0    240     10
 700.0   3197    7.4    1.0    245     10
 650.0   3803    3.6   -3.0    250     10
 600.0   4449   -0.4   -7.0    255     11
 550.0   5139   -4.6  -12.0    260     12
 500.0   5884   -8.6  -17.0    265     12
 450.0   6693  -13.4  -23.0    270     12
 400.0   7580  -19.0  -29.0    270     12
 350.0   8561  -25.6  -36.0    270     12
 300.0   9660  -33.4  -44.0    260     12
 250.0  10916  -42.4  -53.0    240     14
 200.0  12388  -53.0  -64.0     60     15
 150.0  14187  -66.0  -76.0     70     18
 125.0  15277  -72.0  -82.0     70     18
 100.0  16578  -76.0  -86.0     80     15`,
    },
};

export function getSampleList() {
    return Object.entries(SAMPLE_SOUNDINGS).map(([key, val]) => ({
        key,
        station: val.station,
        time: val.time,
        description: val.description,
    }));
}

export function getSampleRaw(key) {
    return SAMPLE_SOUNDINGS[key];
}
