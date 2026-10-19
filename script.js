const imageConfig = {
    Airmass: {
        layout: 'quad',
        columns: [
            { id: 'gfs', title: 'GFS' },
            { id: 'icon', title: 'ICON' },
        ],
        rows: [
            { id: 'fzl', title: 'Freezing Level' },
            { id: 'snow', title: 'Snow Level' },
        ],
        left: { folder: 'FZL', title: 'FZL' },
        right: { folder: 'Snow level', title: 'Snow Level' },
        topLeft: { title: 'Freezing Level' },
        topRight: { title: 'Freezing Level' },
        bottomLeft: { title: 'Snow Level' },
        bottomRight: { title: 'Snow Level' },
    },
    BG: {
        layout: 'pair',
        columns: [
            { id: 'gfs', title: 'GFS' },
            { id: 'icon', title: 'ICON' },
        ],
        rows: [
            { id: 'fog', title: 'Fog & Low Cloud' },
        ],
        left: { folder: 'US', title: 'GFS' },
        right: { folder: 'ICON', title: 'ICON' },
        topLeft: { title: 'Fog & Low Cloud' },
        topRight: { title: 'Fog & Low Cloud' },
    },
    TS: {
        layout: 'quad',
        columns: [
            { id: 'gfs', title: 'GFS' },
            { id: 'icon', title: 'ICON' },
        ],
        rows: [
            { id: 'flash', title: 'Thunderstorms' },
            { id: 'severe', title: 'Storm Dynamics' },
        ],
        left: { folder: 'Flash density', title: 'Flash Density' },
        right: { folder: 'Severe storm potential', title: 'Severe Storm Potential' },
        topLeft: { title: 'Thunderstorms' },
        topRight: { title: 'Thunderstorms' },
        bottomLeft: { title: 'Storm Dynamics' },
        bottomRight: { title: 'Storm Dynamics' },
    },
    Turb: {
        layout: 'quad',
        columns: [
            { id: 'gfs', title: 'GFS' },
            { id: 'icon', title: 'ICON' },
        ],
        rows: [
            { id: 'mtw', title: 'Mountain Waves' },
            { id: 'wind', title: 'Low Level Turbulence' },
        ],
        left: { folder: 'MTW', title: 'MTW' },
        right: { folder: 'Wind', title: 'Wind' },
        topLeft: { title: 'Mountain Waves' },
        topRight: { title: 'Mountain Waves' },
        bottomLeft: { title: 'Low Level Turbulence' },
        bottomRight: { title: 'Low Level Turbulence' },
    }
};

function isQuadCategory(category) {
    return (imageConfig[category]?.layout || 'pair') === 'quad';
}

function getFrameImagePaths(framePair) {
    if (!framePair) {
        return [];
    }
    if (framePair.topLeftPath || framePair.topRightPath || framePair.bottomLeftPath || framePair.bottomRightPath) {
        return [
            framePair.topLeftPath,
            framePair.topRightPath,
            framePair.bottomLeftPath,
            framePair.bottomRightPath,
        ].filter(Boolean);
    }
    return [framePair.leftPath, framePair.rightPath].filter(Boolean);
}

function formatRunStamp(dateValue) {
    if (!(dateValue instanceof Date) || Number.isNaN(dateValue.getTime())) {
        return null;
    }
    const day = String(dateValue.getUTCDate()).padStart(2, '0');
    const month = String(dateValue.getUTCMonth() + 1).padStart(2, '0');
    const year = String(dateValue.getUTCFullYear()).slice(-2);
    const hour = String(dateValue.getUTCHours()).padStart(2, '0');
    return `${year}/${month}/${day} ${hour}Z`;
}

function formatCornerRunHtml(framePair, columns) {
    const runs = columns.map((column, index) => {
        const stamp = formatRunStamp(getColumnRunDate(framePair, index));
        if (!stamp) {
            return null;
        }
        return {
            title: column.title || `Col ${index + 1}`,
            stamp,
        };
    }).filter(Boolean);

    if (runs.length === 0) {
        return { html: '—', title: '' };
    }

    const uniqueStamps = [...new Set(runs.map((run) => run.stamp))];
    if (uniqueStamps.length === 1) {
        return {
            html: `<span class="map-run-kicker">Run</span><span class="map-run-stamp">${uniqueStamps[0]}</span>`,
            title: `Run ${uniqueStamps[0]}`,
        };
    }

    return {
        html: runs
            .map((run) => `<span class="map-run-model">${run.title} ${run.stamp}</span>`)
            .join(''),
        title: runs.map((run) => `${run.title} ${run.stamp}`).join(' · '),
    };
}

function getColumnRunDate(framePair, columnIndex) {
    if (!framePair) {
        return null;
    }
    const quad = isQuadCategory(currentCategory);
    const path = columnIndex === 0
        ? (quad
            ? (framePair.topLeftPath || framePair.bottomLeftPath)
            : (framePair.leftPath || framePair.topLeftPath))
        : (quad
            ? (framePair.topRightPath || framePair.bottomRightPath)
            : (framePair.rightPath || framePair.topRightPath));
    return parseValidDateFromFramePath(path);
}

function getAxisMaxValue(pair, axis) {
    const raw = pair?.getAttribute(`data-max-${axis}`);
    return raw === '0' || raw === '1' ? raw : '';
}

function isAxisMaximizeActive(pair = getImagePairEl()) {
    return Boolean(getAxisMaxValue(pair, 'col') || getAxisMaxValue(pair, 'row'));
}

function syncAxisMaximizeButtons() {
    const pair = getImagePairEl();
    const config = imageConfig[currentCategory];
    if (!pair) {
        return;
    }

    const maxCol = getAxisMaxValue(pair, 'col');
    const maxRow = getAxisMaxValue(pair, 'row');
    const quad = isQuadCategory(currentCategory);
    pair.classList.toggle('has-axis-max', Boolean(maxCol || maxRow));

    pair.querySelectorAll('.map-col-header').forEach((header) => {
        const col = header.getAttribute('data-col');
        const title = config?.columns?.[Number(col)]?.title || `Column ${Number(col) + 1}`;
        const pressed = maxCol === col;
        header.setAttribute('aria-pressed', pressed ? 'true' : 'false');
        header.title = pressed ? `Restore full width (${title})` : `Maximize ${title} column`;
        header.setAttribute('aria-label', header.title);
    });

    pair.querySelectorAll('.map-row-header').forEach((header) => {
        const row = header.getAttribute('data-row');
        const title = config?.rows?.[Number(row)]?.title || `Row ${Number(row) + 1}`;
        const pressed = maxRow === row;
        const available = quad || row === '0';
        header.disabled = !available;
        header.setAttribute('aria-pressed', pressed ? 'true' : 'false');
        if (!available) {
            header.title = title;
            header.setAttribute('aria-label', title);
            return;
        }
        // Pair layout has only one product row — maximizing it is a no-op, so disable.
        if (!quad) {
            header.disabled = true;
            header.title = title;
            header.setAttribute('aria-label', title);
            return;
        }
        header.title = pressed ? `Restore full height (${title})` : `Maximize ${title} row`;
        header.setAttribute('aria-label', header.title);
    });

    const runLabel = document.getElementById('map-run-label');
    if (runLabel) {
        const canRestore = Boolean(maxCol || maxRow);
        runLabel.disabled = !canRestore;
        runLabel.setAttribute(
            'aria-label',
            canRestore ? 'Restore full map table' : 'Model run time'
        );
        runLabel.title = canRestore
            ? 'Click to restore full map table'
            : (runLabel.getAttribute('data-run-title') || '');
    }
}

function setAxisMaximize(axis, value, { notify = true } = {}) {
    const pair = getImagePairEl();
    if (!pair || (axis !== 'col' && axis !== 'row')) {
        return;
    }

    const next = value === '0' || value === '1' ? value : '';
    if (axis === 'row' && next && !isQuadCategory(currentCategory)) {
        return;
    }

    if (next) {
        pair.setAttribute(`data-max-${axis}`, next);
    } else {
        pair.setAttribute(`data-max-${axis}`, '');
    }

    syncAxisMaximizeButtons();
    if (notify) {
        notifyMapLayoutChanged();
    }
}

