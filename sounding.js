(() => {
    const PRESSURE_LEVELS_HPA = [
        1000, 975, 950, 925, 900, 850, 800, 700, 600, 500, 400, 300, 250, 200, 150, 100,
    ];
    const HODO_MIN_PRESSURE_HPA = 300;

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
    const MAP_LOCATION_VALUE = '__map__';
    const AERODROME_CSV_URL = 'aerodrome_lat_long.csv';
    const PROFILE_TOOLS = {
        sonde: {
            id: 'sonde',
            buttonId: 'sounding-tool-btn',
            label: 'Sounding',
            title: 'Sounding (S)',
            panelLabel: 'Sounding diagram',
        },
        hodograph: {
            id: 'hodograph',
            buttonId: 'hodograph-tool-btn',
            label: 'Hodograph',
            title: 'Hodograph (H)',
            panelLabel: 'Hodograph',
        },
        table: {
            id: 'table',
            buttonId: 'profile-table-tool-btn',
            label: 'Profile table',
            title: 'Profile table (P)',
            panelLabel: 'Profile table',
        },
    };

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
    let locationSelectEl;
    let viewStackEl;
    let tableWrapEl;
    let tableBodyEl;
    let readoutEl;
    let indicesEl;
    let stormModeEl;
    let stormMovementEl;
    let severeEl;
    let bunkersLegendEl;
    let helpOverlayEl;
    let helpTitleEl;
    let helpBodyEl;
    let helpCloseBtn;
    let toolButtons = {};
    let activeTool = null;
    let lastHodoLayout = null;
    let pinTargets = [];
    let resizeHandleEl;
    let workspaceEl;
    let pinLat = null;
    let pinLon = null;
    let mapClickLat = null;
    let mapClickLon = null;
    let selectedIcao = null;
    let aerodromes = [];
    let aerodromesLoadPromise = null;
    let toolEnabled = false;
    let panelOpen = false;
    let selectedModelId = DEFAULT_SOUNDING_MODEL;
    let lastProfile = null;
    let lastPlot = null;
    let lastValidTimeIso = null;
    let lastRequestedValidTime = null;
    // Fixed T/P axes for the current pin/model so playback doesn't rescale every hour.
    let lockedAxes = null;
    let lockedHodo = null;
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
    let hodoView = null;
    let defaultHodoView = null;
    const bunkersOverlay = {
        steering: false,
        shear: false,
        propagation: false,
        lm: false,
        rm: false,
    };
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
        locationSelectEl = document.getElementById('sounding-location-select');
        viewStackEl = document.getElementById('sounding-view-stack');
        tableWrapEl = document.getElementById('sounding-table-wrap');
        tableBodyEl = document.getElementById('sounding-profile-table-body');
        readoutEl = document.getElementById('hodograph-readout');
        indicesEl = document.getElementById('hodograph-indices');
        stormModeEl = document.getElementById('hodograph-storm-mode');
        stormMovementEl = document.getElementById('hodograph-storm-movement');
        severeEl = document.getElementById('hodograph-severe');
        bunkersLegendEl = document.getElementById('hodograph-bunkers-legend');
        helpOverlayEl = document.getElementById('hodograph-help-overlay');
        helpTitleEl = document.getElementById('hodograph-help-title');
        helpBodyEl = document.getElementById('hodograph-help-body');
        helpCloseBtn = document.getElementById('hodograph-help-close');
        bindBunkersLegend();
        bindHodographHelp();
        toolButtons = {
            sonde: document.getElementById('sounding-tool-btn'),
            hodograph: document.getElementById('hodograph-tool-btn'),
            table: document.getElementById('profile-table-tool-btn'),
        };
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
                releaseProfileSelectFocus(modelSelectEl);
            });
        }
        if (locationSelectEl) {
            locationSelectEl.addEventListener('change', () => {
                handleLocationSelect(locationSelectEl.value);
                releaseProfileSelectFocus(locationSelectEl);
            });
            loadAerodromes();
        }
        Object.keys(PROFILE_TOOLS).forEach((toolId) => {
            const button = toolButtons[toolId];
            if (!button) {
                return;
            }
            button.addEventListener('click', () => {
                toggleTool(toolId);
            });
        });
        bindResizeHandle();
        bindHoverInteractions();
        window.addEventListener('resize', () => {
            if (!panelOpen || activePointerId != null) return;
            // Re-clamp only; avoid re-dispatching resize (script.js already handles maps).
            applyPanelSize(storedPanelSizePx, { persist: false, notify: false });
            if (lastProfile) {
                renderActiveView(lastProfile);
            }
        });
        renderHodographReadout(null);
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
                renderActiveView(lastProfile);
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

    function releaseProfileSelectFocus(selectEl) {
        if (selectEl && document.activeElement === selectEl) {
            selectEl.blur();
        }
    }

    function syncToolUi() {
        document.body.classList.toggle('sounding-tool-active', toolEnabled);
        Object.keys(PROFILE_TOOLS).forEach((toolId) => {
            const button = toolButtons[toolId];
            const meta = PROFILE_TOOLS[toolId];
            if (!button || !meta) {
                return;
            }
            const active = activeTool === toolId;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', active ? 'true' : 'false');
            button.title = meta.title;
            button.setAttribute('aria-label', meta.title);
        });
        if (panelEl) {
            panelEl.setAttribute('aria-label', PROFILE_TOOLS[activeTool]?.panelLabel || 'Profile panel');
        }
        syncProfileViewMode();
    }

    function syncProfileViewMode() {
        const showTable = activeTool === 'table';
        const showHodograph = activeTool === 'hodograph';
        canvasWrapEl?.classList.toggle('hidden', showTable);
        tableWrapEl?.classList.toggle('hidden', !showTable);
        readoutEl?.classList.toggle('hidden', !showHodograph);
        bunkersLegendEl?.classList.toggle('hidden', !showHodograph);
        viewStackEl?.classList.toggle('is-hodograph', showHodograph);
        if (showTable || showHodograph) {
            endPanInteraction();
        }
        if (activeTool !== 'sonde' && activeTool !== 'hodograph') {
            hideHoverReadout();
        }
        if (canvasEl) {
            canvasEl.style.cursor = activeTool === 'hodograph' || activeTool === 'sonde' ? 'crosshair' : '';
        }
    }

    function setActiveTool(toolId) {
        ensureUi();
        const next = PROFILE_TOOLS[toolId] ? toolId : null;
        if (activeTool === next) {
            return;
        }
        activeTool = next;
        toolEnabled = Boolean(next);
        hideHoverReadout();
        syncToolUi();
        if (panelOpen && lastProfile) {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    renderActiveView(lastProfile, { preserveHover: false });
                });
            });
        }
    }

    function toggleTool(toolId) {
        if (activeTool === toolId) {
            setActiveTool(null);
            close();
            return;
        }
        setActiveTool(toolId);
    }

    function setToolEnabled(enabled) {
        if (enabled) {
            setActiveTool(activeTool || 'sonde');
            return;
        }
        setActiveTool(null);
        close();
    }

    function isToolEnabled() {
        return toolEnabled;
    }

    function getActiveTool() {
        return activeTool;
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
        lockedHodo = null;
        lastValidTimeIso = null;
        lastProfile = null;
        resetViewExtents();
        clearDrawnProfile();
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
        // v7: include 10 m winds for surface hodograph / profile table rows.
        return `v7:${normalizeModelId(modelId)}:${lat.toFixed(3)},${lon.toFixed(3)},${validTimeIso}`;
    }

    function hourlyCacheKey(lat, lon, dateText, modelId = selectedModelId) {
        return `v7:${normalizeModelId(modelId)}:${lat.toFixed(3)},${lon.toFixed(3)},${dateText}`;
    }

    function rememberProfile(key, profile) {
        profileCache.set(key, profile);
        if (profileCache.size > MAX_CACHE_ENTRIES) {
            const oldest = profileCache.keys().next().value;
            profileCache.delete(oldest);
        }
    }

    function rememberHourly(key, hourly, model, elevationM = null) {
        hourlyCache.set(key, { hourly, model, elevation: elevationM });
        if (hourlyCache.size > MAX_HOURLY_CACHE_ENTRIES) {
            const oldest = hourlyCache.keys().next().value;
            hourlyCache.delete(oldest);
        }
    }

    function estimateSurfaceHeightAmslM(levels, surfacePressure, surfaceTempC, elevationM) {
        // Open-Meteo geopotential heights are metres AMSL. Surface was previously stored as
        // 0 m, which made the hover altitude AGL and pulled every near-surface interpolation
        // down toward sea level. Prefer a hypsometric estimate from the lowest above-ground
        // isobar so it stays consistent with the sounding; fall back to grid elevation.
        const above = (levels || [])
            .filter((level) => (
                Number.isFinite(level.height)
                && Number.isFinite(level.pressure)
                && Number.isFinite(level.temperature)
                && level.pressure < surfacePressure - 0.5
            ))
            .slice()
            .sort((a, b) => b.pressure - a.pressure);
        const nearest = above[0];
        if (nearest && Number.isFinite(surfaceTempC)) {
            const tMeanK = ((surfaceTempC + nearest.temperature) / 2) + 273.15;
            const gasConstantDryAir = 287.05;
            const gravity = 9.80665;
            const heightM = nearest.height
                + ((gasConstantDryAir * tMeanK) / gravity)
                * Math.log(nearest.pressure / surfacePressure);
            if (
                Number.isFinite(heightM)
                && heightM > -400
                && heightM < 8000
                && (!Number.isFinite(elevationM) || Math.abs(heightM - elevationM) < 600)
            ) {
                return heightM;
            }
        }
        if (Number.isFinite(elevationM) && elevationM > -400 && elevationM < 8000) {
            return elevationM;
        }
        return null;
    }

    function buildHourlyVariableList() {
        const vars = [
            'temperature_2m',
            'dew_point_2m',
            'relative_humidity_2m',
            'surface_pressure',
            'wind_speed_10m',
            'wind_direction_10m',
        ];
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

    function buildProfileFromHourly(hourly, model, lat, lon, validTime, elevationM = null) {
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
            const surfaceHeightM = estimateSurfaceHeightAmslM(
                levels,
                surfacePressure,
                surfaceTemp,
                elevationM,
            );
            const aboveGround = levels.filter((level) => level.pressure < surfacePressure - 0.5);
            aboveGround.push({
                pressure: surfacePressure,
                temperature: surfaceTemp,
                dewpoint: Number.isFinite(surfaceDew) ? surfaceDew : null,
                height: surfaceHeightM,
                windSpeedKt: hourly.wind_speed_10m?.[hourIndex] ?? null,
                windDirDeg: hourly.wind_direction_10m?.[hourIndex] ?? null,
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
            elevationM: Number.isFinite(elevationM) ? elevationM : null,
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

        const entry = {
            hourly,
            model: payload.model || modelMeta.id,
            elevation: Number.isFinite(payload.elevation) ? payload.elevation : null,
        };
        rememberHourly(dayKey, entry.hourly, entry.model, entry.elevation);
        return entry;
    }

    async function fetchOpenMeteoProfile(lat, lon, validTime, modelId = selectedModelId) {
        const { hourly, model, elevation } = await fetchOpenMeteoHourly(lat, lon, validTime, modelId);
        return buildProfileFromHourly(hourly, model, lat, lon, validTime, elevation);
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
                altitudeText = `${altitudeFt.toLocaleString('en-US')} ft AMSL`;
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
        // Restore the base sounding / hodograph when the interactive overlay clears.
        if (
            lastProfile
            && panelOpen
            && (activeTool === 'sonde' || activeTool === 'hodograph')
            && canvasEl
            && staticLayerCanvas
        ) {
            const ctx = canvasEl.getContext('2d');
            restoreStaticLayer(ctx);
            const dpr = window.devicePixelRatio || 1;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
    }

    function updateHoverReadout(clientX, clientY) {
        if (activeTool === 'hodograph') {
            updateHodographHover(clientX, clientY);
            return;
        }
        if (activeTool !== 'sonde' || !canvasEl || !lastPlot || !lastProfile?.levels?.length) {
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

    function isInsideHodograph(x, y, layout = lastHodoLayout) {
        if (!layout) return false;
        return Math.hypot(x - layout.cx, y - layout.cy) <= layout.radius + 2;
    }

    function endPanInteraction() {
        if (panRaf) {
            cancelAnimationFrame(panRaf);
            panRaf = 0;
        }
        flushPendingPan();
        isPanning = false;
        panLastCss = null;
        panPointerId = null;
        canvasEl?.classList.remove('is-panning');
    }

    function bindHoverInteractions() {
        if (!canvasEl || canvasEl.dataset.hoverBound === '1') return;
        canvasEl.dataset.hoverBound = '1';

        canvasEl.addEventListener('wheel', (event) => {
            if (!panelOpen || !lastProfile) return;
            const { x, y } = pointerCssPosition(event);
            const factor = event.deltaY > 0 ? 1.06 : 1 / 1.06;
            if (activeTool === 'sonde' && lastPlot && isInsidePlot(x, y)) {
                event.preventDefault();
                // Scroll up zooms in; scroll down zooms out, but never beyond the default extents.
                zoomViewAt(x, y, factor);
                return;
            }
            if (activeTool === 'hodograph' && lastHodoLayout && isInsideHodograph(x, y)) {
                event.preventDefault();
                zoomHodographAt(x, y, factor);
            }
        }, { passive: false });

        canvasEl.addEventListener('pointerdown', (event) => {
            if (!panelOpen || !lastProfile) return;
            if (event.button != null && event.button !== 0) return;
            const pos = pointerCssPosition(event);
            const canPanSonde = activeTool === 'sonde' && lastPlot && isInsidePlot(pos.x, pos.y);
            const canPanHodo = activeTool === 'hodograph' && lastHodoLayout && isInsideHodograph(pos.x, pos.y);
            if (!canPanSonde && !canPanHodo) return;
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
            if (!panelOpen || !lastProfile) return;
            const { x, y } = pointerCssPosition(event);
            if (activeTool === 'sonde' && lastPlot && isInsidePlot(x, y)) {
                event.preventDefault();
                viewExtents = null;
                renderSkewT(lastProfile);
                return;
            }
            if (activeTool === 'hodograph' && lastHodoLayout && isInsideHodograph(x, y)) {
                event.preventDefault();
                hodoView = null;
                renderHodograph(lastProfile);
            }
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

    function pinMatchesLockedHodo(lat, lon, modelId = selectedModelId) {
        if (!lockedHodo) return false;
        return (
            Math.abs(lockedHodo.lat - lat) < 1e-4
            && Math.abs(lockedHodo.lon - lon) < 1e-4
            && lockedHodo.model === normalizeModelId(modelId)
        );
    }

    function maxWindSpeedFromHourly(hourly) {
        let max = 0;
        Object.entries(hourly || {}).forEach(([key, series]) => {
            if (!key.startsWith('wind_speed_') || !Array.isArray(series)) {
                return;
            }
            const match = key.match(/^wind_speed_(\d+)hPa$/);
            if (match && Number(match[1]) < HODO_MIN_PRESSURE_HPA) {
                return;
            }
            series.forEach((value) => {
                if (Number.isFinite(value) && value > max) {
                    max = value;
                }
            });
        });
        return max;
    }

    function hodoHalfFromMaxSpeed(maxObserved) {
        return Math.max(40, Math.ceil((maxObserved + 5) / 10) * 10);
    }

    function updateLockedHodoFromHourly(hourly, lat, lon, modelId = selectedModelId) {
        const model = normalizeModelId(modelId);
        const half = hodoHalfFromMaxSpeed(maxWindSpeedFromHourly(hourly));
        if (!pinMatchesLockedHodo(lat, lon, model)) {
            lockedHodo = { half, lat, lon, model };
            return lockedHodo;
        }
        lockedHodo = {
            half: Math.max(lockedHodo.half || 0, half),
            lat,
            lon,
            model,
        };
        return lockedHodo;
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
        hodoView = null;
        defaultHodoView = null;
    }

    function copyHodoView(view) {
        if (!view) return null;
        return {
            u0: view.u0,
            v0: view.v0,
            half: view.half,
        };
    }

    function clampHodoView(view, defaults) {
        if (!defaults) return copyHodoView(view);
        const defHalf = Math.max(defaults.half, 1e-6);
        const minHalf = defHalf / VIEW_MAX_ZOOM;
        let half = Number.isFinite(view?.half) ? view.half : defHalf;
        if (!(half > 0) || half > defHalf) {
            half = defHalf;
        } else if (half < minHalf) {
            half = minHalf;
        }
        let u0 = Number.isFinite(view?.u0) ? view.u0 : 0;
        let v0 = Number.isFinite(view?.v0) ? view.v0 : 0;
        // Keep the visible circle inside the original hodograph circle.
        const maxShift = Math.max(defHalf - half, 0);
        const shift = Math.hypot(u0, v0);
        if (shift > maxShift && shift > 1e-9) {
            const scale = maxShift / shift;
            u0 *= scale;
            v0 *= scale;
        } else if (maxShift === 0) {
            u0 = 0;
            v0 = 0;
        }
        return { u0, v0, half };
    }

    function hodoScreenToUv(x, y, layout) {
        const half = layout.half || layout.maxSpeed;
        return {
            u: layout.u0 + ((x - layout.cx) / layout.radius) * half,
            v: layout.v0 + ((layout.cy - y) / layout.radius) * half,
        };
    }

    function hodoUvToScreen(u, v, layout) {
        const half = layout.half || layout.maxSpeed;
        return {
            x: layout.cx + ((u - layout.u0) / half) * layout.radius,
            y: layout.cy - ((v - layout.v0) / half) * layout.radius,
        };
    }

    function zoomHodographAt(cssX, cssY, factor) {
        if (!lastHodoLayout || !defaultHodoView || !lastProfile) return;
        const current = clampHodoView(hodoView || defaultHodoView, defaultHodoView);
        const layout = { ...lastHodoLayout, ...current };
        const { u, v } = hodoScreenToUv(cssX, cssY, layout);
        const fracX = (cssX - layout.cx) / layout.radius;
        const fracY = (layout.cy - cssY) / layout.radius;
        const nextHalf = current.half * factor;
        hodoView = clampHodoView({
            u0: u - fracX * nextHalf,
            v0: v - fracY * nextHalf,
            half: nextHalf,
        }, defaultHodoView);
        renderHodograph(lastProfile, { preserveHover: false });
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

    function flushPendingPan() {
        const dx = pendingPanDx;
        const dy = pendingPanDy;
        pendingPanDx = 0;
        pendingPanDy = 0;
        if (!lastProfile || (dx === 0 && dy === 0)) return;
        if (activeTool === 'hodograph') {
            if (!lastHodoLayout || !defaultHodoView) return;
            const current = clampHodoView(hodoView || defaultHodoView, defaultHodoView);
            const ktPerPx = current.half / Math.max(lastHodoLayout.radius, 1e-6);
            hodoView = clampHodoView({
                u0: current.u0 - dx * ktPerPx,
                v0: current.v0 + dy * ktPerPx,
                half: current.half,
            }, defaultHodoView);
            renderHodograph(lastProfile, { preserveHover: false });
            return;
        }
        if (!lastPlot || !defaultViewExtents) return;
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
    }

    function panViewByPixels(dxCss, dyCss) {
        pendingPanDx += dxCss;
        pendingPanDy += dyCss;
        if (panRaf) return;
        panRaf = requestAnimationFrame(() => {
            panRaf = 0;
            flushPendingPan();
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

    function windComponentsKt(speedKt, dirDeg) {
        if (!Number.isFinite(speedKt) || speedKt < 0 || !Number.isFinite(dirDeg)) {
            return null;
        }
        const rad = (dirDeg * Math.PI) / 180;
        return {
            u: -speedKt * Math.sin(rad),
            v: -speedKt * Math.cos(rad),
        };
    }

    function profileWindPoints(profile) {
        return (profile?.levels || [])
            .map((level) => {
                const uv = windComponentsKt(level.windSpeedKt, level.windDirDeg);
                if (!uv || (Number.isFinite(level.pressure) && level.pressure < HODO_MIN_PRESSURE_HPA)) {
                    return null;
                }
                return { ...level, u: uv.u, v: uv.v };
            })
            .filter(Boolean)
            .sort((a, b) => b.pressure - a.pressure);
    }

    function formatMissing(value, digits = 0) {
        if (!Number.isFinite(value)) {
            return '—';
        }
        return value.toFixed(digits);
    }

    function formatWindDir(dirDeg) {
        if (!Number.isFinite(dirDeg) || dirDeg < 0 || dirDeg > 360) {
            return '—';
        }
        const rounded = Math.round(dirDeg) % 360;
        const display = rounded === 0 ? 360 : rounded;
        return String(display).padStart(3, '0');
    }

    function formatAltitudeFt(heightM) {
        if (!Number.isFinite(heightM)) {
            return '—';
        }
        const altitudeFt = Math.round(heightM * 3.28084);
        if (altitudeFt < -500 || altitudeFt > 80000) {
            return '—';
        }
        return altitudeFt.toLocaleString('en-US');
    }

    function pressureColor(pressure, pMin = HODO_MIN_PRESSURE_HPA, pMax = 1000) {
        const safeP = Math.min(Math.max(pressure, pMin), pMax);
        const t = (Math.log(safeP) - Math.log(pMin)) / (Math.log(pMax) - Math.log(pMin));
        const r = Math.round(29 + (214 - 29) * t);
        const g = Math.round(111 + (40 - 111) * t);
        const b = Math.round(216 + (40 - 216) * t);
        return `rgb(${r}, ${g}, ${b})`;
    }

    const KT_TO_MS = 0.514444;
    const BUNKERS_DEVIANT_MS = 7.5;
    const BUNKERS_DEVIANT_KT = BUNKERS_DEVIANT_MS / KT_TO_MS;
    const GRAVITY_MS2 = 9.80665;
    const HODO_AGL_LABELS = [
        { aglM: 1000, text: '1km' },
        { aglM: 3000, text: '3km' },
        { aglM: 6000, text: '6km' },
    ];
    const HODO_LABEL_SNAP_M = 200;

    function profileSurfaceHeightM(profile) {
        const surface = profile?.levels?.find((level) => level.isSurface);
        if (Number.isFinite(surface?.height)) {
            return surface.height;
        }
        return Number.isFinite(profile?.elevationM) ? profile.elevationM : null;
    }

    function levelAglM(level, surfaceHeightM) {
        if (level?.isSurface) {
            return 10;
        }
        if (!Number.isFinite(level?.height) || !Number.isFinite(surfaceHeightM)) {
            return null;
        }
        return level.height - surfaceHeightM;
    }

    function levelsWithAglUv(profile) {
        const surfaceHeightM = profileSurfaceHeightM(profile);
        return (profile?.levels || [])
            .map((level) => {
                const uv = windComponentsKt(level.windSpeedKt, level.windDirDeg);
                const aglM = levelAglM(level, surfaceHeightM);
                if (!uv || !Number.isFinite(aglM) || aglM < -80) {
                    return null;
                }
                return { ...level, u: uv.u, v: uv.v, aglM: Math.max(aglM, 0) };
            })
            .filter(Boolean)
            .sort((a, b) => a.aglM - b.aglM);
    }

    function interpolateUvAtAgl(levels, targetAgl) {
        if (!levels?.length || !Number.isFinite(targetAgl)) {
            return null;
        }
        const first = levels[0];
        const last = levels[levels.length - 1];
        if (targetAgl < first.aglM - 25) {
            return { u: first.u, v: first.v, aglM: first.aglM, incomplete: true };
        }
        if (targetAgl <= first.aglM) {
            return { u: first.u, v: first.v, aglM: first.aglM, incomplete: false };
        }
        if (targetAgl > last.aglM + 1) {
            return { u: last.u, v: last.v, aglM: last.aglM, incomplete: true };
        }
        for (let i = 0; i < levels.length - 1; i += 1) {
            const lower = levels[i];
            const upper = levels[i + 1];
            if (targetAgl < lower.aglM || targetAgl > upper.aglM) {
                continue;
            }
            const span = Math.max(upper.aglM - lower.aglM, 1e-6);
            const t = (targetAgl - lower.aglM) / span;
            return {
                u: lower.u + t * (upper.u - lower.u),
                v: lower.v + t * (upper.v - lower.v),
                aglM: targetAgl,
                incomplete: false,
            };
        }
        return { u: last.u, v: last.v, aglM: last.aglM, incomplete: true };
    }

    function windLayerPoints(levels, zBot, zTop) {
        const bottom = interpolateUvAtAgl(levels, zBot);
        const top = interpolateUvAtAgl(levels, zTop);
        if (!bottom || !top || bottom.incomplete || top.incomplete) {
            return null;
        }
        const points = [{ u: bottom.u, v: bottom.v, aglM: zBot }];
        levels.forEach((level) => {
            if (level.aglM > zBot + 0.5 && level.aglM < zTop - 0.5) {
                points.push({ u: level.u, v: level.v, aglM: level.aglM });
            }
        });
        points.push({ u: top.u, v: top.v, aglM: zTop });
        return points.sort((a, b) => a.aglM - b.aglM);
    }

    function meanWindLayerKt(levels, zBot, zTop) {
        const points = windLayerPoints(levels, zBot, zTop);
        if (!points || points.length < 2) {
            return null;
        }
        let uSum = 0;
        let vSum = 0;
        let dzSum = 0;
        for (let i = 0; i < points.length - 1; i += 1) {
            const dz = points[i + 1].aglM - points[i].aglM;
            if (dz <= 0) {
                continue;
            }
            uSum += 0.5 * (points[i].u + points[i + 1].u) * dz;
            vSum += 0.5 * (points[i].v + points[i + 1].v) * dz;
            dzSum += dz;
        }
        if (dzSum <= 0) {
            return null;
        }
        return { u: uSum / dzSum, v: vSum / dzSum };
    }

    function bulkShearKt(bottom, top) {
        if (!bottom || !top || bottom.incomplete || top.incomplete) {
            return null;
        }
        return Math.hypot(top.u - bottom.u, top.v - bottom.v);
    }

    function bunkersStormMotion(levels) {
        const surface = interpolateUvAtAgl(levels, 10);
        const vLow = interpolateUvAtAgl(levels, 500);
        const km6 = interpolateUvAtAgl(levels, 6000);
        const mean = meanWindLayerKt(levels, 10, 6000);
        const shearTail = (vLow && !vLow.incomplete) ? vLow : surface;
        if (!surface || !km6 || !mean || !shearTail || surface.incomplete || km6.incomplete) {
            return null;
        }
        const shearU = km6.u - shearTail.u;
        const shearV = km6.v - shearTail.v;
        const shearMag = Math.hypot(shearU, shearV);
        if (shearMag < 0.25) {
            return null;
        }
        // 90° to the right of the shear vector looking downshear.
        const deviateU = BUNKERS_DEVIANT_KT * (shearV / shearMag);
        const deviateV = BUNKERS_DEVIANT_KT * (-shearU / shearMag);
        return {
            rm: { u: mean.u + deviateU, v: mean.v + deviateV },
            lm: { u: mean.u - deviateU, v: mean.v - deviateV },
            mean,
            shear: { u: shearU, v: shearV },
            shearMag,
            deviate: { u: deviateU, v: deviateV },
            vLow: shearTail,
            v6: km6,
        };
    }

    function stormRelativeHelicity(levels, zBot, zTop, storm) {
        if (!storm || !Number.isFinite(storm.u) || !Number.isFinite(storm.v)) {
            return null;
        }
        const points = windLayerPoints(levels, zBot, zTop);
        if (!points || points.length < 2) {
            return null;
        }
        const cu = storm.u * KT_TO_MS;
        const cv = storm.v * KT_TO_MS;
        let srh = 0;
        for (let i = 0; i < points.length - 1; i += 1) {
            const u0 = points[i].u * KT_TO_MS;
            const v0 = points[i].v * KT_TO_MS;
            const u1 = points[i + 1].u * KT_TO_MS;
            const v1 = points[i + 1].v * KT_TO_MS;
            srh += (u0 - cu) * (v1 - v0) - (v0 - cv) * (u1 - u0);
        }
        return srh;
    }

    function criticalAngleDeg(levels, storm) {
        const v10 = interpolateUvAtAgl(levels, 10);
        const v500 = interpolateUvAtAgl(levels, 500);
        if (!v10 || !v500 || v10.incomplete || v500.incomplete || !storm) {
            return null;
        }
        const shearU = v500.u - v10.u;
        const shearV = v500.v - v10.v;
        const inflowU = v10.u - storm.u;
        const inflowV = v10.v - storm.v;
        const shearMag = Math.hypot(shearU, shearV);
        const inflowMag = Math.hypot(inflowU, inflowV);
        if (shearMag < 0.25 || inflowMag < 0.25) {
            return null;
        }
        const cos = Math.min(1, Math.max(-1, (shearU * inflowU + shearV * inflowV) / (shearMag * inflowMag)));
        return (Math.acos(cos) * 180) / Math.PI;
    }

    function favouredMoverId(srhRm03, srhLm03, srhRm01, srhLm01) {
        let right = srhRm03;
        let left = srhLm03;
        const weakLayer = !Number.isFinite(right) || !Number.isFinite(left)
            || (Math.abs(right) < 50 && Math.abs(left) < 50);
        if (weakLayer && Number.isFinite(srhRm01) && Number.isFinite(srhLm01)) {
            right = srhRm01;
            left = srhLm01;
        }
        if (!Number.isFinite(right) || !Number.isFinite(left)) {
            return null;
        }
        return Math.abs(right) >= Math.abs(left) ? 'RM' : 'LM';
    }

    function mixingRatioFromDewpoint(dewpointC, pressureHpa) {
        if (!Number.isFinite(dewpointC) || !Number.isFinite(pressureHpa) || pressureHpa <= 0) {
            return null;
        }
        return saturationMixingRatio(dewpointC, pressureHpa);
    }

    function virtualTempK(tempC, mixingRatio) {
        if (!Number.isFinite(tempC)) {
            return null;
        }
        const mixing = Number.isFinite(mixingRatio) && mixingRatio > 0 ? mixingRatio : 0;
        return (tempC + 273.15) * (1 + 0.61 * mixing);
    }

    function interpolateProfileAtPressure(levels, pressure, keys = ['height', 'temperature', 'dewpoint']) {
        const usable = (levels || []).filter((level) => Number.isFinite(level.pressure));
        if (!usable.length || !Number.isFinite(pressure)) {
            return null;
        }
        const sorted = [...usable].sort((a, b) => b.pressure - a.pressure);
        if (pressure >= sorted[0].pressure) {
            return Object.fromEntries(keys.map((key) => [key, sorted[0][key]]));
        }
        const last = sorted[sorted.length - 1];
        if (pressure <= last.pressure) {
            return Object.fromEntries(keys.map((key) => [key, last[key]]));
        }
        for (let i = 0; i < sorted.length - 1; i += 1) {
            const lower = sorted[i];
            const upper = sorted[i + 1];
            if (pressure > lower.pressure || pressure < upper.pressure) {
                continue;
            }
            const logLower = Math.log(lower.pressure);
            const logUpper = Math.log(upper.pressure);
            const t = (logLower - Math.log(pressure)) / Math.max(logLower - logUpper, 1e-9);
            const sample = {};
            keys.forEach((key) => {
                if (!Number.isFinite(lower[key]) || !Number.isFinite(upper[key])) {
                    sample[key] = null;
                    return;
                }
                sample[key] = lower[key] + t * (upper[key] - lower[key]);
            });
            return sample;
        }
        return null;
    }

    function interpolateScalarAtAgl(levels, targetAgl, key) {
        const surfaceHeightM = levels.find((level) => level.isSurface)?.height;
        const points = (levels || [])
            .map((level) => {
                const aglM = levelAglM(level, surfaceHeightM);
                if (!Number.isFinite(aglM) || !Number.isFinite(level[key])) {
                    return null;
                }
                return { aglM, value: level[key] };
            })
            .filter(Boolean)
            .sort((a, b) => a.aglM - b.aglM);
        if (points.length < 2 || !Number.isFinite(targetAgl)) {
            return null;
        }
        if (targetAgl <= points[0].aglM) {
            return points[0].value;
        }
        const last = points[points.length - 1];
        if (targetAgl >= last.aglM) {
            return last.value;
        }
        for (let i = 0; i < points.length - 1; i += 1) {
            const lower = points[i];
            const upper = points[i + 1];
            if (targetAgl < lower.aglM || targetAgl > upper.aglM) {
                continue;
            }
            const t = (targetAgl - lower.aglM) / Math.max(upper.aglM - lower.aglM, 1e-6);
            return lower.value + t * (upper.value - lower.value);
        }
        return null;
    }

    function lclTemperatureC(tempC, dewpointC) {
        if (!Number.isFinite(tempC) || !Number.isFinite(dewpointC)) {
            return null;
        }
        const vaporPressure = saturationVaporPressureHpa(dewpointC);
        if (!(vaporPressure > 0)) {
            return null;
        }
        const tlclK = 55 + 2840 / (3.5 * Math.log(tempC + 273.15) - Math.log(vaporPressure) - 4.805);
        return Number.isFinite(tlclK) ? tlclK - 273.15 : null;
    }

    function mixedLayerParcel(levels) {
        const surface = levels.find((level) => level.isSurface) || levels[0];
        if (!surface || !Number.isFinite(surface.pressure) || !Number.isFinite(surface.temperature)) {
            return null;
        }
        const layerTop = surface.pressure - 100;
        const layer = levels.filter((level) => (
            Number.isFinite(level.pressure)
            && level.pressure <= surface.pressure + 0.2
            && level.pressure >= layerTop
        ));
        let thetaSum = 0;
        let mixingSum = 0;
        let count = 0;
        layer.forEach((level) => {
            if (!Number.isFinite(level.temperature) || !Number.isFinite(level.dewpoint)) {
                return;
            }
            const mixing = mixingRatioFromDewpoint(level.dewpoint, level.pressure);
            if (!Number.isFinite(mixing)) {
                return;
            }
            thetaSum += potentialTempC(level.temperature, level.pressure);
            mixingSum += mixing;
            count += 1;
        });
        if (count >= 2) {
            const mixingRatio = mixingSum / count;
            const temperature = dryAdiabatTempC(thetaSum / count, surface.pressure);
            return {
                pressure: surface.pressure,
                temperature,
                dewpoint: dewpointFromMixingRatio(mixingRatio, surface.pressure),
                mixingRatio,
            };
        }
        const mixingRatio = mixingRatioFromDewpoint(surface.dewpoint, surface.pressure);
        if (!Number.isFinite(mixingRatio)) {
            return null;
        }
        return {
            pressure: surface.pressure,
            temperature: surface.temperature,
            dewpoint: surface.dewpoint,
            mixingRatio,
        };
    }

    function tempOnMoistPath(moistPoints, pressure) {
        const usable = (moistPoints || []).filter((point) => (
            Number.isFinite(point.pressure) && Number.isFinite(point.temperature)
        ));
        if (!usable.length || !Number.isFinite(pressure)) {
            return null;
        }
        if (pressure >= usable[0].pressure) {
            return usable[0].temperature;
        }
        const last = usable[usable.length - 1];
        if (pressure <= last.pressure) {
            return last.temperature;
        }
        for (let i = 0; i < usable.length - 1; i += 1) {
            const a = usable[i];
            const b = usable[i + 1];
            const lo = Math.min(a.pressure, b.pressure);
            const hi = Math.max(a.pressure, b.pressure);
            if (pressure < lo || pressure > hi) {
                continue;
            }
            const t = (Math.log(a.pressure) - Math.log(pressure))
                / Math.max(Math.log(a.pressure) - Math.log(b.pressure), 1e-9);
            return a.temperature + t * (b.temperature - a.temperature);
        }
        return null;
    }

    function computeParcelCapeAndLcl(profile) {
        const levels = (profile?.levels || [])
            .filter((level) => Number.isFinite(level.pressure) && Number.isFinite(level.temperature))
            .sort((a, b) => b.pressure - a.pressure);
        if (levels.length < 4) {
            return { cape: null, lclAglM: null };
        }
        const parcel = mixedLayerParcel(levels);
        if (!parcel || !Number.isFinite(parcel.temperature) || !Number.isFinite(parcel.dewpoint)) {
            return { cape: null, lclAglM: null };
        }
        const lclC = lclTemperatureC(parcel.temperature, parcel.dewpoint);
        if (!Number.isFinite(lclC)) {
            return { cape: null, lclAglM: null };
        }
        const lclP = parcel.pressure * Math.pow((lclC + 273.15) / (parcel.temperature + 273.15), 1 / KAPPA);
        const surfaceHeightM = profileSurfaceHeightM(profile);
        const lclSample = interpolateProfileAtPressure(levels, lclP, ['height']);
        const lclAglM = Number.isFinite(lclSample?.height) && Number.isFinite(surfaceHeightM)
            ? Math.max(0, lclSample.height - surfaceHeightM)
            : null;
        const pTop = levels[levels.length - 1].pressure;
        const dryTheta = potentialTempC(parcel.temperature, parcel.pressure);
        const moistPoints = integrateMoistAdiabat(lclC, Math.min(lclP, parcel.pressure), pTop, 5);

        let cape = 0;
        let seenPositive = false;
        let ended = false;
        let prevP = null;
        let prevDiff = null;
        for (let pressure = parcel.pressure; pressure >= pTop + 0.4 && !ended; pressure -= 5) {
            const parcelTemp = pressure >= lclP
                ? dryAdiabatTempC(dryTheta, pressure)
                : tempOnMoistPath(moistPoints, pressure);
            const env = interpolateProfileAtPressure(levels, pressure, ['temperature', 'dewpoint']);
            if (!Number.isFinite(parcelTemp) || !env || !Number.isFinite(env.temperature)) {
                continue;
            }
            const parcelMix = pressure > lclP
                ? parcel.mixingRatio
                : saturationMixingRatio(parcelTemp, pressure);
            const envMix = mixingRatioFromDewpoint(env.dewpoint, pressure);
            const tvParcel = virtualTempK(parcelTemp, parcelMix);
            const tvEnv = virtualTempK(env.temperature, envMix);
            if (!Number.isFinite(tvParcel) || !Number.isFinite(tvEnv)) {
                continue;
            }
            const diff = tvParcel - tvEnv;
            if (prevP != null && prevDiff != null && pressure < lclP) {
                const dlnp = Math.log(prevP / pressure);
                const avgDiff = 0.5 * (diff + prevDiff);
                if (avgDiff > 0) {
                    seenPositive = true;
                    cape += RD * avgDiff * dlnp;
                } else if (seenPositive) {
                    ended = true;
                }
            }
            prevP = pressure;
            prevDiff = diff;
        }
        if (!Number.isFinite(cape) || cape < 0) {
            cape = 0;
        }
        return { cape, lclAglM };
    }

    function precipitableWaterMm(profile) {
        const levels = (profile?.levels || [])
            .filter((level) => Number.isFinite(level.pressure) && Number.isFinite(level.dewpoint))
            .sort((a, b) => b.pressure - a.pressure);
        if (levels.length < 2) {
            return null;
        }
        let precipitable = 0;
        for (let i = 0; i < levels.length - 1; i += 1) {
            const w0 = mixingRatioFromDewpoint(levels[i].dewpoint, levels[i].pressure);
            const w1 = mixingRatioFromDewpoint(levels[i + 1].dewpoint, levels[i + 1].pressure);
            if (!Number.isFinite(w0) || !Number.isFinite(w1)) {
                continue;
            }
            const dpPa = (levels[i].pressure - levels[i + 1].pressure) * 100;
            if (dpPa <= 0) {
                continue;
            }
            precipitable += 0.5 * (w0 + w1) * dpPa / GRAVITY_MS2;
        }
        return Number.isFinite(precipitable) ? precipitable : null;
    }

    function wetBulbC(tempC, dewpointC) {
        if (!Number.isFinite(tempC) || !Number.isFinite(dewpointC)) {
            return null;
        }
        const esT = saturationVaporPressureHpa(tempC);
        const esTd = saturationVaporPressureHpa(dewpointC);
        if (!(esT > 0)) {
            return null;
        }
        const rh = Math.min(100, Math.max(0, 100 * esTd / esT));
        return tempC * Math.atan(0.151977 * Math.sqrt(rh + 8.313659))
            + Math.atan(tempC + rh)
            - Math.atan(rh - 1.676331)
            + 0.00391838 * (rh ** 1.5) * Math.atan(0.023101 * rh)
            - 4.686035;
    }

    function heightWhenCrossingC(profile, targetC, useWetBulb) {
        const surfaceHeightM = profileSurfaceHeightM(profile);
        const points = (profile?.levels || [])
            .map((level) => {
                if (!Number.isFinite(level.height) || !Number.isFinite(level.temperature)) {
                    return null;
                }
                const value = useWetBulb ? wetBulbC(level.temperature, level.dewpoint) : level.temperature;
                if (!Number.isFinite(value)) {
                    return null;
                }
                return { height: level.height, value };
            })
            .filter(Boolean)
            .sort((a, b) => a.height - b.height);
        for (let i = 0; i < points.length - 1; i += 1) {
            const lower = points[i];
            const upper = points[i + 1];
            if ((lower.value - targetC) * (upper.value - targetC) > 0) {
                continue;
            }
            const span = upper.value - lower.value;
            const t = Math.abs(span) < 1e-6 ? 0 : (targetC - lower.value) / span;
            const height = lower.height + t * (upper.height - lower.height);
            return Number.isFinite(surfaceHeightM) ? height - surfaceHeightM : height;
        }
        return null;
    }

    function lowLevelLapseKPerKm(profile) {
        const surface = profile?.levels?.find((level) => level.isSurface);
        const t3 = interpolateScalarAtAgl(profile?.levels || [], 3000, 'temperature');
        if (!Number.isFinite(surface?.temperature) || !Number.isFinite(t3)) {
            return null;
        }
        return (surface.temperature - t3) / 3;
    }

    function midLevelIsDry(profile) {
        const mid = (profile?.levels || []).filter((level) => (
            Number.isFinite(level.pressure)
            && level.pressure <= 700
            && level.pressure >= 500
            && Number.isFinite(level.temperature)
            && Number.isFinite(level.dewpoint)
        ));
        if (!mid.length) {
            return false;
        }
        const depression = mid.reduce((sum, level) => sum + (level.temperature - level.dewpoint), 0) / mid.length;
        return depression >= 12;
    }

    function deepLayerIsMoist(profile) {
        const layer = (profile?.levels || []).filter((level) => (
            Number.isFinite(level.pressure)
            && level.pressure >= 400
            && Number.isFinite(level.temperature)
            && Number.isFinite(level.dewpoint)
        ));
        if (!layer.length) {
            return false;
        }
        let rhSum = 0;
        let count = 0;
        layer.forEach((level) => {
            const esT = saturationVaporPressureHpa(level.temperature);
            const esTd = saturationVaporPressureHpa(level.dewpoint);
            if (!(esT > 0)) {
                return;
            }
            rhSum += Math.min(100, Math.max(0, 100 * esTd / esT));
            count += 1;
        });
        return count > 0 && (rhSum / count) >= 70;
    }

    function computeDcape(profile) {
        const levels = (profile?.levels || [])
            .filter((level) => Number.isFinite(level.pressure) && Number.isFinite(level.temperature))
            .sort((a, b) => b.pressure - a.pressure);
        const surface = levels.find((level) => level.isSurface) || levels[0];
        if (!surface || levels.length < 4) {
            return null;
        }
        const mid = levels.filter((level) => (
            level.pressure <= 700
            && level.pressure >= 500
            && Number.isFinite(level.dewpoint)
        ));
        if (!mid.length) {
            return null;
        }
        const source = mid.reduce((driest, level) => {
            const depression = level.temperature - level.dewpoint;
            if (!driest || depression > driest.depression) {
                return { ...level, depression };
            }
            return driest;
        }, null);
        const startTw = wetBulbC(source.temperature, source.dewpoint);
        if (!Number.isFinite(startTw)) {
            return null;
        }
        const moistDown = integrateMoistAdiabat(startTw, source.pressure, surface.pressure, 5);
        let dcape = 0;
        let prevP = null;
        let prevDiff = null;
        for (let pressure = source.pressure; pressure <= surface.pressure + 0.4; pressure += 5) {
            const parcelTemp = tempOnMoistPath(moistDown, Math.min(pressure, surface.pressure));
            const env = interpolateProfileAtPressure(levels, Math.min(pressure, surface.pressure), ['temperature', 'dewpoint']);
            if (!Number.isFinite(parcelTemp) || !env || !Number.isFinite(env.temperature)) {
                continue;
            }
            const tvParcel = virtualTempK(parcelTemp, saturationMixingRatio(parcelTemp, pressure));
            const tvEnv = virtualTempK(env.temperature, mixingRatioFromDewpoint(env.dewpoint, pressure));
            if (!Number.isFinite(tvParcel) || !Number.isFinite(tvEnv)) {
                continue;
            }
            const diff = tvEnv - tvParcel;
            if (prevP != null && prevDiff != null) {
                const dlnp = Math.log(pressure / prevP);
                const avgDiff = 0.5 * (diff + prevDiff);
                if (avgDiff > 0 && dlnp > 0) {
                    dcape += RD * avgDiff * dlnp;
                }
            }
            prevP = pressure;
            prevDiff = diff;
        }
        return Number.isFinite(dcape) && dcape > 0 ? dcape : 0;
    }

    function meanWindPressureLayerKt(profile, pBottom, pTop) {
        const points = (profile?.levels || [])
            .map((level) => {
                const uv = windComponentsKt(level.windSpeedKt, level.windDirDeg);
                if (!uv || !Number.isFinite(level.pressure)) {
                    return null;
                }
                return { pressure: level.pressure, u: uv.u, v: uv.v };
            })
            .filter((point) => point && point.pressure <= pBottom + 1 && point.pressure >= pTop - 1)
            .sort((a, b) => b.pressure - a.pressure);
        if (!points.length) {
            return null;
        }
        if (points.length === 1) {
            return Math.hypot(points[0].u, points[0].v);
        }
        let uSum = 0;
        let vSum = 0;
        let dpSum = 0;
        for (let i = 0; i < points.length - 1; i += 1) {
            const dp = points[i].pressure - points[i + 1].pressure;
            if (dp <= 0) {
                continue;
            }
            uSum += 0.5 * (points[i].u + points[i + 1].u) * dp;
            vSum += 0.5 * (points[i].v + points[i + 1].v) * dp;
            dpSum += dp;
        }
        if (dpSum <= 0) {
            return null;
        }
        return Math.hypot(uSum / dpSum, vSum / dpSum);
    }

    function surfaceTo850DewpointC(profile) {
        const levels = profile?.levels || [];
        const surface = levels.find((level) => level.isSurface);
        const h850 = interpolateProfileAtPressure(levels, 850, ['dewpoint']);
        const values = [surface?.dewpoint, h850?.dewpoint].filter(Number.isFinite);
        if (!values.length) {
            return null;
        }
        return values.reduce((sum, value) => sum + value, 0) / values.length;
    }

    function computeHodographDiagnostics(profile) {
        const windLevels = levelsWithAglUv(profile);
        const v10 = interpolateUvAtAgl(windLevels, 10);
        const v1 = interpolateUvAtAgl(windLevels, 1000);
        const v6 = interpolateUvAtAgl(windLevels, 6000);
        const bunkers = bunkersStormMotion(windLevels);
        const srhRm01 = bunkers ? stormRelativeHelicity(windLevels, 10, 1000, bunkers.rm) : null;
        const srhLm01 = bunkers ? stormRelativeHelicity(windLevels, 10, 1000, bunkers.lm) : null;
        const srhRm03 = bunkers ? stormRelativeHelicity(windLevels, 10, 3000, bunkers.rm) : null;
        const srhLm03 = bunkers ? stormRelativeHelicity(windLevels, 10, 3000, bunkers.lm) : null;
        const favoured = favouredMoverId(srhRm03, srhLm03, srhRm01, srhLm01);
        const favouredMotion = favoured === 'LM' ? bunkers?.lm : bunkers?.rm;
        const thermo = computeParcelCapeAndLcl(profile);
        const pwMm = precipitableWaterMm(profile);
        const wbzAglM = heightWhenCrossingC(profile, 0, true);
        const frzAglM = heightWhenCrossingC(profile, 0, false);
        const surfaceHeightM = profileSurfaceHeightM(profile);
        const frzAmslM = Number.isFinite(frzAglM) && Number.isFinite(surfaceHeightM)
            ? frzAglM + surfaceHeightM
            : frzAglM;
        const lapse03 = lowLevelLapseKPerKm(profile);
        const midDry = midLevelIsDry(profile);
        const deepMoist = deepLayerIsMoist(profile);
        const dcape = computeDcape(profile);
        const wind900to500 = meanWindPressureLayerKt(profile, 900, 500);
        const sfc850Td = surfaceTo850DewpointC(profile);
        const shear01 = bulkShearKt(v10, v1);
        const shear06 = bulkShearKt(v10, v6);
        const mean06 = bunkers?.mean ? Math.hypot(bunkers.mean.u, bunkers.mean.v) : null;
        const stormMotionKt = favouredMotion
            ? Math.hypot(favouredMotion.u, favouredMotion.v)
            : mean06;
        const kinematics = {
            windLevels,
            bunkers,
            shear01,
            shear06,
            mean06,
            srhRm01,
            srhLm01,
            srhRm03,
            srhLm03,
            favoured,
            criticalAngle: criticalAngleDeg(windLevels, favouredMotion),
        };
        return {
            ...kinematics,
            cape: thermo.cape,
            lclAglM: thermo.lclAglM,
            pwMm,
            wbzAglM,
            frzAglM,
            lapse03,
            midDry,
            deepMoist,
            stormMode: convectiveStormMode(kinematics),
            stormMovement: stormMovementFlags(kinematics),
            severe: severeWeatherFlags(kinematics, {
                cape: thermo.cape,
                lclAglM: thermo.lclAglM,
                pwMm,
                wbzAglM,
                frzAglM,
                frzAmslM,
                midDry,
                deepMoist,
                dcape,
                wind900to500,
                sfc850Td,
                stormMotionKt,
            }),
        };
    }

    function flagValue(isLikely) {
        return isLikely ? 'likely' : 'not favoured';
    }

    function peakAbsSrh03(k) {
        const rm03 = Number.isFinite(k.srhRm03) ? Math.abs(k.srhRm03) : 0;
        const lm03 = Number.isFinite(k.srhLm03) ? Math.abs(k.srhLm03) : 0;
        return Math.max(rm03, lm03);
    }

    function convectiveStormMode(k) {
        if (!Number.isFinite(k.shear06) || !k.bunkers) {
            return '—';
        }
        const peakSrh = peakAbsSrh03(k);
        if (k.shear06 >= 35 && peakSrh >= 75) {
            return 'Supercell';
        }
        if (k.shear06 < 20) {
            return 'Single cell';
        }
        if (k.shear06 >= 25 && peakSrh < 75) {
            return 'Multicell (squall)';
        }
        return 'Multicell (cluster)';
    }

    function stormMovementFlags(k) {
        if (!Number.isFinite(k.shear06) || !k.bunkers) {
            return {
                rightMovers: '—',
                leftMovers: '—',
                splitting: '—',
                anomPropUnlikely: '—',
            };
        }
        const rm03 = Math.abs(k.srhRm03);
        const lm03 = Math.abs(k.srhLm03);
        const supercellShear = k.shear06 >= 35;
        const bothUseful = rm03 >= 100 && lm03 >= 100;
        const similarSrh = bothUseful && (Math.min(rm03, lm03) / Math.max(rm03, lm03) >= 0.5);
        const splitting = k.shear06 >= 40 && bothUseful && (similarSrh || k.shear06 >= 50);
        return {
            rightMovers: flagValue(supercellShear && (k.favoured === 'RM' || splitting)),
            leftMovers: flagValue(supercellShear && (k.favoured === 'LM' || splitting)),
            splitting: flagValue(splitting),
            anomPropUnlikely: flagValue(k.shear06 < 30 || (rm03 < 75 && lm03 < 75)),
        };
    }

    function severeWeatherFlags(k, th) {
        if (!Number.isFinite(th.cape)) {
            return {
                tornadoes: '—',
                hail20: '—',
                hail50: '—',
                gust48: '—',
                gust67: '—',
                rain: '—',
            };
        }
        const favouredSrh01 = k.favoured === 'LM' ? k.srhLm01 : k.srhRm01;
        const wbz = Number.isFinite(th.wbzAglM) ? th.wbzAglM : th.frzAglM;
        const frzFt = Number.isFinite(th.frzAmslM)
            ? th.frzAmslM * 3.28084
            : (Number.isFinite(th.frzAglM) ? th.frzAglM * 3.28084 : null);
        const warmCloudM = Number.isFinite(th.frzAglM) && Number.isFinite(th.lclAglM)
            ? th.frzAglM - th.lclAglM
            : null;
        const mcsOrSupercell = Number.isFinite(k.shear06) && k.shear06 >= 25;
        const supercellShear = Number.isFinite(k.shear06) && k.shear06 >= 35;
        const highBuoyancy = th.cape >= 1000;
        const veryHighBuoyancy = th.cape >= 2000;
        const evaporative = (Number.isFinite(th.lclAglM) && th.lclAglM >= 1500 && th.midDry)
            || (Number.isFinite(th.dcape) && th.dcape >= 1000);
        const strongEvaporative = Number.isFinite(th.dcape) && th.dcape >= 1500 && th.midDry;
        const strongMomentum = (Number.isFinite(th.stormMotionKt) && th.stormMotionKt >= 50)
            || (Number.isFinite(k.mean06) && k.mean06 >= 50)
            || (Number.isFinite(th.wind900to500) && th.wind900to500 >= 50);
        const tornadoes = highBuoyancy
            && supercellShear
            && Number.isFinite(th.lclAglM) && th.lclAglM <= 1000
            && Number.isFinite(k.shear01) && k.shear01 >= 25
            && Number.isFinite(favouredSrh01) && Math.abs(favouredSrh01) >= 100
            && Number.isFinite(k.criticalAngle) && k.criticalAngle >= 60 && k.criticalAngle <= 120;
        const hail20 = highBuoyancy
            && mcsOrSupercell
            && Number.isFinite(frzFt) && frzFt <= 14000
            && Number.isFinite(wbz) && wbz >= 1500 && wbz <= 3600;
        const hail50 = veryHighBuoyancy
            && supercellShear
            && Number.isFinite(frzFt) && frzFt <= 11500
            && Number.isFinite(wbz) && wbz >= 2100 && wbz <= 2800;
        const gust48 = highBuoyancy && mcsOrSupercell && evaporative && strongMomentum;
        const gust67 = veryHighBuoyancy && supercellShear && strongEvaporative && strongMomentum;
        const rain = highBuoyancy
            && Number.isFinite(th.lclAglM) && th.lclAglM <= 1000
            && ((Number.isFinite(th.pwMm) && th.pwMm >= 40) || th.deepMoist)
            && Number.isFinite(warmCloudM) && warmCloudM >= 3000
            && Number.isFinite(th.stormMotionKt) && th.stormMotionKt <= 15
            && Number.isFinite(th.sfc850Td) && th.sfc850Td >= 14;
        return {
            tornadoes: flagValue(tornadoes),
            hail20: flagValue(hail20),
            hail50: flagValue(hail50),
            gust48: flagValue(gust48),
            gust67: flagValue(gust67),
            rain: flagValue(rain),
        };
    }

    function hodographAglLabels(profile) {
        const levels = levelsWithAglUv(profile);
        const labels = [];
        const surface = levels.find((level) => level.isSurface) || levels[0];
        if (surface) {
            labels.push({ u: surface.u, v: surface.v, text: 'SFC', isSurface: true });
        }
        HODO_AGL_LABELS.forEach(({ aglM, text }) => {
            const native = levels
                .filter((level) => !level.isSurface)
                .sort((a, b) => Math.abs(a.aglM - aglM) - Math.abs(b.aglM - aglM))[0];
            if (native && Math.abs(native.aglM - aglM) <= HODO_LABEL_SNAP_M) {
                labels.push({ u: native.u, v: native.v, text, interpolated: false });
                return;
            }
            const interpolated = interpolateUvAtAgl(levels, aglM);
            if (interpolated && !interpolated.incomplete) {
                labels.push({ u: interpolated.u, v: interpolated.v, text, interpolated: true });
            }
        });
        return labels;
    }

    function formatWindDddSs(u, v) {
        if (!Number.isFinite(u) || !Number.isFinite(v)) {
            return '—';
        }
        const speed = Math.hypot(u, v);
        if (speed < 0.5) {
            return '000° 0 kts';
        }
        const dir = ((Math.atan2(-u, -v) * 180) / Math.PI + 360) % 360;
        return `${formatWindDir(dir)}° ${Math.round(speed)} kts`;
    }

    function formatSrh(value) {
        if (!Number.isFinite(value)) {
            return '—';
        }
        return String(Math.round(value));
    }

    function formatShearKt(value) {
        if (!Number.isFinite(value)) {
            return '—';
        }
        return `${Math.round(value)} kts`;
    }

    function formatAngleDeg(value) {
        if (!Number.isFinite(value)) {
            return '—';
        }
        return `${Math.round(value)}°`;
    }

    function renderIndexItems(items) {
        return items.map(({ label, value }) => (
            `<div><dt>${label}</dt><dd>${value}</dd></div>`
        )).join('');
    }

    function hodographIndexRows(diag) {
        return [
            { label: 'Shear 0–1km', value: formatShearKt(diag?.shear01) },
            { label: 'Shear 0–6km', value: formatShearKt(diag?.shear06) },
            { label: 'Bunkers L', value: formatWindDddSs(diag?.bunkers?.lm?.u, diag?.bunkers?.lm?.v) },
            { label: 'Bunkers R', value: formatWindDddSs(diag?.bunkers?.rm?.u, diag?.bunkers?.rm?.v) },
            { label: 'RM SRH 0–1km', value: Number.isFinite(diag?.srhRm01) ? `${formatSrh(diag.srhRm01)} m²/s²` : '—' },
            { label: 'LM SRH 0–1km', value: Number.isFinite(diag?.srhLm01) ? `${formatSrh(diag.srhLm01)} m²/s²` : '—' },
            { label: 'RM SRH 0–3km', value: Number.isFinite(diag?.srhRm03) ? `${formatSrh(diag.srhRm03)} m²/s²` : '—' },
            { label: 'LM SRH 0–3km', value: Number.isFinite(diag?.srhLm03) ? `${formatSrh(diag.srhLm03)} m²/s²` : '—' },
            { label: 'Crit. angle', value: formatAngleDeg(diag?.criticalAngle) },
        ];
    }

    function selectedStormMovementLabel(flags) {
        if (!flags || flags.splitting === '—') {
            return '—';
        }
        if (flags.splitting === 'likely') {
            return 'Splitting supercells favoured';
        }
        if (flags.leftMovers === 'likely') {
            return 'Left movers favoured';
        }
        if (flags.rightMovers === 'likely') {
            return 'Right movers favoured';
        }
        return 'Anomalous propagation unlikely';
    }

    function applicableSevereLabels(severe) {
        if (!severe || severe.tornadoes === '—') {
            return [];
        }
        return [
            ['tornadoes', 'Tornadoes'],
            ['hail20', 'Large hail (20 mm)'],
            ['hail50', 'Giant hail (50 mm)'],
            ['gust48', 'Damaging gusts (>48 kt)'],
            ['gust67', 'Destructive gusts (>67 kt)'],
            ['rain', 'Heavy rain'],
        ].filter(([key]) => severe[key] === 'likely').map(([, label]) => label);
    }

    function renderHodographReadout(diag) {
        if (!indicesEl || !stormModeEl || !stormMovementEl || !severeEl) {
            return;
        }
        // Always keep the index rows so the panel does not grow when data arrives.
        indicesEl.innerHTML = renderIndexItems(hodographIndexRows(diag));
        if (!diag) {
            stormModeEl.textContent = '';
            stormMovementEl.textContent = '';
            severeEl.innerHTML = '';
            return;
        }
        stormModeEl.textContent = diag.stormMode || '—';
        stormMovementEl.textContent = selectedStormMovementLabel(diag.stormMovement);
        const severeItems = applicableSevereLabels(diag.severe);
        if (diag.severe?.tornadoes === '—') {
            severeEl.innerHTML = '<li class="hodograph-flag-single is-missing">—</li>';
        } else if (!severeItems.length) {
            severeEl.innerHTML = '<li class="hodograph-flag-single is-not-favoured">None favoured</li>';
        } else {
            severeEl.innerHTML = severeItems
                .map((label) => `<li class="hodograph-flag-single is-likely">${label}</li>`)
                .join('');
        }
    }

    const BUNKERS_COLORS = {
        steering: '#d62828',
        shear: '#2a9d4a',
        propagation: '#1d4ed8',
        rm: '#0d7377',
        lm: '#c05621',
        final: '#5b21b6',
    };

    function drawHodoArrow(ctx, layout, fromU, fromV, toU, toV, color, width = 1.6) {
        const from = hodoUvToScreen(fromU, fromV, layout);
        const to = hodoUvToScreen(toU, toV, layout);
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const length = Math.hypot(dx, dy);
        if (length < 5) {
            return;
        }
        const ux = dx / length;
        const uy = dy / length;
        const head = Math.min(9, length * 0.3);
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x - ux * head * 0.4, to.y - uy * head * 0.4);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(to.x, to.y);
        ctx.lineTo(to.x - ux * head - uy * head * 0.42, to.y - uy * head + ux * head * 0.42);
        ctx.lineTo(to.x - ux * head + uy * head * 0.42, to.y - uy * head - ux * head * 0.42);
        ctx.closePath();
        ctx.fill();
    }

    function drawBunkersRightAngle(ctx, layout, bunkers) {
        const { mean, shear, deviate } = bunkers;
        if (!mean || !shear || !deviate) {
            return;
        }
        const origin = hodoUvToScreen(mean.u, mean.v, layout);
        const shearEnd = hodoUvToScreen(mean.u + shear.u, mean.v + shear.v, layout);
        const devEnd = hodoUvToScreen(mean.u + deviate.u, mean.v + deviate.v, layout);
        let sx = shearEnd.x - origin.x;
        let sy = shearEnd.y - origin.y;
        let dx = devEnd.x - origin.x;
        let dy = devEnd.y - origin.y;
        const shearLen = Math.hypot(sx, sy);
        const devLen = Math.hypot(dx, dy);
        if (shearLen < 4 || devLen < 4) {
            return;
        }
        const size = 8;
        sx = (sx / shearLen) * size;
        sy = (sy / shearLen) * size;
        dx = (dx / devLen) * size;
        dy = (dy / devLen) * size;
        ctx.strokeStyle = BUNKERS_COLORS.propagation;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(origin.x + sx, origin.y + sy);
        ctx.lineTo(origin.x + sx + dx, origin.y + sy + dy);
        ctx.lineTo(origin.x + dx, origin.y + dy);
        ctx.stroke();
    }

    function bindBunkersLegend() {
        if (!bunkersLegendEl || bunkersLegendEl.dataset.bound === '1') {
            return;
        }
        bunkersLegendEl.dataset.bound = '1';
        bunkersLegendEl.addEventListener('click', (event) => {
            const button = event.target.closest('[data-bunkers-layer]');
            if (!button) {
                return;
            }
            const layer = button.dataset.bunkersLayer;
            if (!Object.prototype.hasOwnProperty.call(bunkersOverlay, layer)) {
                return;
            }
            bunkersOverlay[layer] = !bunkersOverlay[layer];
            syncBunkersLegendUi();
            if (lastProfile && activeTool === 'hodograph') {
                renderHodograph(lastProfile, { preserveHover: true });
            }
        });
        syncBunkersLegendUi();
    }

    function syncBunkersLegendUi() {
        bunkersLegendEl?.querySelectorAll('[data-bunkers-layer]').forEach((button) => {
            const layer = button.dataset.bunkersLayer;
            const on = Boolean(bunkersOverlay[layer]);
            button.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
    }

    const HODO_HELP = {
        indices: {
            title: 'Indices',
            columns: ['Index', 'Definition', 'Utility'],
            rows: [
                ['Shear', 'Magnitude of vector difference between top and bottom layer', 'Larger values indicate potential for storm organisation'],
                ['Bunkers L / R', '0–6 km mean wind ± 7.5 m/s 90° right of 0.5–6 km shear', 'Estimation of supercell motion'],
                ['SRH', 'Streamwise helicity of the 0–1 km or 0–3 km layer relative to Bunkers R or L storm motion (m²/s²)', 'Larger absolute values indicate potential for a rotating updraft'],
                ['Crit. angle', 'Angle between 0–500 m shear and 10 m storm-relative inflow', 'Values close to 90° indicate favourable conditions for tornadic supercells'],
            ],
        },
        mode: {
            title: 'Storm mode',
            note: 'Peak |SRH 0–3 km| = max(|RM SRH 0–3 km|, |LM SRH 0–3 km|). CAPE is not used. First matching row wins.',
            columns: ['Mode', 'Criteria'],
            rows: [
                ['Supercell', '0–6 km shear ≥ 35 kt AND peak |SRH 0–3 km| ≥ 75 m²/s²'],
                ['Single cell', '0–6 km shear &lt; 20 kt'],
                ['Multicell (squall)', '0–6 km shear ≥ 25 kt AND peak |SRH 0–3 km| &lt; 75 m²/s²'],
                ['Multicell (cluster)', 'Otherwise'],
            ],
        },
        movement: {
            title: 'Storm movement',
            note: 'The displayed label uses the first matching row from top to bottom after the favoured-mover test.',
            columns: ['Classification', 'Criteria'],
            rows: [
                ['Favoured mover', 'Larger |SRH 0–3 km|; if both |SRH 0–3 km| &lt; 50 m²/s², use 0–1 km'],
                ['Splitting supercells favoured', '0–6 km shear ≥ 40 kt AND |RM SRH 0–3 km| ≥ 100 m²/s² AND |LM SRH 0–3 km| ≥ 100 m²/s² AND (min/max SRH ≥ 0.5 OR 0–6 km shear ≥ 50 kt)'],
                ['Right movers favoured', '0–6 km shear ≥ 35 kt AND (favoured mover is RM OR splitting)'],
                ['Left movers favoured', '0–6 km shear ≥ 35 kt AND (favoured mover is LM OR splitting)'],
                ['Anomalous propagation unlikely', '0–6 km shear &lt; 30 kt OR both |SRH 0–3 km| &lt; 75 m²/s²; also shown when left, right, and split are not favoured'],
            ],
        },
        severe: {
            title: 'Severe phenomena',
            note: 'A hazard is listed only when every row for that hazard is true. Mid-level dry means mean T−Td from 700–500 hPa ≥ 12 °C. Deep moist means mean RH from the surface to 400 hPa ≥ 70%.',
            columns: ['Hazard', 'Parameter', 'Threshold'],
            rows: [
                ['Tornadoes', 'CAPE', '≥ 1000 J/kg'],
                ['Tornadoes', '0–6 km shear', '≥ 35 kt'],
                ['Tornadoes', 'LCL', '≤ 1 km'],
                ['Tornadoes', '0–1 km shear', '≥ 25 kt'],
                ['Tornadoes', 'Favoured |SRH 0–1 km|', '≥ 100 m²/s²'],
                ['Tornadoes', 'Critical angle', '60–120°'],
                ['Large hail (20 mm)', 'CAPE', '≥ 1000 J/kg'],
                ['Large hail (20 mm)', '0–6 km shear', '≥ 25 kt'],
                ['Large hail (20 mm)', 'Freezing level', '≤ 14,000 ft AMSL'],
                ['Large hail (20 mm)', 'Wet-bulb zero', '1500–3600 m AGL'],
                ['Giant hail (50 mm)', 'CAPE', '≥ 2000 J/kg'],
                ['Giant hail (50 mm)', '0–6 km shear', '≥ 35 kt'],
                ['Giant hail (50 mm)', 'Freezing level', '≤ 11,500 ft AMSL'],
                ['Giant hail (50 mm)', 'Wet-bulb zero', '2100–2800 m AGL'],
                ['Damaging gusts (&gt;48 kt)', 'CAPE', '≥ 1000 J/kg'],
                ['Damaging gusts (&gt;48 kt)', '0–6 km shear', '≥ 25 kt'],
                ['Damaging gusts (&gt;48 kt)', 'Evaporative potential', '(LCL ≥ 1.5 km AND mid-level dry) OR DCAPE ≥ 1000 J/kg'],
                ['Damaging gusts (&gt;48 kt)', 'Momentum', 'storm motion ≥ 50 kt OR 0–6 km mean ≥ 50 kt OR 900–500 hPa wind ≥ 50 kt'],
                ['Destructive gusts (&gt;67 kt)', 'CAPE', '≥ 2000 J/kg'],
                ['Destructive gusts (&gt;67 kt)', '0–6 km shear', '≥ 35 kt'],
                ['Destructive gusts (&gt;67 kt)', 'Evaporative potential', 'DCAPE ≥ 1500 J/kg AND mid-level dry'],
                ['Destructive gusts (&gt;67 kt)', 'Momentum', 'storm motion ≥ 50 kt OR 0–6 km mean ≥ 50 kt OR 900–500 hPa wind ≥ 50 kt'],
                ['Heavy rain', 'CAPE', '≥ 1000 J/kg'],
                ['Heavy rain', 'LCL', '≤ 1 km'],
                ['Heavy rain', 'Moisture', 'PW ≥ 40 mm OR deep moist'],
                ['Heavy rain', 'Warm-cloud depth', '≥ 3 km (FZL AGL − LCL AGL)'],
                ['Heavy rain', 'Storm motion', '≤ 15 kt'],
                ['Heavy rain', 'SFC–850 hPa Td', '≥ 14 °C'],
            ],
        },
    };

    function firstColumnRowspans(rows) {
        const spans = new Array(rows.length).fill(1);
        let i = 0;
        while (i < rows.length) {
            let end = i + 1;
            while (end < rows.length && rows[end][0] === rows[i][0]) {
                end += 1;
            }
            spans[i] = end - i;
            for (let k = i + 1; k < end; k += 1) {
                spans[k] = 0;
            }
            i = end;
        }
        return spans;
    }

    function renderHelpTable(help) {
        const spans = help.columns.length > 2 ? firstColumnRowspans(help.rows) : help.rows.map(() => 1);
        const head = `<tr>${help.columns.map((col) => `<th>${col}</th>`).join('')}</tr>`;
        const body = help.rows.map((cells, index) => {
            const first = spans[index] > 1
                ? `<th scope="row" rowspan="${spans[index]}">${cells[0]}</th>`
                : (spans[index] === 1 ? `<th scope="row">${cells[0]}</th>` : '');
            const rest = cells.slice(1).map((cell) => `<td>${cell}</td>`).join('');
            return `<tr>${first}${rest}</tr>`;
        }).join('');
        return `<table class="hodo-help-table"><thead>${head}</thead><tbody>${body}</tbody></table>`;
    }

    function isHelpOpen() {
        return Boolean(helpOverlayEl && !helpOverlayEl.classList.contains('hidden'));
    }

    function openHodographHelp(topic) {
        ensureUi();
        const help = HODO_HELP[topic];
        if (!help || !helpOverlayEl || !helpTitleEl || !helpBodyEl) {
            return;
        }
        helpTitleEl.textContent = help.title;
        helpBodyEl.innerHTML = `${help.note ? `<p class="hodo-help-note">${help.note}</p>` : ''}${renderHelpTable(help)}`;
        helpOverlayEl.classList.remove('hidden');
        helpOverlayEl.setAttribute('aria-hidden', 'false');
        helpCloseBtn?.focus();
    }

    function closeHodographHelp() {
        if (!helpOverlayEl) {
            return;
        }
        helpOverlayEl.classList.add('hidden');
        helpOverlayEl.setAttribute('aria-hidden', 'true');
    }

    function bindHodographHelp() {
        if (helpOverlayEl?.dataset.bound === '1') {
            return;
        }
        if (helpOverlayEl) {
            helpOverlayEl.dataset.bound = '1';
        }
        document.querySelectorAll('[data-hodo-help]').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                openHodographHelp(button.dataset.hodoHelp);
            });
        });
        helpCloseBtn?.addEventListener('click', () => {
            closeHodographHelp();
        });
        helpOverlayEl?.addEventListener('click', (event) => {
            if (event.target === helpOverlayEl) {
                closeHodographHelp();
            }
        });
    }

    function drawBunkersVectors(ctx, layout, bunkers, favoured) {
        if (!bunkers?.mean || !bunkers.rm || !bunkers.lm) {
            return;
        }
        const { mean, rm, lm, vLow, v6 } = bunkers;
        if (bunkersOverlay.shear && vLow && v6) {
            drawHodoArrow(ctx, layout, vLow.u, vLow.v, v6.u, v6.v, BUNKERS_COLORS.shear, 1.6);
        }
        if (bunkersOverlay.steering) {
            drawHodoArrow(ctx, layout, 0, 0, mean.u, mean.v, BUNKERS_COLORS.steering, 1.8);
        }
        if (bunkersOverlay.propagation) {
            drawHodoArrow(ctx, layout, mean.u, mean.v, rm.u, rm.v, BUNKERS_COLORS.propagation, favoured === 'RM' ? 2 : 1.3);
            drawHodoArrow(ctx, layout, mean.u, mean.v, lm.u, lm.v, BUNKERS_COLORS.propagation, favoured === 'LM' ? 2 : 1.3);
            drawBunkersRightAngle(ctx, layout, bunkers);
        }
        if (bunkersOverlay.rm) {
            drawHodoArrow(ctx, layout, 0, 0, rm.u, rm.v, BUNKERS_COLORS.rm, favoured === 'LM' ? 1.3 : 2.2);
        }
        if (bunkersOverlay.lm) {
            drawHodoArrow(ctx, layout, 0, 0, lm.u, lm.v, BUNKERS_COLORS.lm, favoured === 'RM' ? 1.3 : 2.2);
        }
    }

    function drawHodographTextLabel(ctx, layout, u, v, text, options = {}) {
        const { x, y } = hodoUvToScreen(u, v, layout);
        if (options.dot) {
            ctx.beginPath();
            ctx.arc(x, y, options.radius || 2.4, 0, Math.PI * 2);
            ctx.fillStyle = options.fill || '#1f2a37';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
        ctx.fillStyle = options.color || '#1f2a37';
        ctx.font = options.font || 'bold 11px sans-serif';
        ctx.textAlign = x >= layout.cx ? 'left' : 'right';
        ctx.textBaseline = options.baseline || 'bottom';
        const dx = x >= layout.cx ? 6 : -6;
        const dy = options.dy == null ? -4 : options.dy;
        ctx.fillText(text, x + dx, y + dy);
    }

    function renderProfileTable(profile) {
        if (!tableBodyEl) {
            return;
        }
        const levels = [...(profile?.levels || [])].sort((a, b) => a.pressure - b.pressure);
        tableBodyEl.innerHTML = levels.map((level) => {
            const rowClass = level.isSurface ? ' class="is-surface"' : '';
            return (
                `<tr${rowClass}>`
                + `<td>${formatMissing(level.pressure, 0)}</td>`
                + `<td>${formatAltitudeFt(level.height)}</td>`
                + `<td>${formatWindDir(level.windDirDeg)}</td>`
                + `<td>${formatMissing(level.windSpeedKt, 0)}</td>`
                + `<td>${formatMissing(level.temperature, 1)}</td>`
                + `<td>${formatMissing(level.dewpoint, 1)}</td>`
                + '</tr>'
            );
        }).join('');
    }

    function renderHodograph(profile, { preserveHover = false } = {}) {
        ensureUi();
        if (!canvasEl || !profile?.levels?.length) {
            renderHodographReadout(null);
            return;
        }
        lastProfile = profile;
        lastPlot = null;
        if (!preserveHover) {
            lastPointerCss = null;
            if (hoverEl) {
                hoverEl.classList.add('hidden');
                hoverEl.innerHTML = '';
            }
        }

        const hodographDiagnostics = computeHodographDiagnostics(profile);
        renderHodographReadout(hodographDiagnostics);

        const width = canvasEl.clientWidth || 640;
        const height = canvasEl.clientHeight || 520;
        if (width < 8 || height < 8) {
            return;
        }
        const dpr = window.devicePixelRatio || 1;
        canvasEl.width = Math.floor(width * dpr);
        canvasEl.height = Math.floor(height * dpr);

        const ctx = canvasEl.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const pad = 36;
        const innerW = Math.max(width - pad * 2, 40);
        const innerH = Math.max(height - pad * 2, 40);
        const cx = pad + innerW / 2;
        const cy = pad + innerH / 2;
        const radius = Math.max(Math.min(innerW, innerH) / 2 - 6, 20);
        const points = profileWindPoints(profile);
        const maxObserved = points.reduce((max, point) => Math.max(max, Math.hypot(point.u, point.v)), 0);
        const hourHalf = hodoHalfFromMaxSpeed(maxObserved);
        const lockedHalf = pinMatchesLockedHodo(profile.latitude, profile.longitude, profile.model)
            ? lockedHodo.half
            : null;
        const maxSpeed = Math.max(hourHalf, Number.isFinite(lockedHalf) ? lockedHalf : 0);
        const sessionKey = makeViewSessionKey(profile);
        if (sessionKey !== viewSessionKey) {
            viewSessionKey = sessionKey;
            viewExtents = null;
            hodoView = null;
        }
        defaultHodoView = { u0: 0, v0: 0, half: maxSpeed };
        const view = clampHodoView(hodoView || defaultHodoView, defaultHodoView);
        hodoView = view;
        lastHodoLayout = {
            cx,
            cy,
            radius,
            maxSpeed,
            u0: view.u0,
            v0: view.v0,
            half: view.half,
            points,
        };

        ctx.fillStyle = '#f4f7fb';
        ctx.fillRect(0, 0, width, height);

        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.clip();

        ctx.fillStyle = '#ffffff';
        ctx.fill();

        const origin = hodoUvToScreen(0, 0, lastHodoLayout);
        const ktToPx = radius / view.half;
        ctx.strokeStyle = 'rgba(90, 110, 140, 0.22)';
        ctx.lineWidth = 1;
        for (let kt = 10; kt <= maxSpeed; kt += 10) {
            ctx.beginPath();
            ctx.arc(origin.x, origin.y, kt * ktToPx, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.beginPath();
        ctx.moveTo(origin.x - maxSpeed * ktToPx, origin.y);
        ctx.lineTo(origin.x + maxSpeed * ktToPx, origin.y);
        ctx.moveTo(origin.x, origin.y - maxSpeed * ktToPx);
        ctx.lineTo(origin.x, origin.y + maxSpeed * ktToPx);
        ctx.strokeStyle = 'rgba(90, 110, 140, 0.45)';
        ctx.stroke();

        const toX = (u) => hodoUvToScreen(u, 0, lastHodoLayout).x;
        const toY = (v) => hodoUvToScreen(0, v, lastHodoLayout).y;

        if (points.length) {
            ctx.beginPath();
            points.forEach((point, index) => {
                const x = toX(point.u);
                const y = toY(point.v);
                if (index === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            });
            ctx.strokeStyle = 'rgba(40, 60, 90, 0.55)';
            ctx.lineWidth = 1.6;
            ctx.stroke();

            points.forEach((point) => {
                const x = toX(point.u);
                const y = toY(point.v);
                ctx.beginPath();
                ctx.arc(x, y, point.isSurface ? 4.2 : 3.2, 0, Math.PI * 2);
                ctx.fillStyle = pressureColor(point.pressure);
                ctx.fill();
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
                ctx.lineWidth = 1;
                ctx.stroke();
            });

            hodographAglLabels(profile).forEach((label) => {
                drawHodographTextLabel(ctx, lastHodoLayout, label.u, label.v, label.text, {
                    dot: Boolean(label.interpolated),
                    radius: 2.3,
                    fill: '#1f2a37',
                    font: label.isSurface ? 'bold 11px sans-serif' : '10px sans-serif',
                });
            });

            if (hodographDiagnostics?.bunkers) {
                drawBunkersVectors(ctx, lastHodoLayout, hodographDiagnostics.bunkers, hodographDiagnostics.favoured);
                if (bunkersOverlay.lm) {
                    drawHodographTextLabel(ctx, lastHodoLayout, hodographDiagnostics.bunkers.lm.u, hodographDiagnostics.bunkers.lm.v, 'LM', {
                        dot: true,
                        radius: 3.4,
                        fill: '#c05621',
                        color: '#9a3412',
                        font: 'bold 10px sans-serif',
                        baseline: 'top',
                        dy: 7,
                    });
                }
                if (bunkersOverlay.rm) {
                    drawHodographTextLabel(ctx, lastHodoLayout, hodographDiagnostics.bunkers.rm.u, hodographDiagnostics.bunkers.rm.v, 'RM', {
                        dot: true,
                        radius: 3.4,
                        fill: '#0d7377',
                        color: '#0f4c5c',
                        font: 'bold 10px sans-serif',
                        baseline: 'top',
                        dy: 7,
                    });
                }
            }
        } else {
            ctx.fillStyle = '#5b6b7c';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('No wind data', cx, cy);
        }

        ctx.restore();

        ctx.fillStyle = '#5b6b7c';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('N', cx, cy - radius - 6);
        ctx.textBaseline = 'top';
        ctx.fillText('S', cx, cy + radius + 6);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('E', cx + radius + 6, cy);
        ctx.textAlign = 'right';
        ctx.fillText('W', cx - radius - 6, cy);

        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = 'rgba(91, 107, 124, 0.9)';
        ctx.font = '10px sans-serif';
        for (let kt = 20; kt <= maxSpeed; kt += 20) {
            const label = hodoUvToScreen(kt, 0, lastHodoLayout);
            if (Math.hypot(label.x - cx, label.y - cy) <= radius - 2) {
                ctx.fillText(`${kt} kt`, label.x + 3, label.y - 3);
            }
        }

        captureStaticLayer();
        if (preserveHover && lastPointerCss) {
            const rect = canvasEl.getBoundingClientRect();
            updateHodographHover(rect.left + lastPointerCss.x, rect.top + lastPointerCss.y);
        }
    }

    function updateHodographHover(clientX, clientY) {
        if (!canvasEl || !lastHodoLayout || !lastProfile?.levels?.length) {
            hideHoverReadout();
            return;
        }
        const { cx, cy, radius, points } = lastHodoLayout;
        if (!points?.length) {
            hideHoverReadout();
            return;
        }

        const rect = canvasEl.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        lastPointerCss = { x, y };
        if (Math.hypot(x - cx, y - cy) > radius + 14) {
            hideHoverReadout();
            return;
        }

        let best = null;
        let bestDist = Infinity;
        points.forEach((point) => {
            const screen = hodoUvToScreen(point.u, point.v, lastHodoLayout);
            const dist = Math.hypot(screen.x - x, screen.y - y);
            if (dist < bestDist) {
                bestDist = dist;
                best = point;
            }
        });
        if (!best || bestDist > 16) {
            hideHoverReadout();
            return;
        }

        const ctx = canvasEl.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        if (restoreStaticLayer(ctx)) {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            const highlighted = hodoUvToScreen(best.u, best.v, lastHodoLayout);
            const hx = highlighted.x;
            const hy = highlighted.y;
            ctx.beginPath();
            ctx.arc(hx, hy, 6.5, 0, Math.PI * 2);
            ctx.strokeStyle = '#1f2a37';
            ctx.lineWidth = 1.6;
            ctx.stroke();
        }

        if (hoverEl) {
            hoverEl.innerHTML = formatHoverReadout({
                pressure: best.pressure,
                temperature: best.temperature,
                heightM: best.height,
                windDirDeg: best.windDirDeg,
                windSpeedKt: best.windSpeedKt,
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

    function renderActiveView(profile, options = {}) {
        ensureUi();
        if (profile?.levels?.length) {
            lastProfile = profile;
            renderProfileTable(profile);
        }
        if (activeTool === 'table') {
            lastPlot = null;
            lastHodoLayout = null;
            hideHoverReadout();
            return;
        }
        if (activeTool === 'hodograph') {
            renderHodograph(profile, options);
            return;
        }
        lastHodoLayout = null;
        renderSkewT(profile, options);
    }

    function renderSkewT(profile, { preserveHover = false } = {}) {
        ensureUi();
        if (!canvasEl || !profile?.levels?.length) return;
        lastProfile = profile;
        lastHodoLayout = null;
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

    function parseAerodromeCsv(text) {
        const lines = String(text || '').trim().split(/\r?\n/);
        if (lines.length < 2) {
            return [];
        }
        const header = lines[0].split(',').map((part) => part.trim().toUpperCase());
        const icaoIndex = header.indexOf('ICAO');
        const latIndex = header.indexOf('LAT');
        const lonIndex = header.indexOf('LONG');
        if (icaoIndex < 0 || latIndex < 0 || lonIndex < 0) {
            return [];
        }

        const sites = [];
        lines.slice(1).forEach((line) => {
            if (!line.trim()) {
                return;
            }
            const cols = line.split(',');
            const icao = String(cols[icaoIndex] || '').trim().toUpperCase();
            const lat = Number(cols[latIndex]);
            const lon = Number(cols[lonIndex]);
            if (!icao || !Number.isFinite(lat) || !Number.isFinite(lon)) {
                return;
            }
            sites.push({ icao, lat, lon });
        });
        sites.sort((a, b) => a.icao.localeCompare(b.icao));
        return sites;
    }

    function isSiteInAnyMapDomain(site) {
        const domainIds = window.MapGeoref?.getDomainIds?.() || [];
        if (!domainIds.length) {
            return true;
        }
        return domainIds.some((domainId) => window.MapGeoref?.isLonLatInDomain?.(site.lon, site.lat, domainId));
    }

    function visibleAerodromes() {
        return aerodromes.filter(isSiteInAnyMapDomain);
    }

    function populateLocationSelect() {
        if (!locationSelectEl) {
            return;
        }
        const sites = visibleAerodromes();
        const currentValue = selectedIcao || MAP_LOCATION_VALUE;
        locationSelectEl.innerHTML = '';

        const mapOption = document.createElement('option');
        mapOption.value = MAP_LOCATION_VALUE;
        mapOption.textContent = 'Map point';
        locationSelectEl.appendChild(mapOption);

        sites.forEach((site) => {
            const option = document.createElement('option');
            option.value = site.icao;
            option.textContent = site.icao;
            locationSelectEl.appendChild(option);
        });

        const hasCurrent = [...locationSelectEl.options].some((option) => option.value === currentValue);
        if (!hasCurrent && selectedIcao) {
            selectedIcao = null;
        }
        locationSelectEl.value = hasCurrent ? currentValue : MAP_LOCATION_VALUE;
    }

    async function loadAerodromes() {
        if (aerodromesLoadPromise) {
            return aerodromesLoadPromise;
        }
        aerodromesLoadPromise = (async () => {
            const response = await fetch(AERODROME_CSV_URL);
            if (!response.ok) {
                throw new Error(`Unable to read aerodrome list (${response.status})`);
            }
            aerodromes = parseAerodromeCsv(await response.text());
            populateLocationSelect();
        })().catch((error) => {
            console.warn('Failed to load TAF/PCA locations:', error);
            aerodromes = [];
            populateLocationSelect();
        });
        return aerodromesLoadPromise;
    }

    function currentValidTime() {
        if (lastRequestedValidTime instanceof Date && !Number.isNaN(lastRequestedValidTime.getTime())) {
            return lastRequestedValidTime;
        }
        const fromMaps = window.AnimationController?.getValidTime?.();
        return fromMaps instanceof Date && !Number.isNaN(fromMaps.getTime()) ? fromMaps : null;
    }

    function clearDrawnProfile() {
        if (resizeRaf) {
            cancelAnimationFrame(resizeRaf);
            resizeRaf = 0;
        }
        lastPlot = null;
        lastHodoLayout = null;
        lastPointerCss = null;
        staticLayerCanvas = null;
        staticLayerWidth = 0;
        staticLayerHeight = 0;
        hideHoverReadout();
        renderHodographReadout(null);
        if (tableBodyEl) {
            tableBodyEl.innerHTML = '';
        }
        const canvas = canvasEl || document.getElementById('sounding-canvas');
        if (!canvas) {
            return;
        }
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return;
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const width = canvas.width;
        canvas.width = width;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    function resetSoundingLocationState() {
        lastValidTimeIso = null;
        lastProfile = null;
        lockedAxes = null;
        lockedHodo = null;
        resetViewExtents();
        clearDrawnProfile();
    }

    async function ensurePointVisibleOnMaps(lat, lon) {
        const current = window.AnimationController?.getCurrentDomain?.();
        if (window.MapGeoref?.isLonLatInDomain?.(lon, lat, current)) {
            return;
        }

        window.AnimationController?.clearAxisMaximize?.();
        if (
            current !== 'AU'
            && window.MapGeoref?.isLonLatInDomain?.(lon, lat, 'AU')
            && typeof window.AnimationController?.switchDomain === 'function'
        ) {
            await window.AnimationController.switchDomain('AU');
            return;
        }

        const dest = window.MapGeoref?.preferredDomainForLonLat?.(lon, lat);
        if (dest && dest !== current && typeof window.AnimationController?.switchDomain === 'function') {
            await window.AnimationController.switchDomain(dest);
        }
    }

    async function moveSoundingTo(lat, lon) {
        pinLat = lat;
        pinLon = lon;
        resetSoundingLocationState();
        await ensurePointVisibleOnMaps(lat, lon);
        syncPin();
        const validTime = currentValidTime();
        if (validTime) {
            await loadProfileForPin(validTime, { showLoading: true });
        }
    }

    async function handleLocationSelect(value) {
        if (value === MAP_LOCATION_VALUE) {
            if (!Number.isFinite(mapClickLat) || !Number.isFinite(mapClickLon)) {
                if (locationSelectEl) {
                    locationSelectEl.value = selectedIcao || MAP_LOCATION_VALUE;
                }
                return;
            }
            selectedIcao = null;
            await moveSoundingTo(mapClickLat, mapClickLon);
            return;
        }

        const site = aerodromes.find((entry) => entry.icao === value);
        if (!site) {
            return;
        }
        selectedIcao = site.icao;
        await moveSoundingTo(site.lat, site.lon);
    }

    function setSoundingLoading(visible) {
        ensureUi();
        if (loadingEl) {
            loadingEl.classList.toggle('hidden', !visible);
            loadingEl.setAttribute('aria-hidden', visible ? 'false' : 'true');
        }
        viewStackEl?.classList.toggle('is-loading', Boolean(visible));
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
            && Math.abs((lastProfile.latitude ?? pinLat) - pinLat) < 1e-4
            && Math.abs((lastProfile.longitude ?? pinLon) - pinLon) < 1e-4
        ) {
            setSoundingLoading(false);
            return;
        }

        const generation = ++loadGeneration;
        lastValidTimeIso = validTimeIso;

        if (showLoading) {
            lastProfile = null;
            clearDrawnProfile();
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
            const { hourly, model, elevation } = await fetchOpenMeteoHourly(pinLat, pinLon, validTime, modelMeta.id);
            let profile = profileCache.get(key);
            if (!profile) {
                profile = buildProfileFromHourly(hourly, model, pinLat, pinLon, validTime, elevation);
                rememberProfile(key, profile);
            }

            // A newer timestep request superseded this one while we were waiting.
            if (generation !== loadGeneration) {
                return;
            }

            // Lock / expand axes from the full day at this pin so animation stays stable.
            updateLockedAxesFromHourly(hourly, pinLat, pinLon, modelMeta.id);
            updateLockedHodoFromHourly(hourly, pinLat, pinLon, modelMeta.id);

            metaEl.textContent = formatLatLon(pinLat, pinLon);
            if (statusEl) {
                statusEl.textContent = '';
                statusEl.classList.remove('error');
            }
            renderActiveView(profile);
            setSoundingLoading(false);
        } catch (error) {
            if (generation !== loadGeneration) {
                return;
            }
            console.warn('Sounding fetch failed:', error);
            lastProfile = null;
            lastHodoLayout = null;
            setSoundingLoading(false);
            if (tableBodyEl) {
                tableBodyEl.innerHTML = '';
            }
            if (statusEl) {
                statusEl.textContent = error?.message || 'Unable to load profile';
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
        mapClickLat = lat;
        mapClickLon = lon;
        selectedIcao = null;
        if (locationSelectEl) {
            locationSelectEl.value = MAP_LOCATION_VALUE;
        }
        lastValidTimeIso = null;
        lastProfile = null;
        lockedAxes = null;
        lockedHodo = null;
        resetViewExtents();
        clearDrawnProfile();
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
        closeHodographHelp();
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
        lastHodoLayout = null;
        clearDrawnProfile();
        lastValidTimeIso = null;
        lastRequestedValidTime = null;
        lockedAxes = null;
        lockedHodo = null;
        resetViewExtents();
        endPanInteraction();
        setSoundingLoading(false);
        hideHoverReadout();
        if (tableBodyEl) {
            tableBodyEl.innerHTML = '';
        }
        renderHodographReadout(null);
        if (metaEl) {
            metaEl.textContent = toolEnabled
                ? 'Click a map point to load a profile.'
                : 'Enable a profile tool, then click a map point.';
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
        isHelpOpen,
        closeHelp: closeHodographHelp,
        getPinLocation,
        isToolEnabled,
        setToolEnabled,
        toggleTool,
        getActiveTool,
        renderSkewT,
        syncPin,
        syncToValidTime,
        refreshLocationOptions: populateLocationSelect,
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
