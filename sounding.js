(() => {
    const PRESSURE_LEVELS_HPA = [
        1000, 975, 950, 925, 900, 850, 800, 700, 600, 500, 400, 300, 250, 200, 150, 100,
    ];

    const SOUNDING_MODELS = {
        gfs_seamless: {
            id: 'gfs_seamless',
            label: 'GFS',
            source: 'Open-Meteo GFS',
        },
        icon_seamless: {
            id: 'icon_seamless',
            label: 'ICON',
            source: 'Open-Meteo ICON',
        },
    };
    const DEFAULT_SOUNDING_MODEL = 'gfs_seamless';

    const profileCache = new Map();
    const hourlyCache = new Map();
    const MAX_CACHE_ENTRIES = 24;
    const MAX_HOURLY_CACHE_ENTRIES = 8;

    const PANEL_SIZE_STORAGE_KEY = 'avmaps.soundingPanelSizePx';
    const MIN_PANEL_PX = 240;
    const MIN_MAPS_PX = 280;
    const DEFAULT_PANEL_PX = 420;

    let panelEl;
    let metaEl;
    let statusEl;
    let canvasEl;
    let canvasWrapEl;
    let loadingEl;
    let hoverEl;
    let closeBtn;
    let modelSelectEl;
    let toolBtn;
    let pinTargets = [];
    let resizeHandleEl;
    let workspaceEl;
    let pinLat = null;
    let pinLon = null;
    let toolEnabled = false;
    let panelOpen = false;
    let selectedModelId = DEFAULT_SOUNDING_MODEL;
    let lastProfile = null;
    let lastPlot = null;
    let lastValidTimeIso = null;
    let lastRequestedValidTime = null;
    // Fixed T/P axes for the current pin/model so playback doesn't rescale every hour.
    let lockedAxes = null;
    let loadGeneration = 0;
    let storedPanelSizePx = null;
    let resizeRaf = 0;
    let activePointerId = null;
    let hoverRaf = 0;
    // Device-pixel snapshot of the sounding without the interactive parcel overlay.
    let staticLayerCanvas = null;
    let staticLayerWidth = 0;
    let staticLayerHeight = 0;
    let lastPointerCss = null;
    // Zoom/pan window into the default auto-fit extents (cannot exceed that default).
    let defaultViewExtents = null;
    let viewExtents = null;
    let viewSessionKey = null;
    let isPanning = false;
    let panLastCss = null;
    let panPointerId = null;
    let panRaf = 0;
    let pendingPanDx = 0;
    let pendingPanDy = 0;
    const VIEW_MAX_ZOOM = 10;
    const PAN_START_PX = 4;

    function ensureUi() {
        if (panelEl) {
            return;
        }

        panelEl = document.getElementById('sounding-panel');
        metaEl = document.getElementById('sounding-meta');
        statusEl = document.getElementById('sounding-status');
        canvasEl = document.getElementById('sounding-canvas');
        canvasWrapEl = document.querySelector('.sounding-canvas-wrap');
        loadingEl = document.getElementById('sounding-loading');
        hoverEl = document.getElementById('sounding-hover');
        closeBtn = document.getElementById('sounding-close-btn');
        modelSelectEl = document.getElementById('sounding-model-select');
        toolBtn = document.getElementById('sounding-tool-btn');
        resizeHandleEl = document.getElementById('sounding-resize-handle');
        workspaceEl = document.querySelector('.map-workspace');
        pinTargets = [
            {
                pinEl: document.getElementById('sounding-pin-top-left'),
                imgEl: document.getElementById('left-image'),
            },
            {
                pinEl: document.getElementById('sounding-pin-top-right'),
                imgEl: document.getElementById('right-image'),
            },
            {
                pinEl: document.getElementById('sounding-pin-bottom-left'),
                imgEl: document.getElementById('bottom-left-image'),
            },
            {
                pinEl: document.getElementById('sounding-pin-bottom-right'),
                imgEl: document.getElementById('bottom-right-image'),
            },
        ];

        if (closeBtn) {
            closeBtn.addEventListener('click', close);
        }
        if (modelSelectEl) {
            modelSelectEl.value = selectedModelId;
            modelSelectEl.addEventListener('change', () => {
                setSelectedModel(modelSelectEl.value, { reload: panelOpen });
            });
        }
        if (toolBtn) {
            toolBtn.addEventListener('click', () => {
                setToolEnabled(!toolEnabled);
            });
        }
        bindResizeHandle();
        bindHoverInteractions();
        window.addEventListener('resize', () => {
            if (!panelOpen || activePointerId != null) return;
            // Re-clamp only; avoid re-dispatching resize (script.js already handles maps).
            applyPanelSize(storedPanelSizePx, { persist: false, notify: false });
            if (lastProfile) {
                renderSkewT(lastProfile);
            }
        });
    }

    function isVerticalLayout() {
        if (!workspaceEl) return false;
        return getComputedStyle(workspaceEl).flexDirection === 'column';
    }

    function readStoredPanelSize() {
        try {
            const raw = localStorage.getItem(PANEL_SIZE_STORAGE_KEY);
            const value = Number(raw);
            return Number.isFinite(value) && value > 0 ? value : null;
        } catch (_) {
            return null;
        }
    }

    function writeStoredPanelSize(sizePx) {
        try {
            localStorage.setItem(PANEL_SIZE_STORAGE_KEY, String(Math.round(sizePx)));
        } catch (_) {
            // Ignore quota / private-mode failures.
        }
    }

    function clampPanelSize(sizePx) {
        if (!workspaceEl) {
            return Math.max(MIN_PANEL_PX, sizePx);
        }
        const rect = workspaceEl.getBoundingClientRect();
        const vertical = isVerticalLayout();
        const available = vertical ? rect.height : rect.width;
        const handleSize = resizeHandleEl ? resizeHandleEl.getBoundingClientRect()[vertical ? 'height' : 'width'] : 8;
        const maxSize = Math.max(MIN_PANEL_PX, available - MIN_MAPS_PX - handleSize);
        return Math.min(Math.max(MIN_PANEL_PX, sizePx), maxSize);
    }

    function scheduleLayoutNotify() {
        if (resizeRaf) {
            cancelAnimationFrame(resizeRaf);
        }
        resizeRaf = requestAnimationFrame(() => {
            resizeRaf = 0;
            window.dispatchEvent(new Event('resize'));
            syncPin();
            if (lastProfile) {
                renderSkewT(lastProfile);
            }
        });
    }

    function applyPanelSize(sizePx, { persist = true, notify = true } = {}) {
        ensureUi();
        if (!panelEl || !workspaceEl) return;

        let nextSize = sizePx;
        if (!Number.isFinite(nextSize)) {
            nextSize = storedPanelSizePx;
        }
        if (!Number.isFinite(nextSize)) {
            const workspaceSize = isVerticalLayout()
                ? workspaceEl.getBoundingClientRect().height
                : workspaceEl.getBoundingClientRect().width;
            nextSize = Math.min(DEFAULT_PANEL_PX, workspaceSize * 0.38);
        }

        nextSize = clampPanelSize(nextSize);
        storedPanelSizePx = nextSize;
        document.documentElement.style.setProperty('--sounding-panel-size', `${Math.round(nextSize)}px`);

        if (persist) {
            writeStoredPanelSize(nextSize);
        }
        if (notify) {
            scheduleLayoutNotify();
        }
    }

    function clearPanelSizeStyle() {
        document.documentElement.style.removeProperty('--sounding-panel-size');
    }

    function setResizeHandleVisible(visible) {
        if (!resizeHandleEl) return;
        resizeHandleEl.classList.toggle('hidden', !visible);
        resizeHandleEl.setAttribute('aria-hidden', visible ? 'false' : 'true');
        resizeHandleEl.setAttribute('aria-orientation', isVerticalLayout() ? 'horizontal' : 'vertical');
    }

    function endResizeDrag() {
        if (activePointerId == null) return;
        activePointerId = null;
        document.body.classList.remove('sounding-resizing', 'sounding-resize-vertical');
        if (Number.isFinite(storedPanelSizePx)) {
            writeStoredPanelSize(storedPanelSizePx);
        }
        scheduleLayoutNotify();
    }

    function updateSizeFromPointer(clientX, clientY) {
        if (!workspaceEl) return;
        const rect = workspaceEl.getBoundingClientRect();
        const vertical = isVerticalLayout();
        const nextSize = vertical
            ? rect.bottom - clientY
            : rect.right - clientX;
        applyPanelSize(nextSize, { persist: false, notify: true });
    }

    function bindResizeHandle() {
        if (!resizeHandleEl || resizeHandleEl.dataset.bound === '1') return;
        resizeHandleEl.dataset.bound = '1';

        resizeHandleEl.addEventListener('pointerdown', (event) => {
            if (!panelOpen || event.button !== 0) return;
            event.preventDefault();
            activePointerId = event.pointerId;
            resizeHandleEl.setPointerCapture?.(event.pointerId);
            document.body.classList.add('sounding-resizing');
            document.body.classList.toggle('sounding-resize-vertical', isVerticalLayout());
            updateSizeFromPointer(event.clientX, event.clientY);
        });

        resizeHandleEl.addEventListener('pointermove', (event) => {
            if (activePointerId !== event.pointerId) return;
            updateSizeFromPointer(event.clientX, event.clientY);
        });

        const stop = (event) => {
            if (activePointerId !== event.pointerId) return;
            endResizeDrag();
        };
        resizeHandleEl.addEventListener('pointerup', stop);
        resizeHandleEl.addEventListener('pointercancel', stop);
        resizeHandleEl.addEventListener('lostpointercapture', endResizeDrag);

        resizeHandleEl.addEventListener('keydown', (event) => {
            if (!panelOpen) return;
            const step = event.shiftKey ? 40 : 16;
            if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                event.preventDefault();
                applyPanelSize((storedPanelSizePx || DEFAULT_PANEL_PX) + step);
            } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                event.preventDefault();
                applyPanelSize((storedPanelSizePx || DEFAULT_PANEL_PX) - step);
            } else if (event.key === 'Home') {
                event.preventDefault();
                applyPanelSize(DEFAULT_PANEL_PX);
            }
        });
    }

    function syncToolUi() {
        document.body.classList.toggle('sounding-tool-active', toolEnabled);
        if (toolBtn) {
            toolBtn.classList.toggle('active', toolEnabled);
            toolBtn.setAttribute('aria-pressed', toolEnabled ? 'true' : 'false');
            toolBtn.title = toolEnabled ? 'Sounding tool on — click a map point' : 'Sounding tool';
        }
    }

    function setToolEnabled(enabled) {
        ensureUi();
        toolEnabled = Boolean(enabled);
        syncToolUi();
        if (!toolEnabled) {
            close();
        }
    }

    function isToolEnabled() {
        return toolEnabled;
    }

    function normalizeModelId(modelId) {
        const raw = String(modelId || '').trim().toLowerCase();
        if (raw === 'icon' || raw === 'icon_seamless' || raw === 'dwd_icon') {
            return SOUNDING_MODELS.icon_seamless.id;
        }
        if (raw === 'gfs' || raw === 'gfs_seamless' || raw === 'ncep_gfs') {
            return SOUNDING_MODELS.gfs_seamless.id;
        }
        if (SOUNDING_MODELS[raw]) {
            return raw;
        }
        return DEFAULT_SOUNDING_MODEL;
    }

    function getModelMeta(modelId = selectedModelId) {
        const id = normalizeModelId(modelId);
        return SOUNDING_MODELS[id] || SOUNDING_MODELS[DEFAULT_SOUNDING_MODEL];
    }

    function setSelectedModel(modelId, { reload = false } = {}) {
        const nextModelId = normalizeModelId(modelId);
        const changed = nextModelId !== selectedModelId;
        selectedModelId = nextModelId;
        if (modelSelectEl && modelSelectEl.value !== selectedModelId) {
            modelSelectEl.value = selectedModelId;
        }
        if (!changed && !reload) {
            return;
        }

        // Model changes need a fresh axis lock, view window, and profile fetch.
        lockedAxes = null;
        lastValidTimeIso = null;
        lastProfile = null;
        resetViewExtents();
        if (
            reload
            && panelOpen
            && Number.isFinite(pinLat)
            && Number.isFinite(pinLon)
            && lastRequestedValidTime instanceof Date
            && !Number.isNaN(lastRequestedValidTime.getTime())
        ) {
            loadProfileForPin(lastRequestedValidTime, { showLoading: true });
        }
    }

    function cacheKey(lat, lon, validTimeIso, modelId = selectedModelId) {
        // v5: multi-model (GFS/ICON) profiles.
        return `v5:${normalizeModelId(modelId)}:${lat.toFixed(3)},${lon.toFixed(3)},${validTimeIso}`;
    }

    function hourlyCacheKey(lat, lon, dateText, modelId = selectedModelId) {
        return `${normalizeModelId(modelId)}:${lat.toFixed(3)},${lon.toFixed(3)},${dateText}`;
    }

    function rememberProfile(key, profile) {
        profileCache.set(key, profile);
        if (profileCache.size > MAX_CACHE_ENTRIES) {
            const oldest = profileCache.keys().next().value;
            profileCache.delete(oldest);
        }
    }

    function rememberHourly(key, hourly, model) {
        hourlyCache.set(key, { hourly, model });
        if (hourlyCache.size > MAX_HOURLY_CACHE_ENTRIES) {
            const oldest = hourlyCache.keys().next().value;
            hourlyCache.delete(oldest);
        }
    }

    function buildHourlyVariableList() {
        const vars = ['temperature_2m', 'dew_point_2m', 'relative_humidity_2m', 'surface_pressure'];
        PRESSURE_LEVELS_HPA.forEach((level) => {
            vars.push(`temperature_${level}hPa`);
            vars.push(`dew_point_${level}hPa`);
            vars.push(`relative_humidity_${level}hPa`);
            vars.push(`wind_speed_${level}hPa`);
            vars.push(`wind_direction_${level}hPa`);
            vars.push(`geopotential_height_${level}hPa`);
        });
        return vars.join(',');
    }

    function dewpointFromTempRh(tempC, rhPercent) {
        // Magnus-Tetens; used when Open-Meteo omits dew_point but provides RH.
        if (!Number.isFinite(tempC) || !Number.isFinite(rhPercent) || rhPercent <= 0) {
            return null;
        }
        const rh = Math.min(100, rhPercent);
        const gamma = Math.log(rh / 100) + (17.67 * tempC) / (tempC + 243.5);
        const dewpoint = (243.5 * gamma) / (17.67 - gamma);
        return Number.isFinite(dewpoint) ? dewpoint : null;
    }

    function resolveDewpoint(hourly, hourIndex, pressure, temperature) {
        const direct = hourly[`dew_point_${pressure}hPa`]?.[hourIndex];
        if (Number.isFinite(direct)) {
            return direct;
        }
        const rh = hourly[`relative_humidity_${pressure}hPa`]?.[hourIndex];
        return dewpointFromTempRh(temperature, rh);
    }

    function nearestHourIndex(times, targetDate) {
        const targetMs = targetDate.getTime();
        const targetKey = targetDate.toISOString().slice(0, 13); // YYYY-MM-DDTHH
        const exactIndex = times.findIndex((timeText) => String(timeText).slice(0, 13) === targetKey);
        if (exactIndex >= 0) {
            return exactIndex;
        }

        let bestIndex = 0;
        let bestDelta = Infinity;
        times.forEach((timeText, index) => {
            const delta = Math.abs(parseUtcHour(timeText).getTime() - targetMs);
            if (delta < bestDelta) {
                bestDelta = delta;
                bestIndex = index;
            }
        });
        return bestIndex;
    }

    function parseUtcHour(timeText) {
        const text = String(timeText || '');
        // Open-Meteo returns "YYYY-MM-DDTHH:MM" without Z; treat as UTC.
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(text)) {
            return new Date(`${text.length === 16 ? `${text}:00` : text}Z`);
        }
        return new Date(text);
    }

    function buildProfileFromHourly(hourly, model, lat, lon, validTime) {
        if (!hourly?.time?.length) {
            throw new Error('No hourly profile data returned');
        }

        const hourIndex = nearestHourIndex(hourly.time, validTime);
        const levels = [];

        PRESSURE_LEVELS_HPA.forEach((pressure) => {
            const temperature = hourly[`temperature_${pressure}hPa`]?.[hourIndex];
            // Keep levels with temperature even when dewpoint is missing (common aloft).
            if (!Number.isFinite(temperature)) {
                return;
            }
            levels.push({
                pressure,
                temperature,
                dewpoint: resolveDewpoint(hourly, hourIndex, pressure, temperature),
                height: hourly[`geopotential_height_${pressure}hPa`]?.[hourIndex] ?? null,
                windSpeedKt: hourly[`wind_speed_${pressure}hPa`]?.[hourIndex] ?? null,
                windDirDeg: hourly[`wind_direction_${pressure}hPa`]?.[hourIndex] ?? null,
            });
        });

        const surfacePressure = hourly.surface_pressure?.[hourIndex];
        const surfaceTemp = hourly.temperature_2m?.[hourIndex];
        let surfaceDew = hourly.dew_point_2m?.[hourIndex];
        if (!Number.isFinite(surfaceDew)) {
            surfaceDew = dewpointFromTempRh(surfaceTemp, hourly.relative_humidity_2m?.[hourIndex]);
        }
        if (Number.isFinite(surfacePressure) && Number.isFinite(surfaceTemp)) {
            // Drop isobaric points at/below ground — they cause near-surface zig-zags.
            const aboveGround = levels.filter((level) => level.pressure < surfacePressure - 0.5);
            aboveGround.push({
                pressure: surfacePressure,
                temperature: surfaceTemp,
                dewpoint: Number.isFinite(surfaceDew) ? surfaceDew : null,
                height: 0,
                windSpeedKt: null,
                windDirDeg: null,
                isSurface: true,
            });
            levels.length = 0;
            levels.push(...aboveGround);
        }

        levels.sort((a, b) => b.pressure - a.pressure);

        const modelMeta = getModelMeta(model);
        return {
            source: modelMeta.source,
            model: modelMeta.id,
            validTime: parseUtcHour(hourly.time[hourIndex]),
            latitude: lat,
            longitude: lon,
            levels,
            surfacePressure: Number.isFinite(surfacePressure) ? surfacePressure : null,
        };
    }

    async function fetchOpenMeteoHourly(lat, lon, validTime, modelId = selectedModelId) {
        const modelMeta = getModelMeta(modelId);
        const startDate = validTime.toISOString().slice(0, 10);
        const dayKey = hourlyCacheKey(lat, lon, startDate, modelMeta.id);
        const cached = hourlyCache.get(dayKey);
        if (cached?.hourly?.time?.length) {
            return cached;
        }

        // POST avoids long GET URLs dropping trailing humidity variables in some browsers.
        const body = new URLSearchParams({
            latitude: lat.toFixed(4),
            longitude: lon.toFixed(4),
            hourly: buildHourlyVariableList(),
            models: modelMeta.id,
            wind_speed_unit: 'kn',
            timezone: 'UTC',
            start_date: startDate,
            end_date: startDate,
        });

        const response = await fetch('https://api.open-meteo.com/v1/forecast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
        });
        if (!response.ok) {
            throw new Error(`Open-Meteo ${modelMeta.label} request failed (${response.status})`);
        }

        const payload = await response.json();
        const hourly = payload.hourly;
        if (!hourly?.time?.length) {
            throw new Error(`No hourly ${modelMeta.label} profile data returned`);
        }

        const entry = { hourly, model: payload.model || modelMeta.id };
        rememberHourly(dayKey, entry.hourly, entry.model);
        return entry;
    }

    async function fetchOpenMeteoProfile(lat, lon, validTime, modelId = selectedModelId) {
        const { hourly, model } = await fetchOpenMeteoHourly(lat, lon, validTime, modelId);
        return buildProfileFromHourly(hourly, model, lat, lon, validTime);
    }

    // Thermodynamic constants for adiabat background curves (SI + hPa).
    const RD = 287.05;       // J kg-1 K-1, dry air
    const CP = 1005.7;       // J kg-1 K-1
    const KAPPA = RD / CP;   // ≈ 0.2854
    const LV = 2.501e6;      // J kg-1, latent heat of vaporization
    const EPS = 0.622;       // Rd / Rv
    const P_REF_HPA = 1000;

    function dryAdiabatTempC(thetaC, pressureHpa) {
        // θ labeled in °C at 1000 hPa: T = θ_K * (p/1000)^κ
        const thetaK = thetaC + 273.15;
        return thetaK * Math.pow(Math.max(pressureHpa, 1) / P_REF_HPA, KAPPA) - 273.15;
    }

    function potentialTempC(tempC, pressureHpa) {
        return (tempC + 273.15) * Math.pow(P_REF_HPA / Math.max(pressureHpa, 1), KAPPA) - 273.15;
    }

    function saturationVaporPressureHpa(tempC) {
        // Bolton (1980) over liquid water.
        return 6.112 * Math.exp((17.67 * tempC) / (tempC + 243.5));
    }

    function saturationMixingRatio(tempC, pressureHpa) {
        const es = saturationVaporPressureHpa(tempC);
        return (EPS * es) / Math.max(pressureHpa - es, 0.1);
    }

    function dewpointFromMixingRatio(mixingRatio, pressureHpa) {
        // Invert w = ε e / (p - e) then Magnus-Tetens for Td.
        if (!Number.isFinite(mixingRatio) || mixingRatio <= 0 || !Number.isFinite(pressureHpa) || pressureHpa <= 0) {
            return null;
        }
        const vaporPressure = (mixingRatio * pressureHpa) / (EPS + mixingRatio);
        if (!(vaporPressure > 0)) return null;
        const gamma = Math.log(vaporPressure / 6.112);
        const dewpoint = (243.5 * gamma) / (17.67 - gamma);
        return Number.isFinite(dewpoint) ? dewpoint : null;
    }

    function moistAdiabatDTdP(tempK, pressureHpa) {
        // Pseudoadiabatic dT/dp (K / hPa).
        const tempC = tempK - 273.15;
        const ws = saturationMixingRatio(tempC, pressureHpa);
        const numerator = RD * tempK + LV * ws;
        const denominator = pressureHpa * (CP + (LV * LV * ws * EPS) / (RD * tempK * tempK));
        return numerator / Math.max(denominator, 1e-12);
    }

    function integrateMoistAdiabat(startTempC, pStart, pEnd, stepHpa = 5) {
        // Integrate a saturated parcel from pStart toward pEnd.
        const points = [{ temperature: startTempC, pressure: pStart }];
        let tempK = startTempC + 273.15;
        let pressure = pStart;
        const direction = pEnd < pStart ? -1 : 1;
        const absStep = Math.abs(stepHpa);

        while ((direction < 0 && pressure > pEnd + 1e-6) || (direction > 0 && pressure < pEnd - 1e-6)) {
            const nextP = direction < 0
                ? Math.max(pEnd, pressure - absStep)
                : Math.min(pEnd, pressure + absStep);
            const substeps = 4;
            const dP = (nextP - pressure) / substeps;
            for (let s = 0; s < substeps; s += 1) {
                const midP = pressure + dP * 0.5;
                const dTdP = moistAdiabatDTdP(tempK, Math.max(midP, 1));
                tempK += dTdP * dP;
                pressure += dP;
            }
            pressure = nextP;
            points.push({ temperature: tempK - 273.15, pressure });
            if (!Number.isFinite(tempK) || tempK < 160 || tempK > 340) break;
        }
        return points;
    }

    function buildMoistAdiabatCurve(tempAt1000C, pBottom, pTop, stepHpa = 5) {
        // Anchor each saturated adiabat at 1000 hPa, then fill the plot pressure range.
        const up = integrateMoistAdiabat(tempAt1000C, P_REF_HPA, pTop, stepHpa);
        if (pBottom <= P_REF_HPA) {
            return up;
        }
        const down = integrateMoistAdiabat(tempAt1000C, P_REF_HPA, pBottom, stepHpa);
        return down.slice(1).reverse().concat(up);
    }

    function strokeThermoCurve(ctx, points, plot) {
        // Draw the full curve; the background clip rect trims to the plot.
        // Skipping "outside" points left large empty regions for adiabats.
        ctx.beginPath();
        let started = false;
        points.forEach((point) => {
            if (!Number.isFinite(point.temperature) || !Number.isFinite(point.pressure)) {
                started = false;
                return;
            }
            if (point.pressure < plot.pMin - 30 || point.pressure > plot.pMax + 30) {
                started = false;
                return;
            }
            const x = skewX(point.temperature, point.pressure, plot);
            const y = yFromPressure(point.pressure, plot);
            if (!started) {
                ctx.moveTo(x, y);
                started = true;
            } else {
                ctx.lineTo(x, y);
            }
        });
        if (started) ctx.stroke();
    }

    function dryAdiabatThetaRange(plot) {
        // Choose θ so dry adiabats cross the full visible T/p domain.
        const samples = [
            { t: plot.tMin - 20, p: plot.pMax },
            { t: plot.tMax + 20, p: plot.pMax },
            { t: plot.tMin - 40, p: plot.pMin },
            { t: plot.tMax + 40, p: plot.pMin },
            { t: plot.tMin - 30, p: (plot.pMin + plot.pMax) / 2 },
            { t: plot.tMax + 30, p: (plot.pMin + plot.pMax) / 2 },
        ];
        let thetaMin = Infinity;
        let thetaMax = -Infinity;
        samples.forEach(({ t, p }) => {
            const thetaC = (t + 273.15) * Math.pow(P_REF_HPA / Math.max(p, 1), KAPPA) - 273.15;
            thetaMin = Math.min(thetaMin, thetaC);
            thetaMax = Math.max(thetaMax, thetaC);
        });
        return {
            start: Math.floor(thetaMin / 10) * 10,
            end: Math.ceil(thetaMax / 10) * 10,
        };
    }

    function drawDryAdiabats(ctx, plot) {
        // Potential temperature (°C at 1000 hPa), every 10°.
        const pStep = 5;
        const { start, end } = dryAdiabatThetaRange(plot);
        ctx.strokeStyle = 'rgba(150, 105, 55, 0.45)';
        ctx.lineWidth = 0.95;
        ctx.setLineDash([]);

        for (let thetaC = start; thetaC <= end; thetaC += 10) {
            const points = [];
            for (let p = plot.pMax; p >= plot.pMin; p -= pStep) {
                points.push({ temperature: dryAdiabatTempC(thetaC, p), pressure: p });
            }
            strokeThermoCurve(ctx, points, plot);
        }
    }

    function drawSaturatedAdiabats(ctx, plot) {
        // Pseudoadiabats characterized by temperature at 1000 hPa.
        const pBottom = Math.max(plot.pMax, P_REF_HPA);
        const pTop = Math.max(plot.pMin, 100);
        // Cover cold left through warm right of a typical AU sounding pane.
        const startTemp = Math.min(-40, Math.floor((plot.tMin - 10) / 5) * 5);
        const endTemp = Math.max(40, Math.ceil((plot.tMax + 10) / 5) * 5);
        ctx.strokeStyle = 'rgba(35, 130, 110, 0.48)';
        ctx.lineWidth = 0.9;
        ctx.setLineDash([4, 3]);

        for (let tempAt1000C = startTemp; tempAt1000C <= endTemp; tempAt1000C += 5) {
            const points = buildMoistAdiabatCurve(tempAt1000C, pBottom, pTop, 5);
            strokeThermoCurve(ctx, points, plot);
        }
        ctx.setLineDash([]);
    }

    // Skew-T geometry: isotherms at ~45° (Windy-like), temperature axis auto-fit to profile.
    function skewX(temperatureC, pressureHpa, plot) {
        const logP = Math.log(Math.max(pressureHpa, plot.pMin));
        const skew = (plot.logPMax - logP) * plot.skewFactor;
        return plot.padL + ((temperatureC - plot.tMin) / (plot.tMax - plot.tMin)) * plot.innerW + skew;
    }

    function yFromPressure(pressureHpa, plot) {
        const logP = Math.log(Math.min(Math.max(pressureHpa, plot.pMin), plot.pMax));
        return plot.padT + ((logP - plot.logPMin) / (plot.logPMax - plot.logPMin)) * plot.innerH;
    }

    function pressureFromY(y, plot) {
        const fy = (y - plot.padT) / Math.max(plot.innerH, 1e-6);
        const logP = plot.logPMin + fy * (plot.logPMax - plot.logPMin);
        return Math.exp(logP);
    }

    function temperatureFromSkewX(x, pressureHpa, plot) {
        const logP = Math.log(Math.max(pressureHpa, plot.pMin));
        const skew = (plot.logPMax - logP) * plot.skewFactor;
        const tNorm = (x - plot.padL - skew) / Math.max(plot.innerW, 1e-6);
        return plot.tMin + tNorm * (plot.tMax - plot.tMin);
    }

    function getSurfacePressure(profile = lastProfile) {
        const surface = profile?.levels?.find((level) => level.isSurface);
        if (Number.isFinite(surface?.pressure)) {
            return surface.pressure;
        }
        let maxP = null;
        (profile?.levels || []).forEach((level) => {
            if (!Number.isFinite(level?.pressure)) return;
            maxP = maxP == null ? level.pressure : Math.max(maxP, level.pressure);
        });
        return maxP;
    }

    function heightMetersFromPressure(profile, pressure) {
        if (!Number.isFinite(pressure) || !profile?.levels?.length) return null;
        const levels = profile.levels
            .filter((level) => Number.isFinite(level.pressure) && Number.isFinite(level.height) && level.pressure > 0)
            .slice()
            .sort((a, b) => b.pressure - a.pressure);
        if (!levels.length) return null;
        if (pressure >= levels[0].pressure) return levels[0].height;
        if (pressure <= levels[levels.length - 1].pressure) return levels[levels.length - 1].height;

        for (let i = 0; i < levels.length - 1; i += 1) {
            const lo = levels[i];
            const hi = levels[i + 1];
            if (pressure <= lo.pressure && pressure >= hi.pressure) {
                const logP = Math.log(pressure);
                const logLo = Math.log(lo.pressure);
                const logHi = Math.log(hi.pressure);
                const frac = (logLo - logP) / Math.max(logLo - logHi, 1e-9);
                return lo.height + frac * (hi.height - lo.height);
            }
        }
        return null;
    }

    function buildLiftedParcelPath(cursorTempC, cursorPressureHpa, surfacePressureHpa, plot) {
        if (
            !Number.isFinite(cursorTempC)
            || !Number.isFinite(cursorPressureHpa)
            || !Number.isFinite(surfacePressureHpa)
            || cursorPressureHpa >= surfacePressureHpa - 0.5
        ) {
            return null;
        }

        // Cursor is the assumed LCL: dry adiabat through the cursor down to the surface,
        // then saturated adiabat upward. Mixing ratio is saturation value at the cursor.
        const thetaC = potentialTempC(cursorTempC, cursorPressureHpa);
        const mixingRatio = saturationMixingRatio(cursorTempC, cursorPressureHpa);
        const pStep = 4;
        const dryPoints = [];
        const mixingRatioPoints = [];
        for (let p = surfacePressureHpa; p >= cursorPressureHpa; p -= pStep) {
            const pressure = Math.max(p, cursorPressureHpa);
            dryPoints.push({
                temperature: dryAdiabatTempC(thetaC, pressure),
                pressure,
            });
            const dewpoint = dewpointFromMixingRatio(mixingRatio, pressure);
            if (Number.isFinite(dewpoint)) {
                mixingRatioPoints.push({ temperature: dewpoint, pressure });
            }
        }
        const dryEnd = dryPoints[dryPoints.length - 1];
        if (!dryEnd || Math.abs(dryEnd.pressure - cursorPressureHpa) > 0.05) {
            dryPoints.push({ temperature: cursorTempC, pressure: cursorPressureHpa });
        } else {
            dryEnd.temperature = cursorTempC;
            dryEnd.pressure = cursorPressureHpa;
        }
        const mixEnd = mixingRatioPoints[mixingRatioPoints.length - 1];
        if (!mixEnd || Math.abs(mixEnd.pressure - cursorPressureHpa) > 0.05) {
            mixingRatioPoints.push({ temperature: cursorTempC, pressure: cursorPressureHpa });
        } else {
            mixEnd.temperature = cursorTempC;
            mixEnd.pressure = cursorPressureHpa;
        }

        const moistPoints = integrateMoistAdiabat(
            cursorTempC,
            cursorPressureHpa,
            Math.max(plot.pMin, 100),
            pStep,
        );
        // Avoid duplicating the LCL point when concatenating.
        return {
            parcelPoints: dryPoints.concat(moistPoints.slice(1)),
            mixingRatioPoints,
        };
    }

    function captureStaticLayer() {
        if (!canvasEl) return;
        if (!staticLayerCanvas) {
            staticLayerCanvas = document.createElement('canvas');
        }
        staticLayerWidth = canvasEl.width;
        staticLayerHeight = canvasEl.height;
        staticLayerCanvas.width = staticLayerWidth;
        staticLayerCanvas.height = staticLayerHeight;
        const staticCtx = staticLayerCanvas.getContext('2d');
        staticCtx.setTransform(1, 0, 0, 1, 0, 0);
        staticCtx.clearRect(0, 0, staticLayerWidth, staticLayerHeight);
        staticCtx.drawImage(canvasEl, 0, 0);
    }

    function restoreStaticLayer(ctx) {
        if (!staticLayerCanvas || !staticLayerWidth || !staticLayerHeight) return false;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
        ctx.drawImage(staticLayerCanvas, 0, 0);
        return true;
    }

    function drawLiftedParcelOverlay(ctx, plot, parcelPoints, mixingRatioPoints) {
        if (!parcelPoints?.length && !mixingRatioPoints?.length) return;

        ctx.save();
        ctx.beginPath();
        ctx.rect(plot.padL, plot.padT, plot.innerW, plot.innerH);
        ctx.clip();

        // Constant mixing ratio from the surface up to the assumed LCL (cursor).
        if (mixingRatioPoints?.length) {
            ctx.strokeStyle = 'rgba(30, 160, 185, 0.9)';
            ctx.lineWidth = 1.45;
            ctx.setLineDash([5, 4]);
            strokeThermoCurve(ctx, mixingRatioPoints, plot);
            ctx.setLineDash([]);
        }

        // Lifted parcel: dry adiabat to LCL, then moist adiabat above.
        if (parcelPoints?.length) {
            ctx.strokeStyle = 'rgba(20, 150, 70, 0.92)';
            ctx.lineWidth = 1.7;
            ctx.setLineDash([6, 4]);
            strokeThermoCurve(ctx, parcelPoints, plot);
            ctx.setLineDash([]);
        }
        ctx.restore();
    }

    function nearestProfileLevel(levels, pressure) {
        if (!Number.isFinite(pressure) || !levels?.length) return null;
        const logP = Math.log(pressure);
        let best = null;
        let bestDelta = Infinity;
        levels.forEach((level) => {
            if (!Number.isFinite(level.pressure) || level.pressure <= 0) return;
            const delta = Math.abs(Math.log(level.pressure) - logP);
            if (delta < bestDelta) {
                bestDelta = delta;
                best = level;
            }
        });
        return best;
    }

    function formatHoverReadout(sample) {
        const pressureText = Number.isFinite(sample.pressure) && sample.pressure > 0 && sample.pressure < 1100
            ? `${Math.round(sample.pressure)} hPa`
            : '—';

        let altitudeText = '—';
        if (Number.isFinite(sample.heightM)) {
            const altitudeFt = Math.round(sample.heightM * 3.28084);
            if (altitudeFt >= -500 && altitudeFt <= 80000) {
                altitudeText = `${altitudeFt.toLocaleString('en-US')} ft`;
            }
        }

        const windDirText = Number.isFinite(sample.windDirDeg) && sample.windDirDeg >= 0 && sample.windDirDeg <= 360
            ? `${Math.round(sample.windDirDeg)}°`
            : '—';
        const windSpeedText = Number.isFinite(sample.windSpeedKt) && sample.windSpeedKt >= 0 && sample.windSpeedKt <= 400
            ? `${Math.round(sample.windSpeedKt)} kt`
            : '—';
        const temperatureText = Number.isFinite(sample.temperature) && sample.temperature > -120 && sample.temperature < 60
            ? `${Math.round(sample.temperature)} °C`
            : '—';

        return (
            `<span class="sounding-hover-row">Pressure: ${pressureText}</span>`
            + `<span class="sounding-hover-row">Altitude: ${altitudeText}</span>`
            + `<span class="sounding-hover-row">Wind: ${windDirText}, ${windSpeedText}</span>`
            + `<span class="sounding-hover-row">Temperature: ${temperatureText}</span>`
        );
    }

    function hideHoverReadout() {
        if (hoverEl) {
            hoverEl.classList.add('hidden');
            hoverEl.innerHTML = '';
        }
        lastPointerCss = null;
        // Restore the base sounding when the interactive parcel overlay clears.
        if (canvasEl && staticLayerCanvas) {
            const ctx = canvasEl.getContext('2d');
            restoreStaticLayer(ctx);
            const dpr = window.devicePixelRatio || 1;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
    }

    function updateHoverReadout(clientX, clientY) {
        if (!canvasEl || !lastPlot || !lastProfile?.levels?.length) {
            hideHoverReadout();
            return;
        }

        const rect = canvasEl.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        lastPointerCss = { x, y };
        if (
            x < lastPlot.padL
            || x > lastPlot.padL + lastPlot.innerW
            || y < lastPlot.padT
            || y > lastPlot.padT + lastPlot.innerH
        ) {
            hideHoverReadout();
            return;
        }

        const pressure = pressureFromY(y, lastPlot);
        const cursorTempC = temperatureFromSkewX(x, pressure, lastPlot);
        const level = nearestProfileLevel(lastProfile.levels, pressure);
        const cursorHeightM = heightMetersFromPressure(lastProfile, pressure);
        const surfacePressure = getSurfacePressure(lastProfile);
        const parcelPath = buildLiftedParcelPath(
            cursorTempC,
            pressure,
            surfacePressure,
            lastPlot,
        );

        const ctx = canvasEl.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        if (restoreStaticLayer(ctx)) {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            if (parcelPath) {
                drawLiftedParcelOverlay(
                    ctx,
                    lastPlot,
                    parcelPath.parcelPoints,
                    parcelPath.mixingRatioPoints,
                );
            }
        }

        if (hoverEl) {
            hoverEl.innerHTML = formatHoverReadout({
                pressure,
                temperature: Number.isFinite(level?.temperature) ? level.temperature : cursorTempC,
                heightM: Number.isFinite(cursorHeightM) ? cursorHeightM : level?.height,
                windDirDeg: level?.windDirDeg,
                windSpeedKt: level?.windSpeedKt,
            });
            hoverEl.classList.remove('hidden');

            const tipW = hoverEl.offsetWidth || 160;
            const tipH = hoverEl.offsetHeight || 72;
            let left = x + 12;
            let top = y + 12;
            if (left + tipW > rect.width - 4) left = x - tipW - 12;
            if (top + tipH > rect.height - 4) top = y - tipH - 12;
            left = Math.max(4, Math.min(left, rect.width - tipW - 4));
            top = Math.max(4, Math.min(top, rect.height - tipH - 4));
            hoverEl.style.left = `${left}px`;
            hoverEl.style.top = `${top}px`;
        }
    }

    function pointerCssPosition(event) {
        const rect = canvasEl.getBoundingClientRect();
        return {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
            clientX: event.clientX,
            clientY: event.clientY,
        };
    }

    function isInsidePlot(x, y, plot = lastPlot) {
        if (!plot) return false;
        return (
            x >= plot.padL
            && x <= plot.padL + plot.innerW
            && y >= plot.padT
            && y <= plot.padT + plot.innerH
        );
    }

    function endPanInteraction() {
        isPanning = false;
        panLastCss = null;
        panPointerId = null;
        pendingPanDx = 0;
        pendingPanDy = 0;
        if (panRaf) {
            cancelAnimationFrame(panRaf);
            panRaf = 0;
        }
        canvasEl?.classList.remove('is-panning');
    }

    function bindHoverInteractions() {
        if (!canvasEl || canvasEl.dataset.hoverBound === '1') return;
        canvasEl.dataset.hoverBound = '1';

        canvasEl.addEventListener('wheel', (event) => {
            if (!panelOpen || !lastProfile || !lastPlot) return;
            const { x, y } = pointerCssPosition(event);
            if (!isInsidePlot(x, y)) return;
            event.preventDefault();
            // Scroll up zooms in; scroll down zooms out, but never beyond the default extents.
            const factor = event.deltaY > 0 ? 1.06 : 1 / 1.06;
            zoomViewAt(x, y, factor);
        }, { passive: false });

        canvasEl.addEventListener('pointerdown', (event) => {
            if (!panelOpen || !lastProfile || !lastPlot) return;
            if (event.button != null && event.button !== 0) return;
            const pos = pointerCssPosition(event);
            if (!isInsidePlot(pos.x, pos.y)) return;
            panPointerId = event.pointerId;
            panLastCss = pos;
            isPanning = false;
            try {
                canvasEl.setPointerCapture(event.pointerId);
            } catch (_err) {
                // ignore
            }
        });

        canvasEl.addEventListener('pointermove', (event) => {
            if (!panelOpen || !lastProfile) return;
            const pos = pointerCssPosition(event);

            if (panPointerId != null && event.pointerId === panPointerId && panLastCss) {
                const dx = pos.x - panLastCss.x;
                const dy = pos.y - panLastCss.y;
                if (!isPanning && (Math.abs(dx) > PAN_START_PX || Math.abs(dy) > PAN_START_PX)) {
                    isPanning = true;
                    canvasEl.classList.add('is-panning');
                    hideHoverReadout();
                }
                if (isPanning) {
                    panViewByPixels(dx, dy);
                    panLastCss = pos;
                    return;
                }
            }

            if (isPanning) return;
            const { clientX, clientY } = event;
            if (hoverRaf) cancelAnimationFrame(hoverRaf);
            hoverRaf = requestAnimationFrame(() => {
                hoverRaf = 0;
                updateHoverReadout(clientX, clientY);
            });
        });

        canvasEl.addEventListener('pointerup', (event) => {
            if (panPointerId != null && event.pointerId === panPointerId) {
                const wasPanning = isPanning;
                endPanInteraction();
                try {
                    canvasEl.releasePointerCapture(event.pointerId);
                } catch (_err) {
                    // ignore
                }
                if (!wasPanning) {
                    updateHoverReadout(event.clientX, event.clientY);
                }
            }
        });

        canvasEl.addEventListener('pointercancel', () => {
            endPanInteraction();
        });

        canvasEl.addEventListener('dblclick', (event) => {
            if (!panelOpen || !lastProfile || !lastPlot) return;
            const { x, y } = pointerCssPosition(event);
            if (!isInsidePlot(x, y)) return;
            event.preventDefault();
            viewExtents = null;
            renderSkewT(lastProfile);
        });

        canvasEl.addEventListener('pointerleave', () => {
            if (isPanning) return;
            if (hoverRaf) {
                cancelAnimationFrame(hoverRaf);
                hoverRaf = 0;
            }
            hideHoverReadout();
        });
    }

    function choosePressureRange(levels) {
        let pMax = 1050;
        const surface = levels.find((level) => level.isSurface);
        if (Number.isFinite(surface?.pressure)) {
            pMax = Math.min(1050, Math.max(1000, Math.ceil(surface.pressure / 10) * 10 + 10));
        }
        // Windy-style crop: keep mid/upper troposphere without a large empty top.
        return { pMin: 150, pMax };
    }

    function choosePressureRangeFromHourly(hourly) {
        let maxSurface = null;
        (hourly?.surface_pressure || []).forEach((pressure) => {
            if (!Number.isFinite(pressure)) return;
            maxSurface = maxSurface == null ? pressure : Math.max(maxSurface, pressure);
        });
        if (maxSurface == null) {
            return { pMin: 150, pMax: 1050 };
        }
        return {
            pMin: 150,
            pMax: Math.min(1050, Math.max(1000, Math.ceil(maxSurface / 10) * 10 + 10)),
        };
    }

    function collectTemperatureSamples(levels, pMin, pMax) {
        // Include non-null dewpoints so the blue trace stays on-canvas.
        const samples = [];
        levels.forEach((level) => {
            if (!Number.isFinite(level.pressure)) return;
            if (level.pressure < pMin || level.pressure > pMax) return;
            if (Number.isFinite(level.temperature)) {
                samples.push({ temperature: level.temperature, pressure: level.pressure });
            }
            if (Number.isFinite(level.dewpoint)) {
                samples.push({ temperature: level.dewpoint, pressure: level.pressure });
            }
        });
        return samples;
    }

    function collectTemperatureSamplesFromHourly(hourly, pMin, pMax) {
        const samples = [];
        const times = hourly?.time || [];
        for (let hourIndex = 0; hourIndex < times.length; hourIndex += 1) {
            PRESSURE_LEVELS_HPA.forEach((pressure) => {
                if (pressure < pMin || pressure > pMax) return;
                const temperature = hourly[`temperature_${pressure}hPa`]?.[hourIndex];
                if (Number.isFinite(temperature)) {
                    samples.push({ temperature, pressure });
                }
                const dewpoint = resolveDewpoint(hourly, hourIndex, pressure, temperature);
                if (Number.isFinite(dewpoint)) {
                    samples.push({ temperature: dewpoint, pressure });
                }
            });
            const surfacePressure = hourly.surface_pressure?.[hourIndex];
            const surfaceTemp = hourly.temperature_2m?.[hourIndex];
            if (
                Number.isFinite(surfacePressure)
                && Number.isFinite(surfaceTemp)
                && surfacePressure >= pMin - 1
                && surfacePressure <= pMax + 1
            ) {
                samples.push({ temperature: surfaceTemp, pressure: surfacePressure });
                let surfaceDew = hourly.dew_point_2m?.[hourIndex];
                if (!Number.isFinite(surfaceDew)) {
                    surfaceDew = dewpointFromTempRh(surfaceTemp, hourly.relative_humidity_2m?.[hourIndex]);
                }
                if (Number.isFinite(surfaceDew)) {
                    samples.push({ temperature: surfaceDew, pressure: surfacePressure });
                }
            }
        }
        return samples;
    }

    function buildPlotSkeleton(width, height, pMin, pMax) {
        const padL = 32;
        const padR = 40;
        const padT = 8;
        const padB = 22;
        const plot = {
            width,
            height,
            padL,
            padR,
            padT,
            padB,
            pMin,
            pMax,
            innerW: Math.max(40, width - padL - padR),
            innerH: Math.max(40, height - padT - padB),
        };
        plot.logPMin = Math.log(plot.pMin);
        plot.logPMax = Math.log(plot.pMax);
        const logSpan = Math.max(plot.logPMax - plot.logPMin, 1e-6);
        plot.skewFactor = Math.min(plot.innerH * 0.92, plot.innerW * 0.92) / logSpan;
        return plot;
    }

    function computeAxesFromHourly(hourly, width, height) {
        const pressure = choosePressureRangeFromHourly(hourly);
        const plot = buildPlotSkeleton(width, height, pressure.pMin, pressure.pMax);
        const samples = collectTemperatureSamplesFromHourly(hourly, pressure.pMin, pressure.pMax);
        const temps = chooseTemperatureRange(samples, plot);
        return {
            pMin: pressure.pMin,
            pMax: pressure.pMax,
            tMin: temps.tMin,
            tMax: temps.tMax,
        };
    }

    function mergeLockedAxes(base, next) {
        if (!base) return { ...next };
        return {
            pMin: Math.min(base.pMin, next.pMin),
            pMax: Math.max(base.pMax, next.pMax),
            tMin: Math.min(base.tMin, next.tMin),
            tMax: Math.max(base.tMax, next.tMax),
        };
    }

    function pinMatchesLockedAxes(lat, lon, modelId = selectedModelId) {
        if (!lockedAxes) return false;
        return (
            Math.abs(lockedAxes.lat - lat) < 1e-4
            && Math.abs(lockedAxes.lon - lon) < 1e-4
            && lockedAxes.model === normalizeModelId(modelId)
        );
    }

    function updateLockedAxesFromHourly(hourly, lat, lon, modelId = selectedModelId) {
        const width = canvasEl?.clientWidth || 640;
        const height = canvasEl?.clientHeight || 520;
        const model = normalizeModelId(modelId);
        const dayAxes = computeAxesFromHourly(hourly, width, height);
        if (!pinMatchesLockedAxes(lat, lon, model)) {
            lockedAxes = { ...dayAxes, lat, lon, model };
            return lockedAxes;
        }
        lockedAxes = { ...mergeLockedAxes(lockedAxes, dayAxes), lat, lon, model };
        return lockedAxes;
    }

    function chooseTemperatureRange(samples, plot) {
        if (!samples.length) {
            return { tMin: -40, tMax: 30 };
        }

        const marginLeftPx = 8;
        const marginRightPx = 12;
        const rawMin = Math.min(...samples.map((s) => s.temperature));
        const rawMax = Math.max(...samples.map((s) => s.temperature));
        // Fit T+Td, but cap span so extremely dry upper Td does not empty the pane.
        const maxSpan = 70;
        let span = Math.max(40, Math.ceil((rawMax - rawMin + 6) / 5) * 5);
        span = Math.min(span, maxSpan);

        const tryFit = (tempSpan) => {
            let tMinLow = -Infinity;
            let tMinHigh = Infinity;
            samples.forEach((sample) => {
                const skew = (plot.logPMax - Math.log(Math.max(sample.pressure, plot.pMin))) * plot.skewFactor;
                // x = padL + (T - tMin)/span * innerW + skew
                tMinHigh = Math.min(
                    tMinHigh,
                    sample.temperature - ((marginLeftPx - skew) / plot.innerW) * tempSpan,
                );
                tMinLow = Math.max(
                    tMinLow,
                    sample.temperature - ((plot.innerW - marginRightPx - skew) / plot.innerW) * tempSpan,
                );
            });
            if (!(tMinLow <= tMinHigh)) {
                return null;
            }

            // Prefer a higher tMin (less empty cold flank) while keeping surface in the right half.
            const surface = samples.reduce((best, sample) => (
                !best || sample.pressure > best.pressure ? sample : best
            ), null);
            const room = Math.max(0, tMinHigh - tMinLow);
            let tMin = tMinHigh - Math.min(4, room * 0.15);
            if (surface) {
                const rightish = surface.temperature - 0.72 * tempSpan;
                tMin = Math.min(tMinHigh, Math.max(tMinLow, rightish));
            }
            const snapped = Math.floor(tMin / 5) * 5;
            return { tMin: snapped, tMax: snapped + tempSpan };
        };

        for (let i = 0; i < 14; i += 1) {
            const fitted = tryFit(span);
            if (fitted) return fitted;
            if (span >= maxSpan) break;
            span = Math.min(maxSpan, span + 5);
        }

        // Capped span cannot cover every ultra-dry Td — keep the warm end and extend left.
        const fallbackMin = Math.floor((rawMax - maxSpan + 2) / 5) * 5;
        return { tMin: fallbackMin, tMax: fallbackMin + maxSpan };
    }

    function buildPlotLayout(width, height, levels, axesLock = null) {
        const pressure = axesLock
            ? { pMin: axesLock.pMin, pMax: axesLock.pMax }
            : choosePressureRange(levels);
        const plot = buildPlotSkeleton(width, height, pressure.pMin, pressure.pMax);

        if (
            axesLock
            && Number.isFinite(axesLock.tMin)
            && Number.isFinite(axesLock.tMax)
            && axesLock.tMax > axesLock.tMin
        ) {
            plot.tMin = axesLock.tMin;
            plot.tMax = axesLock.tMax;
            return plot;
        }

        const temps = chooseTemperatureRange(
            collectTemperatureSamples(levels, plot.pMin, plot.pMax),
            plot,
        );
        plot.tMin = temps.tMin;
        plot.tMax = temps.tMax;
        return plot;
    }

    function makeViewSessionKey(profile) {
        return [
            normalizeModelId(profile?.model || selectedModelId),
            Number.isFinite(profile?.latitude) ? profile.latitude.toFixed(3) : '',
            Number.isFinite(profile?.longitude) ? profile.longitude.toFixed(3) : '',
        ].join(':');
    }

    function copyExtents(extents) {
        if (!extents) return null;
        return {
            pMin: extents.pMin,
            pMax: extents.pMax,
            tMin: extents.tMin,
            tMax: extents.tMax,
        };
    }

    function resetViewExtents() {
        viewExtents = null;
        defaultViewExtents = null;
        viewSessionKey = null;
    }

    function clampViewToDefault(view, defaults) {
        if (!view || !defaults) return copyExtents(defaults);

        const defTSpan = Math.max(defaults.tMax - defaults.tMin, 1e-6);
        const defLogPMin = Math.log(defaults.pMin);
        const defLogPMax = Math.log(defaults.pMax);
        const defLogSpan = Math.max(defLogPMax - defLogPMin, 1e-6);
        const minTSpan = defTSpan / VIEW_MAX_ZOOM;
        const minLogSpan = defLogSpan / VIEW_MAX_ZOOM;

        let tMin = view.tMin;
        let tMax = view.tMax;
        let tSpan = tMax - tMin;
        if (!(tSpan > 0) || tSpan > defTSpan) {
            tMin = defaults.tMin;
            tMax = defaults.tMax;
            tSpan = defTSpan;
        } else if (tSpan < minTSpan) {
            const mid = (tMin + tMax) / 2;
            tMin = mid - minTSpan / 2;
            tMax = mid + minTSpan / 2;
            tSpan = minTSpan;
        }
        if (tMin < defaults.tMin) {
            tMax += defaults.tMin - tMin;
            tMin = defaults.tMin;
        }
        if (tMax > defaults.tMax) {
            tMin -= tMax - defaults.tMax;
            tMax = defaults.tMax;
        }
        tMin = Math.max(defaults.tMin, Math.min(tMin, defaults.tMax - tSpan));
        tMax = tMin + tSpan;

        let logPMin = Math.log(Math.max(view.pMin, 1e-6));
        let logPMax = Math.log(Math.max(view.pMax, 1e-6));
        let logSpan = logPMax - logPMin;
        if (!(logSpan > 0) || logSpan > defLogSpan) {
            logPMin = defLogPMin;
            logPMax = defLogPMax;
            logSpan = defLogSpan;
        } else if (logSpan < minLogSpan) {
            const mid = (logPMin + logPMax) / 2;
            logPMin = mid - minLogSpan / 2;
            logPMax = mid + minLogSpan / 2;
            logSpan = minLogSpan;
        }
        if (logPMin < defLogPMin) {
            logPMax += defLogPMin - logPMin;
            logPMin = defLogPMin;
        }
        if (logPMax > defLogPMax) {
            logPMin -= logPMax - defLogPMax;
            logPMax = defLogPMax;
        }
        logPMin = Math.max(defLogPMin, Math.min(logPMin, defLogPMax - logSpan));
        logPMax = logPMin + logSpan;

        return {
            pMin: Math.exp(logPMin),
            pMax: Math.exp(logPMax),
            tMin,
            tMax,
        };
    }

    function applyViewExtentsToPlot(plot, extents) {
        if (!plot || !extents) return plot;
        plot.pMin = extents.pMin;
        plot.pMax = extents.pMax;
        plot.tMin = extents.tMin;
        plot.tMax = extents.tMax;
        plot.logPMin = Math.log(plot.pMin);
        plot.logPMax = Math.log(plot.pMax);
        const logSpan = Math.max(plot.logPMax - plot.logPMin, 1e-6);
        plot.skewFactor = Math.min(plot.innerH * 0.92, plot.innerW * 0.92) / logSpan;
        return plot;
    }

    function zoomViewAt(cssX, cssY, factor) {
        if (!lastPlot || !defaultViewExtents || !lastProfile) return;
        const current = clampViewToDefault(viewExtents || defaultViewExtents, defaultViewExtents);
        const pressure = pressureFromY(cssY, lastPlot);
        const tempC = temperatureFromSkewX(cssX, pressure, lastPlot);
        const logPMin = Math.log(current.pMin);
        const logPMax = Math.log(current.pMax);
        const logSpan = Math.max(logPMax - logPMin, 1e-6);
        const tSpan = Math.max(current.tMax - current.tMin, 1e-6);
        const fracP = (Math.log(Math.max(pressure, 1e-6)) - logPMin) / logSpan;
        const fracT = (tempC - current.tMin) / tSpan;
        const nextLogSpan = logSpan * factor;
        const nextTSpan = tSpan * factor;
        const nextLogPMin = Math.log(Math.max(pressure, 1e-6)) - fracP * nextLogSpan;
        viewExtents = clampViewToDefault({
            pMin: Math.exp(nextLogPMin),
            pMax: Math.exp(nextLogPMin + nextLogSpan),
            tMin: tempC - fracT * nextTSpan,
            tMax: tempC - fracT * nextTSpan + nextTSpan,
        }, defaultViewExtents);
        renderSkewT(lastProfile, { preserveHover: false });
    }

    function panViewByPixels(dxCss, dyCss) {
        pendingPanDx += dxCss;
        pendingPanDy += dyCss;
        if (panRaf) return;
        panRaf = requestAnimationFrame(() => {
            panRaf = 0;
            const dx = pendingPanDx;
            const dy = pendingPanDy;
            pendingPanDx = 0;
            pendingPanDy = 0;
            if (!lastPlot || !defaultViewExtents || !lastProfile) return;
            if (dx === 0 && dy === 0) return;
            const current = clampViewToDefault(viewExtents || defaultViewExtents, defaultViewExtents);
            const tPerPx = (current.tMax - current.tMin) / Math.max(lastPlot.innerW, 1e-6);
            const logSpan = Math.log(current.pMax) - Math.log(current.pMin);
            const logPPerPx = logSpan / Math.max(lastPlot.innerH, 1e-6);
            // Drag right/down moves the content with the pointer.
            const dT = -dx * tPerPx;
            const dLogP = -dy * logPPerPx;
            viewExtents = clampViewToDefault({
                pMin: Math.exp(Math.log(current.pMin) + dLogP),
                pMax: Math.exp(Math.log(current.pMax) + dLogP),
                tMin: current.tMin + dT,
                tMax: current.tMax + dT,
            }, defaultViewExtents);
            renderSkewT(lastProfile, { preserveHover: false });
        });
    }

    function drawBackground(ctx, plot) {
        ctx.fillStyle = '#f4f7fb';
        ctx.fillRect(0, 0, plot.width, plot.height);

        ctx.save();
        ctx.beginPath();
        ctx.rect(plot.padL, plot.padT, plot.innerW, plot.innerH);
        ctx.clip();

        // Isotherms every 5°; keep 0°C and -20°C prominent, mute the rest.
        for (let t = plot.tMin - 60; t <= plot.tMax + 60; t += 5) {
            const emphasis = t === 0 || t === -20;
            ctx.strokeStyle = emphasis ? 'rgba(210, 130, 145, 0.75)' : 'rgba(200, 150, 160, 0.14)';
            ctx.lineWidth = emphasis ? 1.25 : 0.7;
            ctx.beginPath();
            let started = false;
            for (let p = plot.pMax; p >= plot.pMin; p -= 5) {
                const x = skewX(t, p, plot);
                const y = yFromPressure(p, plot);
                if (!started) {
                    ctx.moveTo(x, y);
                    started = true;
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
        }

        // Dry (solid brown) then saturated (dashed teal) adiabats under the isobars.
        drawDryAdiabats(ctx, plot);
        drawSaturatedAdiabats(ctx, plot);

        const pressureTicks = [1000, 925, 850, 700, 500, 400, 300, 250, 200, 150];
        ctx.strokeStyle = 'rgba(120, 140, 165, 0.55)';
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        pressureTicks.forEach((p) => {
            if (p < plot.pMin || p > plot.pMax) return;
            const y = yFromPressure(p, plot);
            ctx.beginPath();
            ctx.moveTo(plot.padL, y);
            ctx.lineTo(plot.padL + plot.innerW, y);
            ctx.stroke();
        });

        ctx.restore();

        ctx.strokeStyle = '#8a97a8';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(plot.padL, plot.padT, plot.innerW, plot.innerH);

        ctx.fillStyle = '#4a5a70';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'right';
        pressureTicks.forEach((p) => {
            if (p < plot.pMin || p > plot.pMax) return;
            const y = yFromPressure(p, plot);
            ctx.fillText(`${p}`, plot.padL - 6, y + 3);
        });

        ctx.textAlign = 'center';
        for (let t = Math.ceil(plot.tMin / 10) * 10; t <= plot.tMax; t += 10) {
            const x = skewX(t, plot.pMax, plot);
            if (x < plot.padL - 2 || x > plot.padL + plot.innerW + 2) continue;
            ctx.fillText(`${t}`, Math.min(Math.max(x, plot.padL), plot.padL + plot.innerW), plot.padT + plot.innerH + 14);
        }
    }

    function pointInPlot(x, y, plot, pad = 2) {
        return (
            x >= plot.padL - pad
            && x <= plot.padL + plot.innerW + pad
            && y >= plot.padT - pad
            && y <= plot.padT + plot.innerH + pad
        );
    }

    function drawTrace(ctx, levels, key, color, plot) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(plot.padL, plot.padT, plot.innerW, plot.innerH);
        ctx.clip();

        ctx.strokeStyle = color;
        ctx.lineWidth = key === 'dewpoint' ? 2.2 : 2.6;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        // Stroke each contiguous run of finite values so nulls only open gaps.
        let started = false;
        const flush = () => {
            if (!started) return;
            ctx.stroke();
            ctx.beginPath();
            started = false;
        };

        ctx.beginPath();
        levels.forEach((level) => {
            const value = level[key];
            if (!Number.isFinite(value) || !Number.isFinite(level.pressure)) {
                flush();
                return;
            }
            if (level.pressure < plot.pMin - 1 || level.pressure > plot.pMax + 2) {
                flush();
                return;
            }
            const x = skewX(value, level.pressure, plot);
            const y = yFromPressure(level.pressure, plot);
            if (!Number.isFinite(x) || !Number.isFinite(y)) {
                flush();
                return;
            }
            if (!started) {
                ctx.moveTo(x, y);
                started = true;
            } else {
                ctx.lineTo(x, y);
            }
        });
        flush();
        ctx.restore();
    }

    function levelsForDisplay(levels, plot) {
        const surface = levels.find((level) => level.isSurface);
        const surfaceP = Number.isFinite(surface?.pressure) ? surface.pressure : null;
        return levels.filter((level) => {
            if (!Number.isFinite(level.pressure)) return false;
            if (level.pressure < plot.pMin - 1 || level.pressure > plot.pMax + 2) return false;
            if (surfaceP != null && !level.isSurface && level.pressure >= surfaceP - 0.5) return false;
            return true;
        });
    }

    function drawWindBarb(ctx, x, y, speedKt, dirDeg, southernHemisphere = true) {
        if (!Number.isFinite(speedKt) || !Number.isFinite(dirDeg) || speedKt < 2) return;
        // Meteorological dir = where wind is FROM. Staff points that way so feathers
        // sit on the upwind end (away from the direction of travel).
        const angle = (dirDeg * Math.PI) / 180;
        // NH: feathers on +90° side of staff; SH: opposite side.
        const side = southernHemisphere ? -Math.PI / 2 : Math.PI / 2;
        const staff = 16;
        const sideX = (len) => Math.sin(angle + side) * len;
        const sideY = (len) => -Math.cos(angle + side) * len;
        const alongX = (len) => Math.sin(angle) * len;
        const alongY = (len) => -Math.cos(angle) * len;

        ctx.strokeStyle = '#222';
        ctx.lineWidth = 1.15;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + alongX(staff), y + alongY(staff));
        ctx.stroke();

        let remaining = Math.round(speedKt / 5) * 5;
        let along = staff;
        while (remaining >= 50) {
            const bx = x + alongX(along);
            const by = y + alongY(along);
            ctx.beginPath();
            ctx.moveTo(bx, by);
            ctx.lineTo(
                bx + sideX(7) - alongX(3.5),
                by + sideY(7) - alongY(3.5)
            );
            ctx.stroke();
            remaining -= 50;
            along -= 5;
        }
        while (remaining >= 10) {
            const bx = x + alongX(along);
            const by = y + alongY(along);
            ctx.beginPath();
            ctx.moveTo(bx, by);
            ctx.lineTo(bx + sideX(7), by + sideY(7));
            ctx.stroke();
            remaining -= 10;
            along -= 3.5;
        }
        if (remaining >= 5) {
            const bx = x + alongX(along);
            const by = y + alongY(along);
            ctx.beginPath();
            ctx.moveTo(bx, by);
            ctx.lineTo(bx + sideX(3.5), by + sideY(3.5));
            ctx.stroke();
        }
    }

    function renderSkewT(profile, { preserveHover = false } = {}) {
        ensureUi();
        if (!canvasEl || !profile?.levels?.length) return;
        lastProfile = profile;
        if (!preserveHover) {
            lastPointerCss = null;
            if (hoverEl) {
                hoverEl.classList.add('hidden');
                hoverEl.innerHTML = '';
            }
        }

        const width = canvasEl.clientWidth || 640;
        const height = canvasEl.clientHeight || 520;
        const dpr = window.devicePixelRatio || 1;
        canvasEl.width = Math.floor(width * dpr);
        canvasEl.height = Math.floor(height * dpr);

        const ctx = canvasEl.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const axesLock = pinMatchesLockedAxes(profile.latitude, profile.longitude, profile.model)
            ? lockedAxes
            : null;
        const basePlot = buildPlotLayout(width, height, profile.levels, axesLock);
        const baseExtents = {
            pMin: basePlot.pMin,
            pMax: basePlot.pMax,
            tMin: basePlot.tMin,
            tMax: basePlot.tMax,
        };
        const sessionKey = makeViewSessionKey(profile);
        if (sessionKey !== viewSessionKey) {
            viewSessionKey = sessionKey;
            viewExtents = null;
        }
        // Hard clamp boundary is the current auto-fit / locked-axes window (includes the ground).
        defaultViewExtents = copyExtents(baseExtents);

        let plot = basePlot;
        if (viewExtents) {
            viewExtents = clampViewToDefault(viewExtents, defaultViewExtents);
            plot = applyViewExtentsToPlot(basePlot, viewExtents);
        }
        lastPlot = plot;
        // Default SH for this AU-focused viewer; follow profile latitude when available.
        const southernHemisphere = !(Number.isFinite(profile.latitude) && profile.latitude > 0);

        const displayLevels = levelsForDisplay(profile.levels, plot);

        drawBackground(ctx, plot);
        drawTrace(ctx, displayLevels, 'temperature', '#d62828', plot);
        drawTrace(ctx, displayLevels, 'dewpoint', '#1d6fd8', plot);

        let lastBarbY = -Infinity;
        displayLevels.forEach((level) => {
            if (level.isSurface) return;
            if (!Number.isFinite(level.windSpeedKt) || !Number.isFinite(level.windDirDeg)) return;
            const y = yFromPressure(level.pressure, plot);
            // Keep near-surface barbs from stacking on top of each other.
            if (Math.abs(y - lastBarbY) < 14) return;
            drawWindBarb(
                ctx,
                plot.padL + plot.innerW + 14,
                y,
                level.windSpeedKt,
                level.windDirDeg,
                southernHemisphere,
            );
            lastBarbY = y;
        });

        // Snapshot the base diagram so hover can overlay a parcel path cheaply.
        captureStaticLayer();
    }

    function placePinOnTarget(target, offsetX, offsetY) {
        if (!target?.pinEl || !target?.imgEl) return;
        const panel = target.imgEl.closest('.image-panel') || target.imgEl.parentElement;
        if (!panel) return;

        panel.style.position = panel.style.position || 'relative';
        if (target.pinEl.parentElement !== panel) {
            panel.appendChild(target.pinEl);
        }

        const rect = target.imgEl.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        target.pinEl.style.left = `${rect.left - panelRect.left + offsetX}px`;
        target.pinEl.style.top = `${rect.top - panelRect.top + offsetY}px`;
        target.pinEl.classList.remove('hidden');
        target.pinEl.setAttribute('aria-hidden', 'false');
    }

    function hideAllPins() {
        pinTargets.forEach((target) => {
            if (!target?.pinEl) return;
            target.pinEl.classList.add('hidden');
            target.pinEl.setAttribute('aria-hidden', 'true');
        });
    }

    function isPinTargetVisible(target) {
        const img = target?.imgEl;
        if (!img?.complete || !img.naturalWidth || !img.naturalHeight) {
            return false;
        }
        const panel = img.closest('.image-panel');
        if (!panel) {
            return false;
        }
        // Pair layout hides the bottom row; skip those targets entirely.
        const pair = document.getElementById('image-pair');
        if (panel.classList.contains('quad-only') && pair?.classList.contains('layout-pair')) {
            return false;
        }
        const rect = img.getBoundingClientRect();
        return rect.width > 1 && rect.height > 1;
    }

    function syncPin() {
        ensureUi();
        if (!panelOpen || !Number.isFinite(pinLat) || !Number.isFinite(pinLon)) {
            hideAllPins();
            return;
        }

        pinTargets.forEach((target) => {
            if (!target?.pinEl || !target?.imgEl) return;
            if (!isPinTargetVisible(target)) {
                target.pinEl.classList.add('hidden');
                target.pinEl.setAttribute('aria-hidden', 'true');
                return;
            }
            const offsets = window.MapGeoref?.lonLatToImageOffsets?.(target.imgEl, pinLon, pinLat);
            if (!offsets) {
                target.pinEl.classList.add('hidden');
                target.pinEl.setAttribute('aria-hidden', 'true');
                return;
            }
            placePinOnTarget(target, offsets.offsetX, offsets.offsetY);
        });
    }

    function formatLatLon(lat, lon) {
        const latHem = lat >= 0 ? 'N' : 'S';
        const lonHem = lon >= 0 ? 'E' : 'W';
        return `${Math.abs(lat).toFixed(2)}°${latHem}, ${Math.abs(lon).toFixed(2)}°${lonHem}`;
    }

    function setSoundingLoading(visible) {
        ensureUi();
        if (loadingEl) {
            loadingEl.classList.toggle('hidden', !visible);
            loadingEl.setAttribute('aria-hidden', visible ? 'false' : 'true');
        }
        canvasWrapEl?.classList.toggle('is-loading', Boolean(visible));
    }

    async function loadProfileForPin(validTime, { showLoading = true } = {}) {
        ensureUi();
        if (!panelOpen || !Number.isFinite(pinLat) || !Number.isFinite(pinLon)) {
            return;
        }
        if (!(validTime instanceof Date) || Number.isNaN(validTime.getTime())) {
            return;
        }

        const modelMeta = getModelMeta(selectedModelId);
        const validTimeIso = validTime.toISOString();
        lastRequestedValidTime = validTime;
        if (
            validTimeIso === lastValidTimeIso
            && lastProfile
            && lastProfile.model === modelMeta.id
        ) {
            setSoundingLoading(false);
            return;
        }

        const generation = ++loadGeneration;
        lastValidTimeIso = validTimeIso;

        if (showLoading) {
            // Keep layout stable: grey the existing diagram and show a spinner overlay
            // instead of injecting status text that resizes the panel.
            if (metaEl && (!metaEl.textContent || metaEl.textContent.includes('balloon tool') || metaEl.textContent.includes('Click a map'))) {
                metaEl.textContent = formatLatLon(pinLat, pinLon);
            }
            if (statusEl) {
                statusEl.textContent = '';
                statusEl.classList.remove('error');
            }
            setSoundingLoading(true);
            hideHoverReadout();
        }

        const key = cacheKey(pinLat, pinLon, validTimeIso, modelMeta.id);
        try {
            const { hourly, model } = await fetchOpenMeteoHourly(pinLat, pinLon, validTime, modelMeta.id);
            let profile = profileCache.get(key);
            if (!profile) {
                profile = buildProfileFromHourly(hourly, model, pinLat, pinLon, validTime);
                rememberProfile(key, profile);
            }

            // A newer timestep request superseded this one while we were waiting.
            if (generation !== loadGeneration) {
                return;
            }

            // Lock / expand axes from the full day at this pin so animation stays stable.
            updateLockedAxesFromHourly(hourly, pinLat, pinLon, modelMeta.id);

            metaEl.textContent = (
                `${formatLatLon(pinLat, pinLon)} · Valid ${profile.validTime.toISOString().replace('.000Z', 'Z')} · `
                + `${profile.source}`
            );
            if (statusEl) {
                statusEl.textContent = '';
                statusEl.classList.remove('error');
            }
            renderSkewT(profile);
            setSoundingLoading(false);
        } catch (error) {
            if (generation !== loadGeneration) {
                return;
            }
            console.warn('Sounding fetch failed:', error);
            lastProfile = null;
            setSoundingLoading(false);
            if (statusEl) {
                statusEl.textContent = error?.message || 'Unable to load sounding';
                statusEl.classList.add('error');
            }
            const ctx = canvasEl?.getContext('2d');
            if (ctx && canvasEl) {
                ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
            }
        }
    }

    async function openAt({ lat, lon, validTime, model, mapImg, offsetX, offsetY }) {
        ensureUi();
        if (!panelEl || !toolEnabled) return;

        pinLat = lat;
        pinLon = lon;
        lastValidTimeIso = null;
        lockedAxes = null;
        resetViewExtents();
        if (model != null) {
            setSelectedModel(model, { reload: false });
        }

        panelEl.classList.remove('hidden');
        panelEl.setAttribute('aria-hidden', 'false');
        document.body.classList.add('sounding-panel-open');
        panelOpen = true;
        setResizeHandleVisible(true);
        if (storedPanelSizePx == null) {
            storedPanelSizePx = readStoredPanelSize();
        }
        applyPanelSize(storedPanelSizePx, { persist: false, notify: false });
        syncPin();

        // Allow layout to settle before measuring canvas size / final pin position.
        requestAnimationFrame(() => {
            scheduleLayoutNotify();
        });

        await loadProfileForPin(validTime, { showLoading: true });
    }

    function syncToValidTime(validTime) {
        if (!panelOpen || !Number.isFinite(pinLat) || !Number.isFinite(pinLon)) {
            return;
        }
        // During scrubbing/playback, reuse the cached day payload so updates stay snappy.
        loadProfileForPin(validTime, { showLoading: false });
    }

    function close() {
        ensureUi();
        if (!panelEl) return;
        endResizeDrag();
        loadGeneration += 1;
        panelEl.classList.add('hidden');
        panelEl.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('sounding-panel-open');
        panelOpen = false;
        setResizeHandleVisible(false);
        clearPanelSizeStyle();
        hideAllPins();
        pinLat = null;
        pinLon = null;
        lastProfile = null;
        lastPlot = null;
        lastValidTimeIso = null;
        lastRequestedValidTime = null;
        lockedAxes = null;
        resetViewExtents();
        endPanInteraction();
        setSoundingLoading(false);
        hideHoverReadout();
        if (metaEl) {
            metaEl.textContent = toolEnabled
                ? 'Click a map point to load a profile.'
                : 'Enable the balloon tool, then click a map point.';
        }
        if (statusEl) {
            statusEl.textContent = '';
            statusEl.classList.remove('error');
        }
        requestAnimationFrame(() => {
            window.dispatchEvent(new Event('resize'));
        });
    }

    function isOpen() {
        return panelOpen;
    }

    function getPinLocation() {
        if (!panelOpen || !Number.isFinite(pinLat) || !Number.isFinite(pinLon)) {
            return null;
        }
        return { lat: pinLat, lon: pinLon };
    }

    window.SoundingViewer = {
        openAt,
        close,
        isOpen,
        getPinLocation,
        isToolEnabled,
        setToolEnabled,
        renderSkewT,
        syncPin,
        syncToValidTime,
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            ensureUi();
            syncToolUi();
            storedPanelSizePx = readStoredPanelSize();
        });
    } else {
        ensureUi();
        syncToolUi();
        storedPanelSizePx = readStoredPanelSize();
    }
})();