function toggleAxisMaximize(axis, index) {
    const pair = getImagePairEl();
    if (!pair) {
        return;
    }
    const key = String(index);
    if (key !== '0' && key !== '1') {
        return;
    }
    const current = getAxisMaxValue(pair, axis);
    setAxisMaximize(axis, current === key ? '' : key);
}

function clearAxisMaximize({ notify = true } = {}) {
    const pair = getImagePairEl();
    if (!pair) {
        return false;
    }
    const hadMax = isAxisMaximizeActive(pair);
    pair.setAttribute('data-max-col', '');
    pair.setAttribute('data-max-row', '');
    syncAxisMaximizeButtons();
    if (hadMax && notify) {
        notifyMapLayoutChanged();
    }
    return hadMax;
}

function updateMapTableChrome(framePair = null) {
    const pair = getImagePairEl();
    const config = imageConfig[currentCategory];
    if (!pair || !config) {
        return;
    }

    const columns = config.columns || [];
    const rows = config.rows || [];
    const quad = isQuadCategory(currentCategory);

    pair.dataset.cols = String(columns.length || 2);
    pair.dataset.rows = String(quad ? Math.max(rows.length, 2) : 1);
    if (!pair.hasAttribute('data-max-col')) {
        pair.setAttribute('data-max-col', '');
    }
    if (!pair.hasAttribute('data-max-row')) {
        pair.setAttribute('data-max-row', '');
    }
    // Pair layout cannot keep a maximized second row.
    if (!quad && getAxisMaxValue(pair, 'row')) {
        pair.setAttribute('data-max-row', '');
    }

    columns.forEach((column, index) => {
        const header = document.getElementById(`map-col-header-${index}`);
        const label = header?.querySelector('.map-axis-label');
        if (label) {
            label.textContent = column.title || `Col ${index + 1}`;
        }
    });

    rows.forEach((row, index) => {
        const header = document.getElementById(`map-row-header-${index}`);
        const label = header?.querySelector('.map-axis-label');
        if (label) {
            label.textContent = row.title || `Row ${index + 1}`;
        }
    });

    // Clear unused row headers so pair layout cannot keep stale quad labels.
    for (let index = rows.length; index < 2; index += 1) {
        const header = document.getElementById(`map-row-header-${index}`);
        const label = header?.querySelector('.map-axis-label');
        if (label) {
            label.textContent = '';
        }
    }

    const runLabel = document.getElementById('map-run-label');
    if (!runLabel) {
        syncAxisMaximizeButtons();
        return;
    }

    const runDisplay = formatCornerRunHtml(framePair, columns);
    if (!runDisplay.title) {
        runLabel.textContent = runDisplay.html;
        runLabel.removeAttribute('data-run-title');
    } else {
        runLabel.innerHTML = runDisplay.html;
        runLabel.setAttribute('data-run-title', runDisplay.title);
        if (!isAxisMaximizeActive(pair)) {
            runLabel.title = runDisplay.title;
        }
    }

    syncAxisMaximizeButtons();
}

function syncImagePairLayout() {
    const pair = getImagePairEl();
    if (!pair) {
        return;
    }
    const quad = isQuadCategory(currentCategory);
    pair.classList.toggle('layout-quad', quad);
    pair.classList.toggle('layout-pair', !quad);
    updateMapTableChrome(getCurrentFramePairs()?.[currentFrame - 1] || null);
}

const domainHotkeys = {
    '1': 'AU',
    '2': 'WA_SA',
    '3': 'VIC_TAS',
    '4': 'NSW'
};

const categoryHotkeys = {
    f: 'BG',
    s: 'TS',
    a: 'Airmass',
    t: 'Turb'
};

const LEGEND_PREFS_KEY = 'avmaps.legendPrefs.v1';
const TIMEZONE_PREFS_KEY = 'avmaps.timezonePrefs.v2';
const TIMEZONE_OPTIONS = {
    UTC: { abbr: 'UTC', offsetMinutes: 0 },
    AWST: { abbr: 'AWST', offsetMinutes: 8 * 60 },
    ACST: { abbr: 'ACST', offsetMinutes: (9 * 60) + 30 },
    AEST: { abbr: 'AEST', offsetMinutes: 10 * 60 },
    ACDT: { abbr: 'ACDT', offsetMinutes: (10 * 60) + 30 },
    AEDT: { abbr: 'AEDT', offsetMinutes: 11 * 60 },
};
const DEFAULT_TIMEZONE_KEY = 'UTC';
const EXCLUDED_LEGEND_FIELD_IDS = new Set([
    'airmass-fzl-fzl',
    'airmass-snow-level',
]);

const FALLBACK_LEGENDS = {
    BG: {
        left: {
            title: 'US',
            fields: [
                {
                    id: 'bg-precip',
                    label: '1 hr precipitation',
                    units: 'mm/h',
                    items: [
                        { color: '#f0ff96', label: '0.1-0.2' },
                        { color: '#ffff00', label: '0.5-1' },
                        { color: '#009600', label: '5-7.5' },
                        { color: '#00c8ff', label: '10-15' },
                        { color: '#0000ff', label: '20-30' },
                        { color: '#ff6400', label: '30-40' },
                        { color: '#ff0000', label: '40-50' },
                        { color: '#320000', label: '50+' },
                    ],
                },
                {
                    id: 'bg-drizzle',
                    label: 'Drizzle',
                    units: 'avg RH %',
                    items: [
                        { color: '#00ff00', label: '95-100' },
                    ],
                    note: 'Shown where layer-average RH exceeds 95%.',
                },
                {
                    id: 'bg-low-cloud',
                    label: 'Low cloud',
                    units: 'max RH %',
                    items: [
                        { color: '#c86400', label: '85-90' },
                        { color: '#aa5500', label: '90-95' },
                        { color: '#6d3600', label: '95-100' },
                    ],
                },
                {
                    id: 'bg-fog',
                    label: 'Fog',
                    units: 'category',
                    items: [
                        { color: '#ff0000', label: 'F1' },
                        { color: '#ffaa7f', label: 'F2' },
                        { color: '#ffff00', label: 'F3' },
                    ],
                },
            ],
        },
        right: {
            title: 'ICON',
            fields: [
                {
                    id: 'icon-bg-precip',
                    label: '1 hr precipitation',
                    units: 'mm/h',
                    items: [
                        { color: '#f0ff96', label: '0.1-0.2' },
                        { color: '#ffff00', label: '0.5-1' },
                        { color: '#009600', label: '5-7.5' },
                        { color: '#00c8ff', label: '10-15' },
                        { color: '#0000ff', label: '20-30' },
                        { color: '#ff6400', label: '30-40' },
                        { color: '#ff0000', label: '40-50' },
                        { color: '#320000', label: '50+' },
                    ],
                },
                {
                    id: 'icon-bg-drizzle',
                    label: 'Drizzle',
                    units: 'avg RH %',
                    items: [
                        { color: '#00ff00', label: '95-100' },
                    ],
                    note: 'Shown where layer-average RH exceeds 95%.',
                },
                {
                    id: 'icon-bg-low-cloud',
                    label: 'Low cloud',
                    units: 'max RH %',
                    items: [
                        { color: '#c86400', label: '85-90' },
                        { color: '#aa5500', label: '90-95' },
                        { color: '#6d3600', label: '95-100' },
                    ],
                },
                {
                    id: 'icon-bg-fog',
                    label: 'Fog',
                    units: 'category',
                    items: [
                        { color: '#ff0000', label: 'F1' },
                        { color: '#ffaa7f', label: 'F2' },
                        { color: '#ffff00', label: 'F3' },
                    ],
                },
            ],
        },
    },
    TS: {
        left: {
            title: 'Flash density',
            fields: [
                {
                    id: 'ts-flash-precip',
                    label: '1 hr thunderstorm precipitation',
                    units: 'mm/h',
                    items: [
                        { color: '#00ff00', label: '0.1-0.3' },
                        { color: '#fffb00', label: '0.5-1' },
                        { color: '#ff9900', label: '5-7.5' },
                        { color: '#ff0000', label: '15-20' },
                        { color: '#ff20d6', label: '40-50' },
                        { color: '#651dff', label: '60-100' },
                    ],
                },
            ],
        },
        right: {
            title: 'Severe storm potential',
            fields: [
                {
                    id: 'ts-severe-sighail',
                    label: 'SigHail',
                    units: 'index',
                    items: [
                        { color: 'rgba(97,0,97,0.47)', label: '0.1-0.4' },
                        { color: 'rgba(0,127,254,0.47)', label: '0.4-0.7' },
                        { color: 'rgba(0,254,70,0.47)', label: '0.9-1.2' },
                        { color: 'rgba(254,202,0,0.47)', label: '1.6-1.9' },
                        { color: 'rgba(254,70,0,0.47)', label: '2.0-2.2' },
                        { color: 'rgba(254,0,0,0.47)', label: '2.2-3.0' },
                        { color: 'rgba(254,210,210,0.47)', label: '3.5-5+' },
                    ],
                },
                {
                    id: 'ts-severe-isotachs',
                    label: 'Upper isotachs',
                    units: 'kt',
                    items: [
                        { color: '#000080', label: '80-100' },
                        { color: '#ffff00', label: '100-120' },
                        { color: '#ff6600', label: '120-140' },
                        { color: '#ff0000', label: '140-160' },
                        { color: '#800000', label: '160-180' },
                        { color: '#ff00ff', label: '180+' },
                    ],
                },
                {
                    id: 'ts-severe-shear-barbs',
                    label: '0-6km bulk shear',
                    units: '',
                    items: [
                        { pattern: 'barb', color: '#2b0000', label: '0-6km bulk shear' },
                    ],
                },
            ],
        },
    },
    Airmass: {
        left: {
            title: 'FZL',
            fields: [
                {
                    id: 'airmass-fzl-freezing-layer',
                    label: 'Freezing layer',
                    units: 'hatch',
                    items: [
                        { pattern: 'crosshatch', label: 'Multiple 0C crossings' },
                    ],
                },
                {
                    id: 'airmass-fzl-icing',
                    label: 'Icing severity',
                    units: '%',
                    items: [
                        { color: '#00ccff', label: '95-97.5' },
                        { color: '#00ffff', label: '97.5-100' },
                    ],
                },
                {
                    id: 'airmass-fzl-thermals',
                    label: 'Thermals',
                    units: 'ft',
                    items: [
                        { color: '#ffcc00', label: '6000-10000' },
                        { color: '#ff6600', label: '10000-20000+' },
                    ],
                },
                {
                    id: 'airmass-fzl-hail',
                    label: '1 hr small hail',
                    units: 'mm/h',
                    items: [
                        { color: '#b2ebf2', label: '0.1-0.5' },
                        { color: '#00bcd4', label: '2.5-5' },
                        { color: '#0097a7', label: '5-10' },
                        { color: '#006064', label: '10-20' },
                        { color: '#00363a', label: '20+' },
                    ],
                },
                {
                    id: 'airmass-fzl-freezing-fog',
                    label: 'Freezing fog',
                    units: 'category',
                    items: [
                        { color: '#ff0000', label: 'F1' },
                        { color: '#ffaa7f', label: 'F2' },
                        { color: '#ffff00', label: 'F3' },
                    ],
                },
            ],
        },
        right: {
            title: 'Snow level',
            fields: [
                {
                    id: 'airmass-snow-precip',
                    label: '1 hr snow',
                    units: 'mm/h',
                    items: [
                        { color: '#00b7ff', label: '0.1-0.2' },
                        { color: '#54d6ff', label: '0.5-1' },
                        { color: '#a8eeff', label: '1-2' },
                        { color: '#e9fcff', label: '4-8' },
                        { color: '#ffffff', label: '8+' },
                    ],
                },
            ],
        },
    },
    Turb: {
        left: {
            title: 'MTW',
            fields: [
                {
                    id: 'turb-mtw-intensity',
                    label: 'Mountain wave intensity',
                    units: 'm/s',
                    items: [
                        { color: '#ff9900', label: '0.2-0.4' },
                        { color: '#ff0000', label: '0.4-0.6' },
                        { color: '#ff00ff', label: '0.6+' },
                    ],
                },
            ],
        },
        right: {
            title: 'Wind',
            fields: [
                {
                    id: 'turb-wind-max850',
                    label: 'Max wind below 5000ft',
                    units: 'kt',
                    items: [
                        { color: '#00ff00', label: '25-30' },
                        { color: '#0064ff', label: '40-45' },
                        { color: '#ff0000', label: '50-55' },
                        { color: '#be0000', label: '70-80' },
                        { color: '#960000', label: '80+' },
                    ],
                },
                {
                    id: 'turb-wind-turbulence',
                    label: 'Shear and lee turbulence',
                    units: 'category',
                    items: [
                        { color: '#ffcc00', label: 'MOD' },
                        { color: '#ff6600', label: 'SEV' },
                        { color: '#ff0000', label: 'EXT' },
                    ],
                },
            ],
        },
    },
};

let currentCategory = 'BG';
let currentDomain = 'AU';
let currentFrame = 1;
const DEFAULT_MAX_FRAMES = 40;
const DECODE_WINDOW_RADIUS = 15;
let maxFrames = DEFAULT_MAX_FRAMES;
let isPlaying = false;
let animationInterval = null;
let animationSpeed = 500;
let selectedRangeStart = 1;
let selectedRangeEnd = DEFAULT_MAX_FRAMES;
let selectedTimezoneKey = DEFAULT_TIMEZONE_KEY;
let frameManifest = null;
const framePairsCache = {};
const decodedImageObjects = new Map();
const pendingDecodePromises = new Map();

let frameSlider;
let frameRangeStartSlider;
let frameRangeEndSlider;
let frameSelectionHighlight;
let rangeStartTimeLabel;
let rangeEndTimeLabel;
let currentFrameTimeLabel;
let timezoneSelect;
let leftImage;
let rightImage;
let bottomLeftImage;
let bottomRightImage;
const mapImagesByPanel = {};
let playBtn;
let speedSlider;
let speedDisplay;
let categoryButtons;
let mobileCategorySelect;
let mobileDomainSelect;
let loadingOverlay;
let loadingBarFill;
let loadingStatus;
let infoBtn;
let infoOverlay;
let infoCloseBtn;
let legendStrip;
let legendContent;
let legendToggleBtn;
let controlsPanel;

let legendEnabled = false;
let hiddenLegendFields = {};

function ensureDomainCache(domainId) {
    if (!framePairsCache[domainId]) {
        framePairsCache[domainId] = {};
    }
    return framePairsCache[domainId];
}

function normalizeFrameManifest(manifest) {
    const normalized = manifest || {};
    const domains = normalized.domains || {};
    const domainOrder = Array.isArray(normalized.domainOrder) && normalized.domainOrder.length > 0
        ? normalized.domainOrder
        : Object.keys(domains);

    const normalizedDomains = {};

    domainOrder.forEach(domainId => {
        normalizedDomains[domainId] = {
            ...domains[domainId],
            categories: domains[domainId]?.categories || {}
        };
    });

    return {
        ...normalized,
        domainOrder,
        domains: normalizedDomains,
        legends: normalized.legends || {}
    };
}

function getLegendStoragePayload() {
    return {
        hiddenFields: hiddenLegendFields,
    };
}

function loadLegendPreferences() {
    try {
        const raw = localStorage.getItem(LEGEND_PREFS_KEY);
        if (!raw) {
            return;
        }

        const parsed = JSON.parse(raw);
        hiddenLegendFields = parsed?.hiddenFields && typeof parsed.hiddenFields === 'object'
            ? parsed.hiddenFields
            : {};
    } catch (error) {
        console.warn('Unable to restore legend preferences:', error);
    }
}

function loadTimezonePreference() {
    try {
        const raw = localStorage.getItem(TIMEZONE_PREFS_KEY);
        if (!raw) {
            return;
        }

        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.timezone === 'string' && TIMEZONE_OPTIONS[parsed.timezone]) {
            selectedTimezoneKey = parsed.timezone;
        }
    } catch (error) {
        console.warn('Unable to restore timezone preference:', error);
    }
}

function saveTimezonePreference() {
    try {
        localStorage.setItem(TIMEZONE_PREFS_KEY, JSON.stringify({ timezone: selectedTimezoneKey }));
    } catch (error) {
        console.warn('Unable to save timezone preference:', error);
    }
}

function saveLegendPreferences() {
    try {
        localStorage.setItem(LEGEND_PREFS_KEY, JSON.stringify(getLegendStoragePayload()));
    } catch (error) {
        console.warn('Unable to save legend preferences:', error);
    }
}

function getLegendConfigForCategory(category) {
    const manifestLegend = frameManifest?.legends?.[category];
    if (manifestLegend?.left || manifestLegend?.right) {
        return manifestLegend;
    }
    return FALLBACK_LEGENDS[category] || null;
}

function getFieldHiddenState(category, panelKey, fieldId) {
    return Boolean(hiddenLegendFields?.[category]?.[panelKey]?.includes(fieldId));
}

function setFieldHiddenState(category, panelKey, fieldId, isHidden) {
    if (!hiddenLegendFields[category]) {
        hiddenLegendFields[category] = {};
    }
    if (!hiddenLegendFields[category][panelKey]) {
        hiddenLegendFields[category][panelKey] = [];
    }

    const bucket = hiddenLegendFields[category][panelKey];
    const index = bucket.indexOf(fieldId);
    if (isHidden && index === -1) {
        bucket.push(fieldId);
    }
    if (!isHidden && index !== -1) {
        bucket.splice(index, 1);
    }
}

function getFieldAccentColor(field) {
    const items = Array.isArray(field?.items) ? field.items : [];
    const picked = items.find(item => item?.color && !String(item.color).includes('rgba(255,255,255,0)'));
    if (picked) return picked?.color || '#7d9ecf';
    const barbItem = items.find(item => item?.pattern === 'barb');
    if (barbItem) return barbItem?.color || '#2b0000';
    return '#7d9ecf';
}

function createBarbSwatch(color) {
    const c = color || '#2b0000';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '20');
    svg.setAttribute('height', '12');
    svg.setAttribute('viewBox', '0 0 20 12');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.display = 'inline-block';
    svg.style.verticalAlign = 'middle';
    svg.style.flexShrink = '0';

    const makeLine = (x1, y1, x2, y2) => {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x1); line.setAttribute('y1', y1);
        line.setAttribute('x2', x2); line.setAttribute('y2', y2);
        line.setAttribute('stroke', c);
        line.setAttribute('stroke-width', '1.6');
        line.setAttribute('stroke-linecap', 'round');
        return line;
    };

    // Staff
    svg.appendChild(makeLine(2, 6, 18, 6));
    // Two barbs at the left end, slanted back (away from rightward motion)
    svg.appendChild(makeLine(2, 6, 0.5, 10));
    svg.appendChild(makeLine(5.5, 6, 4, 10));

    return svg;
}

function createCrosshatchSwatch(color) {
    const c = color || '#4a5a74';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '12');
    svg.setAttribute('height', '12');
    svg.setAttribute('viewBox', '0 0 12 12');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.display = 'inline-block';
    svg.style.verticalAlign = 'middle';
    svg.style.flexShrink = '0';

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', '0.5');
    rect.setAttribute('y', '0.5');
    rect.setAttribute('width', '11');
    rect.setAttribute('height', '11');
    rect.setAttribute('fill', '#ffffff');
    rect.setAttribute('stroke', 'rgba(0, 0, 0, 0.24)');
    rect.setAttribute('stroke-width', '1');
    svg.appendChild(rect);

    const makeLine = (x1, y1, x2, y2) => {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
        line.setAttribute('stroke', c);
        line.setAttribute('stroke-width', '1');
        line.setAttribute('stroke-linecap', 'round');
        return line;
    };

    // Two diagonal sets to represent crosshatching.
    svg.appendChild(makeLine(0, 9, 3, 12));
    svg.appendChild(makeLine(0, 5, 7, 12));
    svg.appendChild(makeLine(0, 1, 11, 12));
    svg.appendChild(makeLine(3, 0, 12, 9));
    svg.appendChild(makeLine(7, 0, 12, 5));
    svg.appendChild(makeLine(11, 0, 12, 1));

    svg.appendChild(makeLine(0, 3, 3, 0));
    svg.appendChild(makeLine(0, 7, 7, 0));
    svg.appendChild(makeLine(0, 11, 11, 0));
    svg.appendChild(makeLine(5, 12, 12, 5));
    svg.appendChild(makeLine(9, 12, 12, 9));

    return svg;
}

function formatLegendLabel(label) {
    const raw = (label || '').toString().trim();
    if (!raw) return raw;

    const overrides = {
        '1h precipitation': '1 hr precipitation',
        'low cloud': 'Low cloud',
        '1h thunderstorm precipitation': '1 hr thunderstorm precipitation',
        'upper isotachs (250 hpa)': 'Upper isotachs',
        '0-6km bulk shear': '0-6km bulk shear',
        'icing rh': 'Icing severity',
        'thermals (pblh)': 'Thermals',
        'cold pool hail precip': '1 hr small hail',
        'freezing fog': 'Freezing fog',
        '1h snow precipitation': '1 hr snow',
        'mountain wave intensity': 'Mountain wave intensity',
        'max wind below 850 hpa': 'Max wind below 5000ft',
        'shear and lee turbulence': 'Shear and lee turbulence',
    };

    return overrides[raw.toLowerCase()] || raw;
}

function normalizeLegendFieldForCompare(field) {
    return {
        label: field?.label || '',
        units: field?.units || '',
        note: field?.note || '',
        items: (field?.items || []).map(item => ({
            color: item?.color || '',
            label: item?.label || '',
            pattern: item?.pattern || '',
        })),
    };
}

function areLegendPanelsEquivalent(panelA, panelB) {
    const fieldsA = (panelA?.fields || []).map(normalizeLegendFieldForCompare);
    const fieldsB = (panelB?.fields || []).map(normalizeLegendFieldForCompare);
    return JSON.stringify(fieldsA) === JSON.stringify(fieldsB);
}

function applyLegendLayoutState() {
    document.body.classList.toggle('legend-enabled', legendEnabled);

    if (legendStrip) {
        legendStrip.classList.toggle('is-hidden', !legendEnabled);
    }
    if (legendToggleBtn) {
        legendToggleBtn.textContent = legendEnabled ? 'Hide legend' : 'Show legend';
        legendToggleBtn.setAttribute('aria-label', legendEnabled ? 'Hide legend' : 'Show legend');
    }

    if (legendStrip) {
        legendStrip.setAttribute('aria-label', legendEnabled ? 'Legend panel' : 'Legend hidden. Use Show legend to restore.');
    }

    requestAnimationFrame(updateViewerBottomOffset);
    setTimeout(updateViewerBottomOffset, 220);
}

function updateViewerBottomOffset() {
    if (!controlsPanel) {
        return;
    }

    const controlsHeight = Math.ceil(controlsPanel.getBoundingClientRect().height);
    if (controlsHeight > 0) {
        document.body.style.setProperty('--viewer-bottom-offset', `${controlsHeight}px`);
    }
}

function renderLegend() {
    if (!legendContent) {
        return;
    }

    legendContent.innerHTML = '';
    if (!legendEnabled) {
        applyLegendLayoutState();
        return;
    }

    const legendConfig = getLegendConfigForCategory(currentCategory);
    if (!legendConfig) {
        applyLegendLayoutState();
        return;
    }

    const panelKeys = ['left', 'right'];
    const panelKeysToRender = [];

    panelKeys.forEach(panelKey => {
        const panelConfig = legendConfig[panelKey];
        if (!panelConfig) {
            return;
        }

        const existingKey = panelKeysToRender.find(key => {
            const existingPanel = legendConfig[key];
            return areLegendPanelsEquivalent(existingPanel, panelConfig);
        });

        if (!existingKey) {
            panelKeysToRender.push(panelKey);
        }
    });

    panelKeysToRender.forEach(panelKey => {
        const panelConfig = legendConfig[panelKey];
        if (!panelConfig) {
            return;
        }

        const panelNode = document.createElement('section');
        panelNode.className = 'legend-panel';
        panelNode.setAttribute('aria-label', panelConfig.title || panelKey.toUpperCase());

        const togglesNode = document.createElement('div');
        togglesNode.className = 'legend-field-toggles';

        const fieldsToRender = (panelConfig.fields || []).filter(field => !EXCLUDED_LEGEND_FIELD_IDS.has(field?.id));

        fieldsToRender.forEach((field, index) => {
            const fieldId = field.id || `${panelKey}-${index}`;
            const hidden = getFieldHiddenState(currentCategory, panelKey, fieldId);

            const toggleBtn = document.createElement('button');
            toggleBtn.type = 'button';
            toggleBtn.className = `legend-field-toggle${hidden ? ' is-disabled' : ''}`;
            toggleBtn.setAttribute('aria-pressed', hidden ? 'false' : 'true');

            const barbItem = (field.items || []).find(item => item?.pattern === 'barb');
            const crosshatchItem = (field.items || []).find(item => item?.pattern === 'crosshatch');
            if (barbItem) {
                const barbSvg = createBarbSwatch(barbItem.color);
                toggleBtn.appendChild(barbSvg);
            } else if (crosshatchItem) {
                const hatchSwatch = createCrosshatchSwatch(crosshatchItem.color);
                toggleBtn.appendChild(hatchSwatch);
            } else {
                const dot = document.createElement('span');
                dot.className = 'legend-field-toggle-dot';
                dot.style.setProperty('--legend-dot-color', getFieldAccentColor(field));
                toggleBtn.appendChild(dot);
            }

            const toggleLabel = document.createElement('span');
            toggleLabel.className = 'legend-field-toggle-label';
            toggleLabel.textContent = formatLegendLabel(field.label || fieldId);
            toggleBtn.appendChild(toggleLabel);

            toggleBtn.addEventListener('click', () => {
                setFieldHiddenState(currentCategory, panelKey, fieldId, !hidden);
                saveLegendPreferences();
                renderLegend();
            });

            togglesNode.appendChild(toggleBtn);
        });

        panelNode.appendChild(togglesNode);
        legendContent.appendChild(panelNode);
    });

    legendContent.classList.toggle('single-panel', panelKeysToRender.length === 1);

    applyLegendLayoutState();
}

async function loadFrameManifest(forceRefresh = false) {
    if (forceRefresh || frameManifest === null) {
        const manifestUrl = forceRefresh
            ? `images/manifest.json?t=${Date.now()}`
            : 'images/manifest.json';

        const response = await fetch(manifestUrl, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`Unable to read frame manifest: ${response.status}`);
        }

        frameManifest = normalizeFrameManifest(await response.json());
    }

    return frameManifest;
}

async function loadCategoryFrames(domainId, category, forceRefresh = false) {
    const domainCache = ensureDomainCache(domainId);
    if (!forceRefresh && Array.isArray(domainCache[category])) {
        return domainCache[category];
    }

    const manifest = await loadFrameManifest(forceRefresh);
    const framePairs = manifest?.domains?.[domainId]?.categories?.[category];
    domainCache[category] = Array.isArray(framePairs) ? framePairs : [];
    return domainCache[category];
}

function getCurrentFramePairs() {
    return framePairsCache[currentDomain]?.[currentCategory] || [];
}

function setMaxFramesForCurrentSelection() {
    const framePairs = getCurrentFramePairs();
    maxFrames = framePairs.length > 0 ? framePairs.length : DEFAULT_MAX_FRAMES;
    frameSlider.max = maxFrames;
    selectedRangeStart = Math.max(1, Math.min(selectedRangeStart, maxFrames));
    selectedRangeEnd = Math.max(selectedRangeStart, Math.min(selectedRangeEnd, maxFrames));
    frameRangeStartSlider.min = 1;
    frameRangeStartSlider.max = maxFrames;
    frameRangeStartSlider.value = selectedRangeStart;
    frameRangeEndSlider.min = 1;
    frameRangeEndSlider.max = maxFrames;
    frameRangeEndSlider.value = selectedRangeEnd;
    currentFrame = clampFrameToSelectedRange(currentFrame);
    frameSlider.value = currentFrame;
    updateSelectedRangeHighlight();
    updateRangeTimeDisplay();
}

function clampFrameToSelectedRange(frame) {
    return Math.max(selectedRangeStart, Math.min(frame, selectedRangeEnd));
}

function getSelectedRangeSize() {
    return (selectedRangeEnd - selectedRangeStart) + 1;
}

function updateSelectedRangeHighlight() {
    if (!frameSelectionHighlight || maxFrames <= 0) {
        return;
    }

    const startPercent = ((selectedRangeStart - 1) / maxFrames) * 100;
    const widthPercent = (getSelectedRangeSize() / maxFrames) * 100;
    frameSelectionHighlight.style.left = `${startPercent}%`;
    frameSelectionHighlight.style.width = `${widthPercent}%`;
}

function parseValidDateFromFramePath(path) {
    if (typeof path !== 'string' || path.length === 0) {
        return null;
    }

    const match = path.match(/_(\d{8})_(\d{2})_(\d{2})\.[^.]+$/);
    if (!match) {
        return null;
    }

    const [, ymd, initHourText] = match;
    const year = Number(ymd.slice(0, 4));
    const monthIndex = Number(ymd.slice(4, 6)) - 1;
    const day = Number(ymd.slice(6, 8));
    const initHour = Number(initHourText);

    if (![year, monthIndex, day, initHour].every(Number.isFinite)) {
        return null;
    }

    return new Date(Date.UTC(year, monthIndex, day, initHour, 0, 0));
}

function getValidDateForFramePair(framePair) {
    if (!framePair) {
        return null;
    }

    const pathCandidates = getFrameImagePaths(framePair);
    let baseDate = null;
    for (const path of pathCandidates) {
        baseDate = parseValidDateFromFramePath(path);
        if (baseDate) {
            break;
        }
    }
    const leadHour = Number(framePair.hour);

    if (!baseDate || !Number.isFinite(leadHour)) {
        return null;
    }

    return new Date(baseDate.getTime() + (leadHour * 60 * 60 * 1000));
}

function formatDateForRangeDisplay(dateValue) {
    if (!(dateValue instanceof Date) || Number.isNaN(dateValue.getTime())) {
        return '--';
    }

    const timezone = TIMEZONE_OPTIONS[selectedTimezoneKey] || TIMEZONE_OPTIONS[DEFAULT_TIMEZONE_KEY];
    const shiftedDate = new Date(dateValue.getTime() + (timezone.offsetMinutes * 60 * 1000));
    const day = String(shiftedDate.getUTCDate()).padStart(2, '0');
    const month = String(shiftedDate.getUTCMonth() + 1).padStart(2, '0');
    const year = shiftedDate.getUTCFullYear();
    const shortYear = String(year).slice(-2);
    const hour = String(shiftedDate.getUTCHours()).padStart(2, '0');
    const minute = String(shiftedDate.getUTCMinutes()).padStart(2, '0');

    const isMobile = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
    if (isMobile) {
        return `${day}/${month}/${shortYear} ${hour} ${timezone.abbr}`;
    }

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = dayNames[shiftedDate.getUTCDay()];
    return `${dayName} ${day}/${month}/${year}, ${hour}:${minute} ${timezone.abbr}`;
}

function updateRangeTimeDisplay() {
    if (!rangeStartTimeLabel || !rangeEndTimeLabel) {
        return;
    }

    const framePairs = getCurrentFramePairs();
    if (framePairs.length === 0) {
        rangeStartTimeLabel.textContent = '--';
        rangeEndTimeLabel.textContent = '--';
        return;
    }

    const startFramePair = framePairs[selectedRangeStart - 1];
    const endFramePair = framePairs[selectedRangeEnd - 1];
    rangeStartTimeLabel.textContent = formatDateForRangeDisplay(getValidDateForFramePair(startFramePair));
    rangeEndTimeLabel.textContent = formatDateForRangeDisplay(getValidDateForFramePair(endFramePair));
}

function updateCurrentTimestepDisplay(framePair = null) {
    if (!currentFrameTimeLabel) {
        return;
    }

    currentFrameTimeLabel.textContent = formatDateForRangeDisplay(getValidDateForFramePair(framePair));
}

function updateRangeStartValue(value) {
    selectedRangeStart = Math.max(1, Math.min(value, selectedRangeEnd));
    frameRangeStartSlider.value = selectedRangeStart;
    currentFrame = clampFrameToSelectedRange(currentFrame);
    frameSlider.value = currentFrame;
    updateSelectedRangeHighlight();
    updateRangeTimeDisplay();
    updateImages();
}

function updateRangeEndValue(value) {
    selectedRangeEnd = Math.min(maxFrames, Math.max(value, selectedRangeStart));
    frameRangeEndSlider.value = selectedRangeEnd;
    currentFrame = clampFrameToSelectedRange(currentFrame);
    frameSlider.value = currentFrame;
    updateSelectedRangeHighlight();
    updateRangeTimeDisplay();
    updateImages();
}

function initializeElements() {
    frameSlider = document.getElementById('frame-slider');
    frameRangeStartSlider = document.getElementById('frame-range-start');
    frameRangeEndSlider = document.getElementById('frame-range-end');
    frameSelectionHighlight = document.getElementById('frame-selection-highlight');
    rangeStartTimeLabel = document.getElementById('range-start-time');
    rangeEndTimeLabel = document.getElementById('range-end-time');
    currentFrameTimeLabel = document.getElementById('current-frame-time');
    timezoneSelect = document.getElementById('timezone-select');
    leftImage = document.getElementById('left-image');
    rightImage = document.getElementById('right-image');
    bottomLeftImage = document.getElementById('bottom-left-image');
    bottomRightImage = document.getElementById('bottom-right-image');
    mapImagesByPanel.topLeft = leftImage;
    mapImagesByPanel.topRight = rightImage;
    mapImagesByPanel.bottomLeft = bottomLeftImage;
    mapImagesByPanel.bottomRight = bottomRightImage;
    playBtn = document.getElementById('play-btn');
    speedSlider = document.getElementById('speed-slider');
    speedDisplay = document.getElementById('speed-display');
    categoryButtons = document.querySelectorAll('.category-btn');
    mobileCategorySelect = document.getElementById('mobile-category-select');
    mobileDomainSelect = document.getElementById('mobile-domain-select');
    loadingOverlay = document.getElementById('loading-overlay');
    loadingBarFill = document.getElementById('loading-bar-fill');
    loadingStatus = document.getElementById('loading-status');
    infoBtn = document.getElementById('info-btn');
    infoOverlay = document.getElementById('info-overlay');
    infoCloseBtn = document.getElementById('info-close-btn');
    legendStrip = document.getElementById('legend-strip');
    legendContent = document.getElementById('legend-content');
    legendToggleBtn = document.getElementById('legend-toggle-btn');
    controlsPanel = document.querySelector('.controls');
}

function isInfoModalOpen() {
    return infoOverlay && !infoOverlay.classList.contains('hidden');
}

function openInfoModal() {
    stopAnimation();
    infoOverlay.classList.remove('hidden');
    infoOverlay.setAttribute('aria-hidden', 'false');
}

function closeInfoModal() {
    infoOverlay.classList.add('hidden');
    infoOverlay.setAttribute('aria-hidden', 'true');
}

function setLoadingProgress(completedCount, totalCount) {
    if (!loadingBarFill || !loadingStatus) {
        return;
    }

    if (totalCount === 0) {
        loadingBarFill.style.width = '0%';
        loadingStatus.textContent = 'Preparing frames...';
        return;
    }

    const percent = totalCount === 0 ? 100 : Math.round((completedCount / totalCount) * 100);
    loadingBarFill.style.width = `${percent}%`;
    loadingStatus.textContent = `Loading frames... ${completedCount} of ${totalCount}`;
}

function hideLoadingOverlay() {
    document.body.classList.remove('loading');
    if (loadingOverlay) {
        loadingOverlay.classList.add('hidden');
    }
}

function preloadImageSource(src) {
    return new Promise(resolve => {
        const img = new Image();
        img.onload = resolve;
        img.onerror = resolve;
        img.src = src;
    });
}

function decodeImageSource(src) {
    if (!src) {
        return Promise.resolve();
    }

    if (decodedImageObjects.has(src)) {
        return Promise.resolve();
    }

    if (pendingDecodePromises.has(src)) {
        return pendingDecodePromises.get(src);
    }

    const decodeImage = new Image();
    decodeImage.src = src;

    const decodePromise = (typeof decodeImage.decode === 'function'
        ? decodeImage.decode().catch(() => preloadImageSource(src))
        : preloadImageSource(src)
    ).then(() => {
        decodedImageObjects.set(src, decodeImage);
        pendingDecodePromises.delete(src);
    }).catch(() => {
        pendingDecodePromises.delete(src);
    });

    pendingDecodePromises.set(src, decodePromise);
    return decodePromise;
}

function getWrappedFrameIndex(index, frameCount) {
    if (frameCount <= 0) {
        return 1;
    }

    let wrapped = index;
    while (wrapped < 1) {
        wrapped += frameCount;
    }
    while (wrapped > frameCount) {
        wrapped -= frameCount;
    }
    return wrapped;
}

function collectDecodeWindowSourcesForAllStreams(centerFrame) {
    const targetSources = new Set();
    const domainIds = frameManifest?.domainOrder || Object.keys(framePairsCache);

    domainIds.forEach(domainId => {
        Object.keys(imageConfig).forEach(category => {
            const framePairs = framePairsCache[domainId]?.[category] || [];
            const frameCount = framePairs.length;
            if (frameCount === 0) {
                return;
            }

            for (let offset = -DECODE_WINDOW_RADIUS; offset <= DECODE_WINDOW_RADIUS; offset += 1) {
                const frameIndex = getWrappedFrameIndex(centerFrame + offset, frameCount);
                const framePair = framePairs[frameIndex - 1];
                if (!framePair) {
                    continue;
                }

                getFrameImagePaths(framePair).forEach((src) => targetSources.add(src));
            }
        });
    });

    return targetSources;
}

function updateDecodeWindowsForAllStreams(centerFrame) {
    const targetSources = collectDecodeWindowSourcesForAllStreams(centerFrame);

    targetSources.forEach(src => {
        decodeImageSource(src);
    });

    Array.from(decodedImageObjects.keys()).forEach(src => {
        if (!targetSources.has(src)) {
            decodedImageObjects.delete(src);
        }
    });
}

async function preloadAllFrames() {
    const domainIds = Array.from(new Set(Object.values(domainHotkeys)));
    const sources = [];

    for (const domainId of domainIds) {
        for (const category of Object.keys(imageConfig)) {
            const framePairs = await loadCategoryFrames(domainId, category);
            framePairs.forEach(framePair => {
                sources.push(...getFrameImagePaths(framePair));
            });
        }
    }

    const uniqueSources = [...new Set(sources)];
    let completedCount = 0;
    setLoadingProgress(completedCount, uniqueSources.length);

    await Promise.all(uniqueSources.map(async src => {
        await preloadImageSource(src);
        completedCount += 1;
        setLoadingProgress(completedCount, uniqueSources.length);
    }));

    updateDecodeWindowsForAllStreams(currentFrame);
}

function updateImages() {
    const config = imageConfig[currentCategory];
    if (!config) {
        return;
    }

    syncImagePairLayout();

    const framePairs = getCurrentFramePairs();
    if (framePairs.length === 0) {
        console.warn(`No ${currentCategory} frames available for domain ${currentDomain}.`);
        updateCurrentTimestepDisplay();
        return;
    }

    const framePair = framePairs[currentFrame - 1];
    if (!framePair) {
        console.warn(`No ${currentCategory} frame available for domain ${currentDomain} at index ${currentFrame}.`);
        updateCurrentTimestepDisplay();
        return;
    }

    const quad = isQuadCategory(currentCategory);
    const panelSpecs = quad
        ? [
            { panel: 'topLeft', path: framePair.topLeftPath, title: config.topLeft?.title },
            { panel: 'topRight', path: framePair.topRightPath, title: config.topRight?.title },
            { panel: 'bottomLeft', path: framePair.bottomLeftPath, title: config.bottomLeft?.title },
            { panel: 'bottomRight', path: framePair.bottomRightPath, title: config.bottomRight?.title },
        ]
        : [
            { panel: 'topLeft', path: framePair.leftPath || framePair.topLeftPath, title: config.topLeft?.title || config.left?.title },
            { panel: 'topRight', path: framePair.rightPath || framePair.topRightPath, title: config.topRight?.title || config.right?.title },
        ];

    panelSpecs.forEach(({ panel, path, title }) => {
        const img = mapImagesByPanel[panel];
        if (!img) {
            return;
        }
        img.classList.remove('error');
        if (path) {
            img.src = path;
            img.alt = `${title || panel} - Hour ${framePair.hour}`;
        } else {
            img.removeAttribute('src');
            img.alt = `${title || panel} unavailable`;
        }
    });

    if (!quad) {
        [bottomLeftImage, bottomRightImage].forEach((img) => {
            if (!img) return;
            img.removeAttribute('src');
            img.classList.remove('error');
        });
    }

    updateCurrentTimestepDisplay(framePair);
    updateMapTableChrome(framePair);

    updateDecodeWindowsForAllStreams(currentFrame);

    // Keep an open sounding locked to the displayed forecast valid time.
    if (window.SoundingViewer?.isOpen?.()) {
        const validTime = getValidDateForFramePair(framePair);
        if (validTime instanceof Date && !Number.isNaN(validTime.getTime())) {
            window.SoundingViewer.syncToValidTime?.(validTime);
        }
        window.SoundingViewer.syncPin?.();
    }
}

function getDisplayedImageContentBox(img) {
    const rect = img.getBoundingClientRect();
    const naturalWidth = img.naturalWidth || 1;
    const naturalHeight = img.naturalHeight || 1;
    const containerAspect = rect.width / Math.max(rect.height, 1e-6);
    const imageAspect = naturalWidth / naturalHeight;

    let contentWidth = rect.width;
    let contentHeight = rect.height;
    let offsetX = 0;
    let offsetY = 0;

    // object-fit: contain letterboxing
    if (containerAspect > imageAspect) {
        contentHeight = rect.height;
        contentWidth = contentHeight * imageAspect;
        offsetX = (rect.width - contentWidth) / 2;
    } else {
        contentWidth = rect.width;
        contentHeight = contentWidth / imageAspect;
        offsetY = (rect.height - contentHeight) / 2;
    }

    return {
        left: rect.left + offsetX,
        top: rect.top + offsetY,
        width: contentWidth,
        height: contentHeight,
        offsetX,
        offsetY,
    };
}

function getDomainGeoref(domainId = currentDomain) {
    const domainInfo = frameManifest?.domains?.[domainId];
    const extent = domainInfo?.extent;
    const axesFraction = domainInfo?.axesFraction;
    if (!extent || !axesFraction) {
        return null;
    }
    return { extent, axesFraction };
}

function isLonLatInDomain(lon, lat, domainId) {
    const georef = getDomainGeoref(domainId);
    if (!georef || !Number.isFinite(lon) || !Number.isFinite(lat)) {
        return false;
    }
    const { extent } = georef;
    return lon >= extent.lonMin && lon <= extent.lonMax
        && lat >= extent.latMin && lat <= extent.latMax;
}

function mapClickToLonLat(img, clientX, clientY) {
    const georef = getDomainGeoref();
    if (!georef) {
        return null;
    }
    if (!img?.complete || !img.naturalWidth || !img.naturalHeight) {
        return null;
    }

    const { extent, axesFraction } = georef;
    const box = getDisplayedImageContentBox(img);
    const xInImage = clientX - box.left;
    const yInImage = clientY - box.top;
    if (xInImage < 0 || yInImage < 0 || xInImage > box.width || yInImage > box.height) {
        return null;
    }

    const nx = xInImage / box.width;
    const ny = yInImage / box.height;

    const axesLeft = axesFraction.left;
    const axesTop = axesFraction.top;
    const axesRight = axesFraction.left + axesFraction.width;
    const axesBottom = axesFraction.top + axesFraction.height;

    if (nx < axesLeft || nx > axesRight || ny < axesTop || ny > axesBottom) {
        return null;
    }

    const fx = (nx - axesLeft) / Math.max(axesFraction.width, 1e-6);
    const fy = (ny - axesTop) / Math.max(axesFraction.height, 1e-6);

    const lon = extent.lonMin + fx * (extent.lonMax - extent.lonMin);
    const lat = extent.latMax - fy * (extent.latMax - extent.latMin);

    return {
        lon,
        lat,
        offsetX: xInImage + box.offsetX,
        offsetY: yInImage + box.offsetY,
    };
}

function getImagePairEl() {
    return document.getElementById('image-pair') || document.querySelector('.image-pair');
}

function notifyMapLayoutChanged() {
    requestAnimationFrame(() => {
        window.dispatchEvent(new Event('resize'));
        window.SoundingViewer?.syncPin?.();
    });
}

function lonLatToImageOffsets(img, lon, lat, domainId = currentDomain) {
    const georef = getDomainGeoref(domainId);
    if (!georef || !img?.complete || !img.naturalWidth || !img.naturalHeight) {
        return null;
    }
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
        return null;
    }

    const { extent, axesFraction } = georef;
    const lonSpan = extent.lonMax - extent.lonMin;
    const latSpan = extent.latMax - extent.latMin;
    if (Math.abs(lonSpan) < 1e-9 || Math.abs(latSpan) < 1e-9) {
        return null;
    }

    const fx = (lon - extent.lonMin) / lonSpan;
    const fy = (extent.latMax - lat) / latSpan;
    if (fx < 0 || fx > 1 || fy < 0 || fy > 1) {
        return null;
    }

    const box = getDisplayedImageContentBox(img);
    const nx = axesFraction.left + fx * axesFraction.width;
    const ny = axesFraction.top + fy * axesFraction.height;
    const xInImage = nx * box.width;
    const yInImage = ny * box.height;

    return {
        offsetX: xInImage + box.offsetX,
        offsetY: yInImage + box.offsetY,
    };
}

function defaultSoundingModelForMapImage(img) {
    // RHS column is ICON for every category (BG right; quad topRight/bottomRight).
    const panel = img?.getAttribute?.('data-panel') || img?.closest?.('.image-panel')?.getAttribute('data-panel');
    if (panel === 'topRight' || panel === 'bottomRight') {
        return 'icon';
    }
    if (img?.id === 'right-image') {
        return 'icon';
    }
    return 'gfs';
}

function handleMapClick(event) {
    if (!window.SoundingViewer || typeof window.SoundingViewer.openAt !== 'function') {
        return;
    }
    if (!window.SoundingViewer.isToolEnabled?.()) {
        return;
    }

    const img = event.currentTarget;
    const mapped = mapClickToLonLat(img, event.clientX, event.clientY);
    if (!mapped) {
        return;
    }

    const framePair = getCurrentFramePairs()[currentFrame - 1];
    const validTime = getValidDateForFramePair(framePair);
    if (!(validTime instanceof Date) || Number.isNaN(validTime.getTime())) {
        console.warn('Unable to determine valid time for sounding request');
        return;
    }

    window.SoundingViewer.openAt({
        lat: mapped.lat,
        lon: mapped.lon,
        validTime,
        model: defaultSoundingModelForMapImage(img),
        mapImg: img,
        offsetX: mapped.offsetX,
        offsetY: mapped.offsetY,
    });
}

window.MapGeoref = {
    getDisplayedImageContentBox,
    mapClickToLonLat,
    lonLatToImageOffsets,
    getDomainGeoref,
};

function startAnimation() {
    if (animationInterval) {
        return;
    }

    currentFrame = clampFrameToSelectedRange(currentFrame);
    frameSlider.value = currentFrame;

    isPlaying = true;
    playBtn.textContent = '⏸ Pause';

    animationInterval = setInterval(() => {
        currentFrame += 1;
        if (currentFrame > selectedRangeEnd) {
            currentFrame = selectedRangeStart;
        }

        frameSlider.value = currentFrame;
        updateImages();
    }, animationSpeed);
}

function stopAnimation() {
    if (!isPlaying) {
        return;
    }

    isPlaying = false;
    playBtn.textContent = '▶ Play';

    if (animationInterval) {
        clearInterval(animationInterval);
        animationInterval = null;
    }
}

async function loadSelection(forceRefresh = false) {
    await loadCategoryFrames(currentDomain, currentCategory, forceRefresh);
    setMaxFramesForCurrentSelection();
    updateImages();
    renderLegend();
}

async function switchCategory(category) {
    if (category === currentCategory) {
        return;
    }

    const wasPlaying = isPlaying;
    if (wasPlaying && animationInterval) {
        clearInterval(animationInterval);
        animationInterval = null;
    }

    categoryButtons.forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-category') === category);
    });

    currentCategory = category;
    if (mobileCategorySelect) mobileCategorySelect.value = category;
    clearAxisMaximize();
    syncImagePairLayout();
    await loadSelection(true);
    syncAxisMaximizeButtons();

    if (wasPlaying) {
        startAnimation();
    }
}

async function switchDomain(domainId) {
    if (domainId === currentDomain) {
        return;
    }

    const wasPlaying = isPlaying;
    if (wasPlaying && animationInterval) {
        clearInterval(animationInterval);
        animationInterval = null;
    }

    // Keep an open sounding when the pin still falls inside the destination domain;
    // otherwise drop it so we don't leave a stale off-map marker.
    const pin = window.SoundingViewer?.isOpen?.()
        ? window.SoundingViewer.getPinLocation?.()
        : null;
    const keepSounding = Boolean(pin && isLonLatInDomain(pin.lon, pin.lat, domainId));
    if (window.SoundingViewer?.isOpen?.() && !keepSounding) {
        window.SoundingViewer.close();
    }

    currentDomain = domainId;
    if (mobileDomainSelect) mobileDomainSelect.value = domainId;
    await loadSelection(true);

    if (keepSounding) {
        requestAnimationFrame(() => {
            window.SoundingViewer?.syncPin?.();
        });
    }

    if (wasPlaying) {
        startAnimation();
    }
}

async function preloadImages(domainId, category) {
    const framePairs = await loadCategoryFrames(domainId, category);
    framePairs.forEach(framePair => {
        getFrameImagePaths(framePair).forEach((src) => {
            const img = new Image();
            img.src = src;
        });
    });
}

function setupEventListeners() {
    frameSlider.addEventListener('input', function() {
        currentFrame = clampFrameToSelectedRange(parseInt(this.value, 10));
        this.value = currentFrame;
        updateImages();
    });

    frameRangeStartSlider.addEventListener('input', function() {
        updateRangeStartValue(parseInt(this.value, 10));
    });

    frameRangeEndSlider.addEventListener('input', function() {
        updateRangeEndValue(parseInt(this.value, 10));
    });

    if (timezoneSelect) {
        timezoneSelect.addEventListener('change', function() {
            if (TIMEZONE_OPTIONS[this.value]) {
                selectedTimezoneKey = this.value;
                saveTimezonePreference();
                updateRangeTimeDisplay();
                updateCurrentTimestepDisplay(getCurrentFramePairs()[currentFrame - 1]);
            }
        });
    }

    playBtn.addEventListener('click', function() {
        if (isPlaying) {
            stopAnimation();
        } else {
            startAnimation();
        }
    });

    speedSlider.addEventListener('input', function() {
        animationSpeed = parseInt(this.value, 10);
        speedDisplay.textContent = `${animationSpeed}ms`;

        if (isPlaying) {
            stopAnimation();
            startAnimation();
        }
    });

    categoryButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            switchCategory(this.getAttribute('data-category'));
        });
    });

    if (mobileCategorySelect) {
        mobileCategorySelect.addEventListener('change', function() {
            switchCategory(this.value);
        });
    }

    if (mobileDomainSelect) {
        mobileDomainSelect.addEventListener('change', function() {
            switchDomain(this.value);
        });
    }

    infoBtn.addEventListener('click', function() {
        openInfoModal();
    });

    infoCloseBtn.addEventListener('click', function() {
        closeInfoModal();
    });

    infoOverlay.addEventListener('click', function(event) {
        if (event.target === infoOverlay) {
            closeInfoModal();
        }
    });

    if (legendToggleBtn) {
        legendToggleBtn.addEventListener('click', function() {
            legendEnabled = !legendEnabled;
            saveLegendPreferences();
            renderLegend();
        });
    }

    Object.values(mapImagesByPanel).forEach((img) => {
        if (!img) return;
        img.addEventListener('load', function() {
            this.classList.add('loaded');
            window.SoundingViewer?.syncPin?.();
        });
        img.addEventListener('error', function() {
            this.classList.add('error');
            console.warn(`Failed to load map image: ${this.src}`);
        });
        img.addEventListener('click', handleMapClick);
    });

    document.querySelectorAll('.map-col-header').forEach((btn) => {
        btn.addEventListener('click', function(event) {
            event.preventDefault();
            toggleAxisMaximize('col', this.getAttribute('data-col'));
        });
    });

    document.querySelectorAll('.map-row-header').forEach((btn) => {
        btn.addEventListener('click', function(event) {
            event.preventDefault();
            if (this.disabled) {
                return;
            }
            toggleAxisMaximize('row', this.getAttribute('data-row'));
        });
    });

    const runLabelBtn = document.getElementById('map-run-label');
    if (runLabelBtn) {
        runLabelBtn.addEventListener('click', function(event) {
            if (this.disabled || !isAxisMaximizeActive()) {
                return;
            }
            event.preventDefault();
            clearAxisMaximize();
        });
    }

    document.addEventListener('keydown', function(event) {
        const target = event.target;
        const tagName = target?.tagName?.toLowerCase();
        if (tagName === 'input' || tagName === 'select' || tagName === 'textarea' || target?.isContentEditable) {
            return;
        }

        if (isInfoModalOpen()) {
            if (event.key === 'Escape') {
                closeInfoModal();
            }
            if (event.key === 'Escape' || event.key === ' ' || event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key in domainHotkeys || event.key.toLowerCase() in categoryHotkeys) {
                event.preventDefault();
            }
            return;
        }

        if (event.key === 'b' || event.key === 'B') {
            if (window.SoundingViewer?.setToolEnabled && window.SoundingViewer?.isToolEnabled) {
                window.SoundingViewer.setToolEnabled(!window.SoundingViewer.isToolEnabled());
                event.preventDefault();
            }
            return;
        }

        if (window.SoundingViewer?.isOpen?.() && event.key === 'Escape') {
            window.SoundingViewer.close();
            event.preventDefault();
            return;
        }

        if (event.key === 'Escape' && clearAxisMaximize()) {
            event.preventDefault();
            return;
        }

        // Domain/category/playback hotkeys stay active while a sounding is open.
        // switchDomain keeps the sounding if the pin is inside the new domain.
        if (event.key in domainHotkeys) {
            switchDomain(domainHotkeys[event.key]);
            event.preventDefault();
            return;
        }

        const lowerKey = event.key.toLowerCase();
        if (lowerKey in categoryHotkeys) {
            switchCategory(categoryHotkeys[lowerKey]);
            event.preventDefault();
            return;
        }

        switch (event.key) {
            case 'ArrowLeft':
                if (currentFrame > selectedRangeStart) {
                    currentFrame -= 1;
                    frameSlider.value = currentFrame;
                    updateImages();
                }
                event.preventDefault();
                break;
            case 'ArrowRight':
                if (currentFrame < selectedRangeEnd) {
                    currentFrame += 1;
                    frameSlider.value = currentFrame;
                    updateImages();
                }
                event.preventDefault();
                break;
            case ' ':
                if (isPlaying) {
                    stopAnimation();
                } else {
                    startAnimation();
                }
                event.preventDefault();
                break;
        }
    });
}

document.addEventListener('DOMContentLoaded', function() {
    loadLegendPreferences();
    loadTimezonePreference();
    initializeElements();
    syncImagePairLayout();
    updateViewerBottomOffset();
    if (timezoneSelect) {
        timezoneSelect.value = selectedTimezoneKey;
    }
    applyLegendLayoutState();
    updateSelectedRangeHighlight();
    setupEventListeners();
    setLoadingProgress(0, 0);
    loadSelection()
        .then(() => {
            updateImages();
            renderLegend();
        })
        .catch(error => {
            console.warn('Failed to initialize category data:', error);
        });
});

window.addEventListener('load', function() {
    preloadAllFrames()
        .catch(error => {
            console.warn('Failed to preload one or more domain images:', error);
        })
        .finally(() => {
            hideLoadingOverlay();
            updateViewerBottomOffset();
        });
});

window.addEventListener('resize', function() {
    updateImages();
    updateRangeTimeDisplay();
    updateViewerBottomOffset();
    window.SoundingViewer?.syncPin?.();
});

window.AnimationController = {
    switchCategory,
    startAnimation,
    stopAnimation,
    setFrame(frame) {
        if (frame >= 1 && frame <= maxFrames) {
            currentFrame = clampFrameToSelectedRange(frame);
            frameSlider.value = currentFrame;
            updateImages();
        }
    },
    getCurrentFrame: () => currentFrame,
    getCurrentCategory: () => currentCategory,
    getCurrentDomain: () => currentDomain,
    isAnimationPlaying: () => isPlaying
};
