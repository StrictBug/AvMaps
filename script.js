// Table axes: rows = models (GFS, ICON), columns = products.
const imageConfig = {
    Airmass: {
        layout: 'quad',
        columns: [
            { id: 'fzl', title: 'Freezing Level' },
            { id: 'snow', title: 'Snow Level' },
        ],
        rows: [
            { id: 'gfs', title: 'GFS' },
            { id: 'icon', title: 'ICON' },
        ],
        left: { folder: 'FZL', title: 'FZL' },
        right: { folder: 'Snow level', title: 'Snow Level' },
        topLeft: { title: 'Freezing Level' },
        topRight: { title: 'Snow Level' },
        bottomLeft: { title: 'Freezing Level' },
        bottomRight: { title: 'Snow Level' },
    },
    BG: {
        layout: 'pair',
        columns: [
            { id: 'fog', title: 'Fog & Low Cloud' },
        ],
        rows: [
            { id: 'gfs', title: 'GFS' },
            { id: 'icon', title: 'ICON' },
        ],
        left: { folder: 'US', title: 'GFS' },
        right: { folder: 'ICON', title: 'ICON' },
        topLeft: { title: 'Fog & Low Cloud' },
        bottomLeft: { title: 'Fog & Low Cloud' },
    },
    TS: {
        layout: 'quad',
        columns: [
            { id: 'flash', title: 'Thunderstorms' },
            { id: 'severe', title: 'Storm Dynamics' },
        ],
        rows: [
            { id: 'gfs', title: 'GFS' },
            { id: 'icon', title: 'ICON' },
        ],
        left: { folder: 'Flash density', title: 'Flash Density' },
        right: { folder: 'Severe storm potential', title: 'Severe Storm Potential' },
        topLeft: { title: 'Thunderstorms' },
        topRight: { title: 'Storm Dynamics' },
        bottomLeft: { title: 'Thunderstorms' },
        bottomRight: { title: 'Storm Dynamics' },
    },
    Policy: {
        layout: 'pair',
        columns: [
            { id: 'policy', title: 'Policy' },
        ],
        rows: [
            { id: 'gfs', title: 'GFS' },
            { id: 'icon', title: 'ICON' },
        ],
        left: { folder: 'GFS', title: 'GFS' },
        right: { folder: 'ICON', title: 'ICON' },
        topLeft: { title: 'Policy' },
        bottomLeft: { title: 'Policy' },
    },
    Turb: {
        layout: 'quad',
        columns: [
            { id: 'wind', title: 'Low Level Turbulence' },
            { id: 'mtw', title: 'Mountain Waves' },
        ],
        rows: [
            { id: 'gfs', title: 'GFS' },
            { id: 'icon', title: 'ICON' },
        ],
        left: { folder: 'Wind', title: 'Wind' },
        right: { folder: 'MTW', title: 'MTW' },
        topLeft: { title: 'Low Level Turbulence' },
        topRight: { title: 'Mountain Waves' },
        bottomLeft: { title: 'Low Level Turbulence' },
        bottomRight: { title: 'Mountain Waves' },
    }
};

const PRECIP_LEGEND = {
    units: 'mm/h',
    items: [
        { color: '#f0ff96', label: '0.1–0.2' },
        { color: '#f0ff3c', label: '0.2–0.5' },
        { color: '#ffff00', label: '0.5–1' },
        { color: '#c8ff00', label: '1–2' },
        { color: '#96ff00', label: '2–5' },
        { color: '#009600', label: '5–7.5' },
        { color: '#00af80', label: '7.5–10' },
        { color: '#00c8ff', label: '10–15' },
        { color: '#0096ff', label: '15–20' },
        { color: '#0000ff', label: '20–25' },
        { color: '#0000ff', label: '25–30' },
        { color: '#ff6400', label: '30–35' },
        { color: '#ff3200', label: '35–40' },
        { color: '#ff0000', label: '40–45' },
        { color: '#c80000', label: '45–50' },
        { color: '#320000', label: '50+' },
    ],
};

const FOG_LEGEND = {
    units: 'category',
    items: [
        { color: '#ffff00', label: 'F1' },
        { color: '#ffaa7f', label: 'F2' },
        { color: '#ff0000', label: 'F3' },
    ],
};

const FREEZING_FOG_LEGEND = {
    units: 'category',
    items: [
        { color: '#8fb8ff', label: 'F1' },
        { color: '#4d74e8', label: 'F2' },
        { color: '#1f3a9a', label: 'F3' },
    ],
};

// Paint order is bottom → top. The layer list uses the same order (top of list = bottom layer).
const POLICY_OVERLAY_ALPHA = 0.72;
const POLICY_LAYER_RENDER = [
    { id: 'precip', reduce: 'sum', edges: [0.1, 0.2, 0.5, 1, 2, 5, 7.5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 1e9], colors: ['#f0ff96', '#f0ff3c', '#ffff00', '#c8ff00', '#96ff00', '#009600', '#00af80', '#00c8ff', '#0096ff', '#0000ff', '#0000ff', '#ff6400', '#ff3200', '#ff0000', '#c80000', '#320000'] },
    { id: 'icing', reduce: 'max', edges: [95, 97.5, 100], colors: ['#00ccff', '#00ffff'] },
    { id: 'fog', reduce: 'max', discrete: true, colors: { 1: '#ffff00', 2: '#ffaa7f', 3: '#ff0000' } },
    { id: 'freezing_fog', reduce: 'max', discrete: true, colors: { 1: '#8fb8ff', 2: '#4d74e8', 3: '#1f3a9a' } },
    { id: 'low_cloud', reduce: 'max', edges: [85, 90, 95, 97.5, 100], colors: ['#ffffff', '#c86400', '#aa5500', '#6d3600'] },
    { id: 'drizzle', reduce: 'max', edges: [95, 100], colors: ['#00ff00'] },
    { id: 'small_hail', reduce: 'sum', edges: [0.1, 0.5, 1, 2.5, 5, 10, 20, 40, 1e9], colors: ['#e0f7fa', '#b2ebf2', '#80deea', '#4dd0e1', '#00bcd4', '#0097a7', '#006064', '#00363a'] },
    { id: 'snow', reduce: 'sum', edges: [0.1, 0.2, 0.5, 1, 2, 4, 8, 1e9], colors: ['#00b7ff', '#2cc7ff', '#54d6ff', '#7ee3ff', '#a8eeff', '#cdf6ff', '#ffffff'] },
    { id: 'ts_precip', reduce: 'sum', edges: [0.1, 0.3, 0.5, 1, 2.5, 5, 7.5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 100, 300, 1e9], colors: ['#00ff00', '#80ff00', '#fffb00', '#fff000', '#ffda00', '#ff9900', '#ff7300', '#ff4c00', '#ff0000', '#ff206e', '#ff2079', '#ff229f', '#ff1eb8', '#ff20d6', '#ec20ff', '#c020ff', '#9021ff', '#651dff', '#1c14ff', '#0effeb'] },
    { id: 'shear', reduce: 'max', discrete: true, colors: { 1: '#ffcc00', 2: '#ff6600', 3: '#ff0000' } },
    { id: 'lee', reduce: 'max', discrete: true, colors: { 1: '#ffcc00', 2: '#ff6600', 3: '#ff0000' } },
    { id: 'mtw', reduce: 'max', edges: [0.2, 0.4, 0.6, 1e9], colors: ['#ff9900', '#ff0000', '#ff00ff'] },
    { id: 'thermals', reduce: 'max', edges: [6000, 10000, 20000], colors: ['#ffcc00', '#ff6600'] },
];
const DEFAULT_POLICY_LAYER_ORDER = POLICY_LAYER_RENDER.map((spec) => spec.id);
const POLICY_LAYER_DRAG_THRESHOLD = 6;

const LAYER_LOGIC = {
    BG: {
        fog: {
            title: 'Fog & Low Cloud',
            layers: [
                {
                    name: '1 hr precipitation',
                    math: String.raw`\text{1 hr precip.}\ge 0.1\,\mathrm{mm\,hr^{-1}}`,
                    legend: PRECIP_LEGEND,
                },
                {
                    name: 'Drizzle',
                    math: String.raw`\text{mean RH }(950/900/850\,\mathrm{hPa})\ge 95\%`,
                    legend: {
                        units: 'avg RH %',
                        items: [{ color: '#00ff00', label: '95–100' }],
                    },
                },
                {
                    name: 'Low cloud',
                    math: String.raw`\text{max RH }(1000/975/950\,\mathrm{hPa})\ge 85\%`,
                    legend: {
                        units: 'max RH %',
                        items: [
                            { color: '#ffffff', label: '85–90' },
                            { color: '#c86400', label: '90–95' },
                            { color: '#aa5500', label: '95–97.5' },
                            { color: '#6d3600', label: '97.5–100' },
                        ],
                    },
                },
                {
                    name: 'Fog',
                    math: String.raw`
\begin{aligned}
\mathrm{F1}&: 10\mathrm{m}\ \mathrm{wind}<5\,\mathrm{kt},\ T-T_d<1^{\circ}\mathrm{C} \\
\mathrm{F2}&: 10\mathrm{m}\ \mathrm{wind}<3\,\mathrm{kt},\ T-T_d<0.5^{\circ}\mathrm{C} \\
\mathrm{F3}&: 10\mathrm{m}\ \mathrm{wind}<1\,\mathrm{kt},\ T-T_d<0.1^{\circ}\mathrm{C}
\end{aligned}`,
                    legend: FOG_LEGEND,
                },
            ],
        },
    },
    TS: {
        flash: {
            title: 'Thunderstorms',
            layers: [
                {
                    name: '1 hr thunderstorm precipitation',
                    math: String.raw`
\begin{aligned}
&\text{1 hr convective precip.}\ge 0.1\,\mathrm{mm} \\
&\text{where }\min\mathrm{LI}\text{ to }{-20}^{\circ}\mathrm{C}<0 \\
&\text{and }\max\mathrm{VV}_{500-250\,\mathrm{hPa}}>0.1\,\mathrm{m\,s^{-1}}
\end{aligned}`,
                    legend: {
                        units: 'mm/h',
                        items: [
                            { color: '#00ff00', label: '0.1–0.3' },
                            { color: '#80ff00', label: '0.3–0.5' },
                            { color: '#fffb00', label: '0.5–1' },
                            { color: '#fff000', label: '1–2.5' },
                            { color: '#ffda00', label: '2.5–5' },
                            { color: '#ff9900', label: '5–7.5' },
                            { color: '#ff7300', label: '7.5–10' },
                            { color: '#ff4c00', label: '10–15' },
                            { color: '#ff0000', label: '15–20' },
                            { color: '#ff206e', label: '20–25' },
                            { color: '#ff2079', label: '25–30' },
                            { color: '#ff229f', label: '30–35' },
                            { color: '#ff1eb8', label: '35–40' },
                            { color: '#ff20d6', label: '40–45' },
                            { color: '#ec20ff', label: '45–50' },
                            { color: '#c020ff', label: '50–55' },
                            { color: '#9021ff', label: '55–60' },
                            { color: '#651dff', label: '60–100' },
                            { color: '#1c14ff', label: '100–300' },
                            { color: '#0effeb', label: '300+' },
                        ],
                    },
                },
            ],
        },
        severe: {
            title: 'Storm Dynamics',
            layers: [
                {
                    name: 'SigHail',
                    math: String.raw`\mathrm{SigHail}=\frac{\mathrm{SBCAPE}\cdot q_{\mathrm{sfc}}\cdot 1000\cdot\Gamma_{700-500}\cdot T_{500}\cdot\text{Bulk shear}_{0-6\,\mathrm{km}}}{4.4\times 10^{7}}`,
                    legend: {
                        units: 'index',
                        items: [
                            { color: 'rgba(97,0,97,0.47)', label: '0.1–0.2' },
                            { color: 'rgba(119,0,135,0.47)', label: '0.2–0.3' },
                            { color: 'rgba(128,0,206,0.47)', label: '0.3–0.4' },
                            { color: 'rgba(0,127,254,0.47)', label: '0.4–0.5' },
                            { color: 'rgba(0,168,254,0.47)', label: '0.5–0.6' },
                            { color: 'rgba(0,208,254,0.47)', label: '0.6–0.7' },
                            { color: 'rgba(0,245,254,0.47)', label: '0.7–0.8' },
                            { color: 'rgba(0,254,179,0.47)', label: '0.8–0.9' },
                            { color: 'rgba(0,254,70,0.47)', label: '0.9–1.0' },
                            { color: 'rgba(104,254,0,0.47)', label: '1.0–1.1' },
                            { color: 'rgba(165,254,0,0.47)', label: '1.1–1.2' },
                            { color: 'rgba(193,254,0,0.47)', label: '1.2–1.3' },
                            { color: 'rgba(221,254,0,0.47)', label: '1.3–1.4' },
                            { color: 'rgba(248,254,0,0.47)', label: '1.4–1.5' },
                            { color: 'rgba(254,231,0,0.47)', label: '1.5–1.6' },
                            { color: 'rgba(254,202,0,0.47)', label: '1.6–1.7' },
                            { color: 'rgba(254,171,0,0.47)', label: '1.7–1.8' },
                            { color: 'rgba(254,140,0,0.47)', label: '1.8–1.9' },
                            { color: 'rgba(254,107,0,0.47)', label: '1.9–2.0' },
                            { color: 'rgba(254,70,0,0.47)', label: '2.0–2.2' },
                            { color: 'rgba(254,0,0,0.47)', label: '2.2–2.4' },
                            { color: 'rgba(254,77,77,0.47)', label: '2.4–2.6' },
                            { color: 'rgba(254,109,109,0.47)', label: '2.6–2.8' },
                            { color: 'rgba(254,132,132,0.47)', label: '2.8–3.0' },
                            { color: 'rgba(254,171,171,0.47)', label: '3.0–3.5' },
                            { color: 'rgba(254,210,210,0.47)', label: '3.5–4.0' },
                            { color: 'rgba(254,223,223,0.47)', label: '4.0–5.0' },
                            { color: 'rgba(254,254,254,0.47)', label: '5+' },
                        ],
                    },
                },
                {
                    name: 'Upper isotachs',
                    math: String.raw`250\,\mathrm{hPa}\ \mathrm{wind}`,
                    legend: {
                        units: 'kt',
                        items: [
                            { color: '#000080', label: '80–100' },
                            { color: '#ffff00', label: '100–120' },
                            { color: '#ff6600', label: '120–140' },
                            { color: '#ff0000', label: '140–160' },
                            { color: '#800000', label: '160–180' },
                            { color: '#ff00ff', label: '180+' },
                        ],
                    },
                },
                {
                    name: '0-6km bulk shear',
                    math: String.raw`\text{Bulk shear}_{0-6\,\mathrm{km}}=\left|\vec{V}_{500}-\vec{V}_{10\mathrm{m}}\right|`,
                    legend: {
                        items: [{ pattern: 'barb', color: '#2b0000', label: '0–6 km bulk shear' }],
                    },
                },
            ],
        },
    },
    Airmass: {
        fzl: {
            title: 'Freezing Level',
            layers: [
                {
                    name: 'Freezing layer',
                    math: String.raw`\ge 2\ \text{crossings of }0^{\circ}\mathrm{C}`,
                    legend: {
                        units: 'hatch',
                        items: [{ pattern: 'crosshatch', label: 'Multiple 0°C crossings' }],
                    },
                },
                {
                    name: 'Icing severity',
                    math: String.raw`\text{mean RH }(0\text{ to }{-15}^{\circ}\mathrm{C})`,
                    legend: {
                        units: '%',
                        items: [
                            { color: '#00ccff', label: '95–97.5' },
                            { color: '#00ffff', label: '97.5–100' },
                        ],
                    },
                },
                {
                    name: 'Thermals',
                    math: String.raw`
\begin{aligned}
&T_{2\mathrm{m}}>30^{\circ}\mathrm{C}\ \text{and sfc superadiabat} \\
&\text{depth where }\theta>\theta_{2\mathrm{m}}+0.5\,\mathrm{K}
\end{aligned}`,
                    legend: {
                        units: 'ft AGL',
                        items: [
                            { color: '#ffcc00', label: '6000–10000' },
                            { color: '#ff6600', label: '10000+' },
                        ],
                    },
                },
                {
                    name: '1 hr small hail',
                    math: String.raw`\text{1 hr convective precip.}\ge 0.1\,\mathrm{mm}\ \text{where }T_{700}<-9^{\circ}\mathrm{C}`,
                    legend: {
                        units: 'mm/h',
                        items: [
                            { color: '#e0f7fa', label: '0.1–0.5' },
                            { color: '#b2ebf2', label: '0.5–1' },
                            { color: '#80deea', label: '1–2.5' },
                            { color: '#4dd0e1', label: '2.5–5' },
                            { color: '#00bcd4', label: '5–10' },
                            { color: '#0097a7', label: '10–20' },
                            { color: '#006064', label: '20–40' },
                            { color: '#00363a', label: '40+' },
                        ],
                    },
                },
                {
                    name: 'Freezing fog',
                    math: String.raw`\text{Fog where }T_{2\mathrm{m}}<0^{\circ}\mathrm{C}`,
                    legend: FREEZING_FOG_LEGEND,
                },
            ],
        },
        snow: {
            title: 'Snow Level',
            layers: [
                {
                    name: '1 hr snow',
                    math: String.raw`\text{1 hr precip.}\ge 0.1\,\mathrm{mm}\ \text{where snow level}<\text{terrain}+600\,\mathrm{ft}`,
                    legend: {
                        units: 'mm/h',
                        items: [
                            { color: '#00b7ff', label: '0.1–0.2' },
                            { color: '#2cc7ff', label: '0.2–0.5' },
                            { color: '#54d6ff', label: '0.5–1' },
                            { color: '#7ee3ff', label: '1–2' },
                            { color: '#a8eeff', label: '2–4' },
                            { color: '#cdf6ff', label: '4–8' },
                            { color: '#ffffff', label: '8+' },
                        ],
                    },
                },
            ],
        },
    },
    Turb: {
        wind: {
            title: 'Low Level Turbulence',
            layers: [
                {
                    name: 'Max wind below 5000ft',
                    math: String.raw`\max\mathrm{wind}\ (\mathrm{SFC}\text{--}850\,\mathrm{hPa})`,
                    legend: {
                        units: 'kt',
                        items: [
                            { color: '#00ff00', label: '25–30' },
                            { color: '#006800', label: '30–35' },
                            { color: '#00b4ff', label: '35–40' },
                            { color: '#0064ff', label: '40–45' },
                            { color: '#0000ff', label: '45–50' },
                            { color: '#ff5555', label: '50–55' },
                            { color: '#ff0000', label: '55–60' },
                            { color: '#e60000', label: '60–70' },
                            { color: '#be0000', label: '70–80' },
                            { color: '#960000', label: '80+' },
                        ],
                    },
                },
                {
                    name: 'Shear turbulence',
                    math: String.raw`
\begin{aligned}
&\max\left|\vec{V}_{p}-\vec{V}_{10\mathrm{m}}\right|\ \text{on levels }p\ge 800\,\mathrm{hPa} \\
\left|\vec{V}_{p}\right|>45\,\mathrm{kt}&: \mathrm{mod}\ 27.5\text{--}50\,\mathrm{kt},\ \mathrm{mod/sev}\ 50\text{--}60\,\mathrm{kt},\ \mathrm{sev}\ge 60\,\mathrm{kt} \\
\left|\vec{V}_{p}\right|>65\,\mathrm{kt}&: \mathrm{mod}\ 25\text{--}40\,\mathrm{kt},\ \mathrm{mod/sev}\ 40\text{--}45\,\mathrm{kt},\ \mathrm{sev}\ge 45\,\mathrm{kt}
\end{aligned}`,
                    legend: {
                        units: 'category',
                        items: [
                            { color: '#ffcc00', label: 'MOD' },
                            { color: '#ff6600', label: 'MOD/SEV' },
                            { color: '#ff0000', label: 'SEV' },
                        ],
                    },
                },
                {
                    name: 'Lee turbulence',
                    math: String.raw`
\begin{aligned}
&\text{downslope within }4000\,\mathrm{ft}\ \mathrm{AGL},\ p\ge 800\,\mathrm{hPa} \\
&\mathrm{mod}\ 30\text{--}40\,\mathrm{kt},\ \mathrm{mod/sev}\ 40\text{--}45\,\mathrm{kt},\ \mathrm{sev}\ge 45\,\mathrm{kt}
\end{aligned}`,
                    legend: {
                        units: 'category',
                        items: [
                            { color: '#ffcc00', label: 'MOD' },
                            { color: '#ff6600', label: 'MOD/SEV' },
                            { color: '#ff0000', label: 'SEV' },
                        ],
                    },
                },
            ],
        },
        mtw: {
            title: 'Mountain Waves',
            layers: [
                {
                    name: 'Mountain wave intensity',
                    math: String.raw`\max|\mathrm{VV}|_{p\ge 250\,\mathrm{hPa}}`,
                    legend: {
                        units: 'm/s',
                        items: [
                            { color: '#ff9900', label: '0.2–0.4' },
                            { color: '#ff0000', label: '0.4–0.6' },
                            { color: '#ff00ff', label: '0.6+' },
                        ],
                    },
                },
            ],
        },
    },
    Policy: {
        policy: {
            title: 'Policy',
            layers: [
                {
                    name: 'Precipitation',
                    math: String.raw`\sum_{t_0}^{t}(\text{Precipitation})`,
                    legend: { units: 'mm', items: PRECIP_LEGEND.items },
                },
                {
                    name: 'Icing below 10000ft',
                    math: String.raw`\mathrm{Max}\big(\text{Icing}\mid \mathrm{FZL}<10000\,\mathrm{ft}\big)_{t_0-t}`,
                    legend: {
                        units: '%',
                        items: [
                            { color: '#00ccff', label: '95–97.5' },
                            { color: '#00ffff', label: '97.5–100' },
                        ],
                    },
                },
                {
                    name: 'Fog',
                    math: String.raw`\mathrm{Max}(\text{Fog})_{t_0-t}`,
                    legend: FOG_LEGEND,
                },
                {
                    name: 'Freezing fog',
                    math: String.raw`\mathrm{Max}(\text{Freezing fog})_{t_0-t}`,
                    legend: FREEZING_FOG_LEGEND,
                },
                {
                    name: 'Low cloud',
                    math: String.raw`\mathrm{Max}(\text{Low cloud})_{t_0-t}`,
                    legend: {
                        units: 'max RH %',
                        items: [
                            { color: '#ffffff', label: '85–90' },
                            { color: '#c86400', label: '90–95' },
                            { color: '#aa5500', label: '95–97.5' },
                            { color: '#6d3600', label: '97.5–100' },
                        ],
                    },
                },
                {
                    name: 'Drizzle',
                    math: String.raw`\mathrm{Max}(\text{Drizzle})_{t_0-t}`,
                    legend: {
                        units: 'avg RH %',
                        items: [{ color: '#00ff00', label: '95–100' }],
                    },
                },
                {
                    name: 'Small hail',
                    math: String.raw`\sum_{t_0}^{t}(\text{Small hail})`,
                    legend: {
                        units: 'mm',
                        items: [
                            { color: '#e0f7fa', label: '0.1–0.5' },
                            { color: '#4dd0e1', label: '2.5–5' },
                            { color: '#006064', label: '20–40' },
                            { color: '#00363a', label: '40+' },
                        ],
                    },
                },
                {
                    name: 'Snow',
                    math: String.raw`\sum_{t_0}^{t}(\text{Snow})`,
                    legend: {
                        units: 'mm',
                        items: [
                            { color: '#00b7ff', label: '0.1–0.2' },
                            { color: '#7ee3ff', label: '1–2' },
                            { color: '#ffffff', label: '8+' },
                        ],
                    },
                },
                {
                    name: 'Thunderstorms',
                    math: String.raw`\sum_{t_0}^{t}(\text{Thunderstorms})`,
                    legend: {
                        units: 'mm',
                        items: [
                            { color: '#00ff00', label: '0.1–0.3' },
                            { color: '#fffb00', label: '0.5–1' },
                            { color: '#ff9900', label: '5–7.5' },
                            { color: '#ff0000', label: '15–20' },
                            { color: '#ff20d6', label: '40–45' },
                            { color: '#1c14ff', label: '100–300' },
                        ],
                    },
                },
                {
                    name: 'Shear turbulence',
                    math: String.raw`\mathrm{Max}(\text{Shear turbulence})_{t_0-t}`,
                    legend: {
                        units: 'category',
                        items: [
                            { color: '#ffcc00', label: 'MOD' },
                            { color: '#ff6600', label: 'MOD/SEV' },
                            { color: '#ff0000', label: 'SEV' },
                        ],
                    },
                },
                {
                    name: 'Lee turbulence',
                    math: String.raw`\mathrm{Max}(\text{Lee turbulence})_{t_0-t}`,
                    legend: {
                        units: 'category',
                        items: [
                            { color: '#ffcc00', label: 'MOD' },
                            { color: '#ff6600', label: 'MOD/SEV' },
                            { color: '#ff0000', label: 'SEV' },
                        ],
                    },
                },
                {
                    name: 'MTW',
                    math: String.raw`\mathrm{Max}(\text{MTW})_{t_0-t}`,
                    legend: {
                        units: 'm/s',
                        items: [
                            { color: '#ff9900', label: '0.2–0.4' },
                            { color: '#ff0000', label: '0.4–0.6' },
                            { color: '#ff00ff', label: '0.6+' },
                        ],
                    },
                },
                {
                    name: 'Thermals',
                    math: String.raw`\mathrm{Max}(\text{Thermals})_{t_0-t}`,
                    legend: {
                        units: 'ft AGL',
                        items: [
                            { color: '#ffcc00', label: '6000–10000' },
                            { color: '#ff6600', label: '10000+' },
                        ],
                    },
                },
            ],
        },
    },
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

function formatCornerRunHtml(framePair, rows) {
    const runs = rows.map((row, index) => {
        const stamp = formatRunStamp(getRowRunDate(framePair, index));
        if (!stamp) {
            return null;
        }
        return {
            title: row.title || `Row ${index + 1}`,
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

function getRowRunDate(framePair, rowIndex) {
    if (!framePair) {
        return null;
    }
    const quad = isQuadCategory(currentCategory);
    // Rows are models: GFS on top, ICON below.
    const path = rowIndex === 0
        ? (quad
            ? (framePair.topLeftPath || framePair.topRightPath)
            : (framePair.leftPath || framePair.topLeftPath))
        : (quad
            ? (framePair.bottomLeftPath || framePair.bottomRightPath)
            : (framePair.rightPath || framePair.bottomLeftPath));
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
    pair.classList.toggle('has-axis-max', Boolean(maxCol || maxRow));

    pair.querySelectorAll('.map-col-header').forEach((header) => {
        const col = header.getAttribute('data-col');
        const title = config?.columns?.[Number(col)]?.title || `Column ${Number(col) + 1}`;
        const colAvailable = Number(col) < (config?.columns?.length || 0);
        const canMaximize = colAvailable && (config?.columns?.length || 0) > 1;
        const pressed = maxCol === col;
        header.disabled = !canMaximize;
        header.setAttribute('aria-pressed', pressed ? 'true' : 'false');
        if (!canMaximize) {
            header.title = title;
            header.setAttribute('aria-label', title);
            return;
        }
        header.title = pressed ? `Restore full width (${title})` : `Maximize ${title} column`;
        header.setAttribute('aria-label', header.title);
    });

    pair.querySelectorAll('.map-row-header').forEach((header) => {
        const row = header.getAttribute('data-row');
        const title = config?.rows?.[Number(row)]?.title || `Row ${Number(row) + 1}`;
        const rowAvailable = Number(row) < (config?.rows?.length || 0);
        const canMaximize = rowAvailable && (config?.rows?.length || 0) > 1;
        const pressed = maxRow === row;
        header.disabled = !canMaximize;
        header.setAttribute('aria-pressed', pressed ? 'true' : 'false');
        if (!canMaximize) {
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
    const config = imageConfig[currentCategory];
    const axisCount = axis === 'col'
        ? (config?.columns?.length || 0)
        : (config?.rows?.length || 0);
    if (next && (Number(next) >= axisCount || axisCount <= 1)) {
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

    pair.dataset.cols = String(Math.max(columns.length || 1, 1));
    pair.dataset.rows = String(Math.max(rows.length || 1, 1));
    if (!pair.hasAttribute('data-max-col')) {
        pair.setAttribute('data-max-col', '');
    }
    if (!pair.hasAttribute('data-max-row')) {
        pair.setAttribute('data-max-row', '');
    }
    // Drop maximize state for axes that do not exist in this layout.
    if (getAxisMaxValue(pair, 'col') && Number(getAxisMaxValue(pair, 'col')) >= columns.length) {
        pair.setAttribute('data-max-col', '');
    }
    if (getAxisMaxValue(pair, 'row') && Number(getAxisMaxValue(pair, 'row')) >= rows.length) {
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

    // Clear unused axis headers so stale labels cannot linger across categories.
    for (let index = columns.length; index < 2; index += 1) {
        const header = document.getElementById(`map-col-header-${index}`);
        const label = header?.querySelector('.map-axis-label');
        if (label) {
            label.textContent = '';
        }
    }
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

    const runDisplay = formatCornerRunHtml(framePair, rows);
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
    l: 'TS',
    a: 'Airmass',
    t: 'Turb',
    p: 'Policy',
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
                    items: FOG_LEGEND.items,
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
                    items: FOG_LEGEND.items,
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
                    items: FREEZING_FOG_LEGEND.items,
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
        right: {
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
    },
    Policy: {
        left: {
            title: 'Policy',
            fields: [
                { id: 'precip', label: 'Precipitation', units: 'mm', items: PRECIP_LEGEND.items },
                {
                    id: 'icing',
                    label: 'Icing blw 10000ft',
                    units: '%',
                    items: [
                        { color: '#00ccff', label: '95-97.5' },
                        { color: '#00ffff', label: '97.5-100' },
                    ],
                },
                { id: 'fog', label: 'Fog', units: 'category', items: FOG_LEGEND.items },
                { id: 'freezing_fog', label: 'Freezing fog', units: 'category', items: FREEZING_FOG_LEGEND.items },
                {
                    id: 'low_cloud',
                    label: 'Low cloud',
                    units: 'max RH %',
                    items: [
                        { color: '#ffffff', label: '85-90' },
                        { color: '#c86400', label: '90-95' },
                        { color: '#aa5500', label: '95-97.5' },
                        { color: '#6d3600', label: '97.5-100' },
                    ],
                },
                { id: 'drizzle', label: 'Drizzle', units: 'avg RH %', items: [{ color: '#00ff00', label: '95-100' }] },
                {
                    id: 'small_hail',
                    label: 'Small hail',
                    units: 'mm',
                    items: [
                        { color: '#e0f7fa', label: '0.1-0.5' },
                        { color: '#006064', label: '20-40' },
                    ],
                },
                {
                    id: 'snow',
                    label: 'Snow',
                    units: 'mm',
                    items: [
                        { color: '#00b7ff', label: '0.1-0.2' },
                        { color: '#ffffff', label: '8+' },
                    ],
                },
                {
                    id: 'ts_precip',
                    label: 'Thunderstorms',
                    units: 'mm',
                    items: [
                        { color: '#00ff00', label: '0.1-0.3' },
                        { color: '#fffb00', label: '0.5-1' },
                        { color: '#ff9900', label: '5-7.5' },
                        { color: '#ff0000', label: '15-20' },
                    ],
                },
                {
                    id: 'shear',
                    label: 'Shear turbulence',
                    units: 'category',
                    items: [
                        { color: '#ffcc00', label: 'MOD' },
                        { color: '#ff6600', label: 'MOD/SEV' },
                        { color: '#ff0000', label: 'SEV' },
                    ],
                },
                {
                    id: 'lee',
                    label: 'Lee turbulence',
                    units: 'category',
                    items: [
                        { color: '#ffcc00', label: 'MOD' },
                        { color: '#ff6600', label: 'MOD/SEV' },
                        { color: '#ff0000', label: 'SEV' },
                    ],
                },
                {
                    id: 'mtw',
                    label: 'MTW',
                    units: 'm/s',
                    items: [
                        { color: '#ff9900', label: '0.2-0.4' },
                        { color: '#ff0000', label: '0.4-0.6' },
                        { color: '#ff00ff', label: '0.6+' },
                    ],
                },
                {
                    id: 'thermals',
                    label: 'Thermals',
                    units: 'ft AGL',
                    items: [
                        { color: '#ffcc00', label: '6000-10000' },
                        { color: '#ff6600', label: '10000+' },
                    ],
                },
            ],
        },
    },
};

let currentCategory = 'BG';
let currentDomain = 'AU';
let currentFrame = 1;
const DEFAULT_MAX_FRAMES = 43;
const DECODE_WINDOW_RADIUS = 15;
const PRELOAD_CONCURRENCY = 8;
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
let infoTabControls;
let infoTabLayers;
let infoPaneControls;
let infoPaneLayers;
let infoLayersBody;
let infoActiveTab = 'controls';
let legendStrip;
let legendContent;
let legendToggleBtn;
let legendHelpBtn;
let mapSwapLoading;
let mapSwapGeneration = 0;
let controlsPanel;

let legendEnabled = false;
let hiddenLegendFields = {};
let policyLayerOrder = DEFAULT_POLICY_LAYER_ORDER.slice();
const policyStacks = { gfs: null, icon: null };
const policyStackPromises = { gfs: null, icon: null };
let policyPresets;
let policyLayersPanel;
let policyLayersList;
let policyOverlayRaf = 0;

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
        policyLayerOrder,
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
        policyLayerOrder = normalizePolicyLayerOrder(parsed?.policyLayerOrder);
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

function appendFieldSwatch(parent, field) {
    const barbItem = (field.items || []).find(item => item?.pattern === 'barb');
    const crosshatchItem = (field.items || []).find(item => item?.pattern === 'crosshatch');
    if (barbItem) {
        parent.appendChild(createBarbSwatch(barbItem.color));
        return;
    }
    if (crosshatchItem) {
        parent.appendChild(createCrosshatchSwatch(crosshatchItem.color));
        return;
    }
    const dot = document.createElement('span');
    dot.className = 'legend-field-toggle-dot';
    dot.style.setProperty('--legend-dot-color', getFieldAccentColor(field));
    parent.appendChild(dot);
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

    // Tip at right (direction of travel). Feathers sit at the upwind end
    // on the right-hand side of travel, matching SH map barbs.
    svg.appendChild(makeLine(3, 4, 18, 4));
    svg.appendChild(makeLine(3, 4, 7, 11));
    svg.appendChild(makeLine(6.5, 4, 10.5, 11));

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
        'thunderstorm precipitation': 'Thunderstorms',
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

        const fieldsToRender = (isPolicyCategory() && panelKey === 'left')
            ? getPolicyLegendFields()
            : (panelConfig.fields || []).filter(field => !EXCLUDED_LEGEND_FIELD_IDS.has(field?.id));
        const interactive = !isPolicyCategory();

        fieldsToRender.forEach((field, index) => {
            const fieldId = field.id || `${panelKey}-${index}`;
            const hidden = getFieldHiddenState(currentCategory, panelKey, fieldId);

            const itemNode = document.createElement(interactive ? 'button' : 'div');
            if (interactive) {
                itemNode.type = 'button';
                itemNode.className = `legend-field-toggle${hidden ? ' is-disabled' : ''}`;
                itemNode.setAttribute('aria-pressed', hidden ? 'false' : 'true');
            } else {
                itemNode.className = 'legend-field-toggle legend-field-key';
            }

            appendFieldSwatch(itemNode, field);

            const toggleLabel = document.createElement('span');
            toggleLabel.className = 'legend-field-toggle-label';
            toggleLabel.textContent = formatLegendLabel(field.label || fieldId);
            itemNode.appendChild(toggleLabel);

            if (interactive) {
                itemNode.addEventListener('click', () => {
                setFieldHiddenState(currentCategory, panelKey, fieldId, !hidden);
                saveLegendPreferences();
                renderLegend();
            });
            }

            togglesNode.appendChild(itemNode);
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
        window.SoundingViewer?.refreshLocationOptions?.();
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
    currentFrame = isPolicyCategory()
        ? selectedRangeEnd
        : clampFrameToSelectedRange(currentFrame);
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
        syncPolicyPresetActiveState();
        return;
    }

    const startFramePair = framePairs[selectedRangeStart - 1];
    const endFramePair = framePairs[selectedRangeEnd - 1];
    rangeStartTimeLabel.textContent = formatDateForRangeDisplay(getValidDateForFramePair(startFramePair));
    rangeEndTimeLabel.textContent = formatDateForRangeDisplay(getValidDateForFramePair(endFramePair));
    syncPolicyPresetActiveState();
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
    currentFrame = isPolicyCategory()
        ? selectedRangeEnd
        : clampFrameToSelectedRange(currentFrame);
    frameSlider.value = currentFrame;
    updateSelectedRangeHighlight();
    updateRangeTimeDisplay();
    updateImages();
}

function updateRangeEndValue(value) {
    selectedRangeEnd = Math.min(maxFrames, Math.max(value, selectedRangeStart));
    frameRangeEndSlider.value = selectedRangeEnd;
    currentFrame = isPolicyCategory()
        ? selectedRangeEnd
        : clampFrameToSelectedRange(currentFrame);
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
    infoTabControls = document.getElementById('info-tab-controls');
    infoTabLayers = document.getElementById('info-tab-layers');
    infoPaneControls = document.getElementById('info-pane-controls');
    infoPaneLayers = document.getElementById('info-pane-layers');
    infoLayersBody = document.getElementById('info-layers-body');
    legendStrip = document.getElementById('legend-strip');
    legendContent = document.getElementById('legend-content');
    legendToggleBtn = document.getElementById('legend-toggle-btn');
    legendHelpBtn = document.getElementById('legend-help-btn');
    mapSwapLoading = document.getElementById('map-swap-loading');
    controlsPanel = document.querySelector('.controls');
    policyPresets = document.getElementById('policy-presets');
    policyLayersPanel = document.getElementById('policy-layers-panel');
    policyLayersList = document.getElementById('policy-layers-list');
}

function beginMapSwapLoading() {
    mapSwapGeneration += 1;
    const pair = getImagePairEl();
    pair?.classList.add('is-swapping');
    if (mapSwapLoading) {
        mapSwapLoading.classList.remove('hidden');
        mapSwapLoading.setAttribute('aria-hidden', 'false');
    }
    return mapSwapGeneration;
}

function endMapSwapLoading(token) {
    if (token !== mapSwapGeneration) {
        return;
    }
    const pair = getImagePairEl();
    pair?.classList.remove('is-swapping');
    if (mapSwapLoading) {
        mapSwapLoading.classList.add('hidden');
        mapSwapLoading.setAttribute('aria-hidden', 'true');
    }
}

function getVisibleMapImages() {
    return Object.values(mapImagesByPanel).filter((img) => {
        if (!img) {
            return false;
        }
        const panel = img.closest('.image-panel');
        if (!panel || getComputedStyle(panel).display === 'none') {
            return false;
        }
        return Boolean(img.getAttribute('src'));
    });
}

function waitForImageReady(img, timeoutMs = 2500) {
    if (!img?.getAttribute('src') || img.complete) {
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        let settled = false;
        const finish = () => {
            if (settled) {
                return;
            }
            settled = true;
            img.removeEventListener('load', finish);
            img.removeEventListener('error', finish);
            resolve();
        };
        img.addEventListener('load', finish);
        img.addEventListener('error', finish);
        if (img.complete) {
            finish();
            return;
        }
        window.setTimeout(finish, timeoutMs);
    });
}

async function waitForVisibleMapsReady() {
    await Promise.race([
        Promise.all(getVisibleMapImages().map((img) => waitForImageReady(img))),
        new Promise((resolve) => window.setTimeout(resolve, 2500)),
    ]);
}

function pauseAnimationClock() {
    if (animationInterval) {
        clearInterval(animationInterval);
        animationInterval = null;
    }
}

function resumeAnimationIfNeeded(shouldResume) {
    if (shouldResume && isPlaying) {
        startAnimation();
    }
}

function isInfoModalOpen() {
    return infoOverlay && !infoOverlay.classList.contains('hidden');
}

function getVisibleLayerColumns() {
    const columns = imageConfig[currentCategory]?.columns || [];
    const maxCol = getAxisMaxValue(getImagePairEl(), 'col');
    if (maxCol === '0' || maxCol === '1') {
        const column = columns[Number(maxCol)];
        return column ? [column] : columns;
    }
    return columns;
}

function renderLayerMath(latex) {
    const source = String(latex || '').trim();
    if (window.katex) {
        return window.katex.renderToString(source, {
            throwOnError: false,
            displayMode: true,
            output: 'html',
        });
    }
    return `<code class="info-layer-math-fallback">${source
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')}</code>`;
}

function splitLegendLabel(label) {
    const text = String(label || '');
    const parts = text.split(/[–-]/);
    if (parts.length >= 2) {
        return { start: parts[0].trim(), end: parts.slice(1).join('–').trim() };
    }
    return { start: text, end: text };
}

function pickColorbarTickIndices(count, maxTicks = 7) {
    if (count <= maxTicks) {
        return Array.from({ length: count }, (_, index) => index);
    }
    const picked = new Set([0, count - 1]);
    const steps = maxTicks - 1;
    for (let i = 1; i < steps; i += 1) {
        picked.add(Math.round((i * (count - 1)) / steps));
    }
    return [...picked].sort((a, b) => a - b);
}

function renderLayerLegendScale(legend) {
    const scale = document.createElement('div');
    scale.className = 'info-layer-scale';
    const items = legend?.items || [];
    if (legend?.units) {
        const units = document.createElement('span');
        units.className = 'info-layer-scale-units';
        units.textContent = legend.units;
        scale.appendChild(units);
    }

    const symbolItem = items.find((item) => item.pattern === 'barb' || item.pattern === 'crosshatch');
    if (symbolItem) {
        const chip = document.createElement('span');
        chip.className = 'info-layer-scale-item';
        chip.appendChild(symbolItem.pattern === 'barb'
            ? createBarbSwatch(symbolItem.color)
            : createCrosshatchSwatch(symbolItem.color));
        const label = document.createElement('span');
        label.textContent = symbolItem.label || '';
        chip.appendChild(label);
        scale.appendChild(chip);
        return scale;
    }

    const colorItems = items.filter((item) => item.color);
    if (colorItems.length === 0) {
        return scale;
    }

    const bar = document.createElement('div');
    bar.className = 'info-colorbar';
    const ramp = document.createElement('div');
    ramp.className = 'info-colorbar-ramp';
    const stops = colorItems.map((item, index) => {
        const start = ((index / colorItems.length) * 100).toFixed(2);
        const end = (((index + 1) / colorItems.length) * 100).toFixed(2);
        return `${item.color} ${start}%, ${item.color} ${end}%`;
    });
    ramp.style.background = `linear-gradient(to right, ${stops.join(', ')})`;
    bar.appendChild(ramp);

    const ticks = document.createElement('div');
    ticks.className = 'info-colorbar-ticks';
    const numeric = colorItems.every((item) => /[–-]|\+$/.test(item.label || ''));
    if (numeric) {
        ticks.classList.add('is-numeric');
        const edges = colorItems.map((item, index) => {
            const parts = splitLegendLabel(item.label);
            return index === 0 ? [parts.start, parts.end] : [parts.end];
        }).flat();
        const lastIndex = Math.max(edges.length - 1, 1);
        pickColorbarTickIndices(edges.length).forEach((index) => {
            const tick = document.createElement('span');
            tick.textContent = edges[index];
            tick.style.left = `${(index / lastIndex) * 100}%`;
            ticks.appendChild(tick);
        });
    } else {
        ticks.style.gridTemplateColumns = `repeat(${colorItems.length}, minmax(0, 1fr))`;
        colorItems.forEach((item) => {
            const tick = document.createElement('span');
            tick.textContent = item.label;
            ticks.appendChild(tick);
        });
    }
    bar.appendChild(ticks);
    scale.appendChild(bar);
    return scale;
}

function renderInfoLayerLogic() {
    if (!infoLayersBody) {
        return;
    }

    infoLayersBody.replaceChildren();

    const layers = getVisibleLayerColumns().flatMap((column) => (
        LAYER_LOGIC[currentCategory]?.[column.id]?.layers
        || [{ name: 'Layers', math: String.raw`\text{No layer notes are recorded for this product.}` }]
    ));

    const wrap = document.createElement('div');
    wrap.className = 'info-layer-table-wrap';
    const table = document.createElement('table');
    table.className = 'info-layer-table';
    const tbody = document.createElement('tbody');

    layers.forEach((layer) => {
        const row = document.createElement('tr');
        const nameCell = document.createElement('td');
        const logicCell = document.createElement('td');
        const legendCell = document.createElement('td');
        nameCell.textContent = layer.name;
        logicCell.innerHTML = renderLayerMath(layer.math || layer.text || '');
        legendCell.className = 'info-layer-legend-cell';
        legendCell.appendChild(renderLayerLegendScale(layer.legend));
        row.append(nameCell, logicCell, legendCell);
        tbody.appendChild(row);
    });

    table.appendChild(tbody);
    wrap.appendChild(table);
    infoLayersBody.appendChild(wrap);
}

function setInfoTab(tab) {
    infoActiveTab = tab === 'layers' ? 'layers' : 'controls';
    const isLayers = infoActiveTab === 'layers';
    infoTabControls?.classList.toggle('active', !isLayers);
    infoTabLayers?.classList.toggle('active', isLayers);
    infoTabControls?.setAttribute('aria-selected', String(!isLayers));
    infoTabLayers?.setAttribute('aria-selected', String(isLayers));
    infoPaneControls?.classList.toggle('hidden', isLayers);
    infoPaneLayers?.classList.toggle('hidden', !isLayers);
    if (infoPaneControls) {
        infoPaneControls.hidden = isLayers;
    }
    if (infoPaneLayers) {
        infoPaneLayers.hidden = !isLayers;
    }
    if (isLayers) {
        renderInfoLayerLogic();
    }
}

function openInfoModal(tab) {
    stopAnimation();
    renderInfoLayerLogic();
    setInfoTab(tab || infoActiveTab);
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

function collectFrameSources(domainId, category) {
            const framePairs = framePairsCache[domainId]?.[category] || [];
    const sources = [];
    framePairs.forEach((framePair) => {
        getFrameImagePaths(framePair).forEach((src) => {
            if (src) {
                sources.push(src);
            }
        });
    });
    return sources;
}

function collectDecodeWindowSources(centerFrame) {
    const targetSources = new Set();
    const framePairs = getCurrentFramePairs();
            const frameCount = framePairs.length;
            if (frameCount === 0) {
        return targetSources;
            }

            for (let offset = -DECODE_WINDOW_RADIUS; offset <= DECODE_WINDOW_RADIUS; offset += 1) {
                const frameIndex = getWrappedFrameIndex(centerFrame + offset, frameCount);
                const framePair = framePairs[frameIndex - 1];
                if (!framePair) {
                    continue;
                }
        getFrameImagePaths(framePair).forEach((src) => {
            if (src) {
                targetSources.add(src);
            }
        });
    }

    return targetSources;
}

function updateDecodeWindowsForAllStreams(centerFrame) {
    const targetSources = collectDecodeWindowSources(centerFrame);

    targetSources.forEach(src => {
        decodeImageSource(src);
    });

    Array.from(decodedImageObjects.keys()).forEach(src => {
        if (!targetSources.has(src)) {
            decodedImageObjects.delete(src);
        }
    });
}

async function preloadSources(sources, onProgress) {
    const unique = [...new Set((sources || []).filter(Boolean))];
    if (unique.length === 0) {
        onProgress?.(0, 0);
        return;
    }

    let completedCount = 0;
    let nextIndex = 0;
    onProgress?.(0, unique.length);

    const worker = async () => {
        while (nextIndex < unique.length) {
            const src = unique[nextIndex];
            nextIndex += 1;
        await preloadImageSource(src);
        completedCount += 1;
            onProgress?.(completedCount, unique.length);
        }
    };

    const workerCount = Math.min(PRELOAD_CONCURRENCY, unique.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
}

async function preloadCurrentSelection() {
    const sources = collectFrameSources(currentDomain, currentCategory);
    await preloadSources(sources, setLoadingProgress);
    updateDecodeWindowsForAllStreams(currentFrame);
}

async function preloadRemainingInBackground() {
    const domainIds = Array.from(new Set(Object.values(domainHotkeys)));
    const categories = Object.keys(imageConfig);
    const seen = new Set(collectFrameSources(currentDomain, currentCategory));
    const prioritized = [];

    const takeSources = async (domainId, category) => {
            const framePairs = await loadCategoryFrames(domainId, category);
        framePairs.forEach((framePair) => {
            getFrameImagePaths(framePair).forEach((src) => {
                if (!src || seen.has(src)) {
                    return;
                }
                seen.add(src);
                prioritized.push(src);
            });
        });
    };

    for (const category of categories) {
        if (category === currentCategory) {
            continue;
        }
        await takeSources(currentDomain, category);
    }
    for (const domainId of domainIds) {
        if (domainId === currentDomain) {
            continue;
        }
        await takeSources(domainId, currentCategory);
    }
    for (const domainId of domainIds) {
        if (domainId === currentDomain) {
            continue;
        }
        for (const category of categories) {
            if (category === currentCategory) {
                continue;
            }
            await takeSources(domainId, category);
        }
    }

    await preloadSources(prioritized);
}

function isPolicyCategory(category = currentCategory) {
    return category === 'Policy';
}

function hexToRgba(hex, alpha) {
    const raw = String(hex || '').replace('#', '');
    if (raw.length < 6) {
        return [0, 0, 0, alpha];
    }
    return [
        parseInt(raw.slice(0, 2), 16),
        parseInt(raw.slice(2, 4), 16),
        parseInt(raw.slice(4, 6), 16),
        alpha,
    ];
}

function f16ToNumber(u16) {
    const sign = (u16 & 0x8000) >> 15;
    const exp = (u16 & 0x7c00) >> 10;
    const frac = u16 & 0x03ff;
    if (exp === 0) {
        return (sign ? -1 : 1) * (2 ** -14) * (frac / 1024);
    }
    if (exp === 31) {
        return frac ? NaN : (sign ? -Infinity : Infinity);
    }
    return (sign ? -1 : 1) * (2 ** (exp - 15)) * (1 + frac / 1024);
}

function decodePolicyPlane(bytes, dtype, cellCount) {
    const out = new Float32Array(cellCount);
    if (dtype === 'f16') {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        if (typeof view.getFloat16 === 'function') {
            for (let i = 0; i < cellCount; i += 1) {
                out[i] = view.getFloat16(i * 2, true);
            }
            return out;
        }
        for (let i = 0; i < cellCount; i += 1) {
            out[i] = f16ToNumber(view.getUint16(i * 2, true));
        }
        return out;
    }
    if (dtype === 'u8') {
        for (let i = 0; i < cellCount; i += 1) {
            const value = bytes[i];
            out[i] = value === 255 ? NaN : value;
        }
        return out;
    }
    if (dtype === 'u16') {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        for (let i = 0; i < cellCount; i += 1) {
            const value = view.getUint16(i * 2, true);
            out[i] = value === 65535 ? NaN : value;
        }
        return out;
    }
    return out;
}

function parsePolicyStack(meta, buffer) {
    const hours = (meta.hours || []).map((hour) => Number(hour));
    const nlat = Number(meta.nlat);
    const nlon = Number(meta.nlon);
    const cellCount = nlat * nlon;
    const layers = {};
    const raw = new Uint8Array(buffer);
    (meta.layers || []).forEach((layer) => {
        const hourSize = layer.length / Math.max(hours.length, 1);
        const planes = hours.map((_, index) => {
            const start = layer.offset + index * hourSize;
            const slice = raw.subarray(start, start + hourSize);
            return decodePolicyPlane(slice, layer.dtype, cellCount);
        });
        layers[layer.id] = {
            reduce: layer.reduce,
            dtype: layer.dtype,
            planes,
        };
    });
    return {
        hours,
        nlat,
        nlon,
        lat0: Number(meta.lat0),
        dlat: Number(meta.dlat),
        lon0: Number(meta.lon0),
        dlon: Number(meta.dlon),
        layers,
    };
}

async function loadPolicyStack(model) {
    if (policyStacks[model]) {
        return policyStacks[model];
    }
    if (policyStackPromises[model]) {
        return policyStackPromises[model];
    }
    const metaUrl = frameManifest?.policy?.[model];
    if (!metaUrl) {
        return null;
    }
    policyStackPromises[model] = (async () => {
        const metaResponse = await fetch(metaUrl, { cache: 'no-store' });
        if (!metaResponse.ok) {
            throw new Error(`Policy ${model} metadata ${metaResponse.status}`);
        }
        const meta = await metaResponse.json();
        const binUrl = metaUrl.replace(/[^/]+$/, meta.bin || `${model}.bin`);
        const binResponse = await fetch(binUrl, { cache: 'no-store' });
        if (!binResponse.ok) {
            throw new Error(`Policy ${model} stack ${binResponse.status}`);
        }
        const stack = parsePolicyStack(meta, await binResponse.arrayBuffer());
        policyStacks[model] = stack;
        return stack;
    })().catch((error) => {
        console.warn(`Unable to load Policy ${model} stack:`, error);
        policyStackPromises[model] = null;
        return null;
    });
    return policyStackPromises[model];
}

async function ensurePolicyStacks() {
    if (!isPolicyCategory()) {
        return;
    }
    await loadFrameManifest();
    await Promise.all([loadPolicyStack('gfs'), loadPolicyStack('icon')]);
}

function getSelectedForecastHours() {
    const framePairs = getCurrentFramePairs();
    const hours = [];
    for (let index = selectedRangeStart; index <= selectedRangeEnd; index += 1) {
        const hour = Number(framePairs[index - 1]?.hour);
        if (Number.isFinite(hour)) {
            hours.push(hour);
        }
    }
    return hours;
}

function reducePolicyLayer(stack, layerId, reduceMode, selectedHours) {
    const layer = stack?.layers?.[layerId];
    if (!layer) {
        return null;
    }
    const cellCount = stack.nlat * stack.nlon;
    const result = new Float32Array(cellCount);
    if (reduceMode === 'sum') {
        result.fill(0);
    } else {
        result.fill(Number.NaN);
    }
    const hourIndex = new Map(stack.hours.map((hour, index) => [hour, index]));
    selectedHours.forEach((hour) => {
        const plane = layer.planes[hourIndex.get(hour)];
        if (!plane) {
            return;
        }
        for (let i = 0; i < cellCount; i += 1) {
            const value = plane[i];
            if (!Number.isFinite(value)) {
                continue;
            }
            if (reduceMode === 'sum') {
                result[i] += value;
            } else if (!Number.isFinite(result[i]) || value > result[i]) {
                result[i] = value;
            }
        }
    });
    if (reduceMode === 'sum') {
        for (let i = 0; i < cellCount; i += 1) {
            if (result[i] <= 0) {
                result[i] = Number.NaN;
            }
        }
    }
    return result;
}

function colorizePolicyLayer(values, spec, nlat, nlon) {
    const image = new ImageData(nlon, nlat);
    const pixels = image.data;
    for (let row = 0; row < nlat; row += 1) {
        const srcRow = nlat - 1 - row;
        for (let col = 0; col < nlon; col += 1) {
            const value = values[srcRow * nlon + col];
            const pixel = (row * nlon + col) * 4;
            if (!Number.isFinite(value) || value <= 0) {
                continue;
            }
            let color = null;
            if (spec.discrete) {
                color = spec.colors[Math.round(value)];
            } else {
                const edges = spec.edges || [];
                for (let bin = 0; bin < edges.length - 1; bin += 1) {
                    if (value >= edges[bin] && value < edges[bin + 1]) {
                        color = spec.colors[bin];
                        break;
                    }
                }
                if (!color && value >= edges[edges.length - 2]) {
                    color = spec.colors[spec.colors.length - 1];
                }
            }
            if (!color) {
                continue;
            }
            const [red, green, blue] = hexToRgba(color, 255);
            pixels[pixel] = red;
            pixels[pixel + 1] = green;
            pixels[pixel + 2] = blue;
            pixels[pixel + 3] = 255;
        }
    }
    return image;
}

function getPolicyOverlayCanvas(panel) {
    return document.querySelector(`.policy-overlay[data-panel="${panel}"]`);
}

function paintPolicyOverlay(panel, model) {
    const canvas = getPolicyOverlayCanvas(panel);
    const img = mapImagesByPanel[panel];
    if (!canvas || !img) {
        return;
    }
    const ctx = canvas.getContext('2d');
    const panelEl = img.closest('.image-panel');
    const imgRect = img.getBoundingClientRect();
    const panelRect = panelEl?.getBoundingClientRect() || imgRect;
    const width = imgRect.width;
    const height = imgRect.height;
    if (!width || !height) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }
    const ratio = window.devicePixelRatio || 1;
    canvas.style.left = `${imgRect.left - panelRect.left}px`;
    canvas.style.top = `${imgRect.top - panelRect.top}px`;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const stack = policyStacks[model];
    const georef = getDomainGeoref();
    if (!stack || !georef || !isPolicyCategory()) {
        return;
    }

    const box = getDisplayedImageContentBox(img);
    const destLeft = box.left - imgRect.left + georef.axesFraction.left * box.width;
    const destTop = box.top - imgRect.top + georef.axesFraction.top * box.height;
    const destWidth = georef.axesFraction.width * box.width;
    const destHeight = georef.axesFraction.height * box.height;
    if (destWidth <= 1 || destHeight <= 1) {
        return;
    }

    const stackLatMax = stack.lat0 + (stack.nlat - 1) * stack.dlat;
    const srcX = (georef.extent.lonMin - stack.lon0) / stack.dlon;
    const srcW = (georef.extent.lonMax - georef.extent.lonMin) / stack.dlon;
    const srcY = (stackLatMax - georef.extent.latMax) / stack.dlat;
    const srcH = (georef.extent.latMax - georef.extent.latMin) / stack.dlat;
    const selectedHours = getSelectedForecastHours();
    const composite = document.createElement('canvas');
    composite.width = stack.nlon;
    composite.height = stack.nlat;
    const compositeCtx = composite.getContext('2d');
    const layerCanvas = document.createElement('canvas');
    layerCanvas.width = stack.nlon;
    layerCanvas.height = stack.nlat;
    const layerCtx = layerCanvas.getContext('2d');

    compositeCtx.imageSmoothingEnabled = false;
    getOrderedPolicyLayerSpecs().forEach((spec) => {
        if (getFieldHiddenState('Policy', 'left', spec.id)) {
            return;
        }
        const reduced = reducePolicyLayer(stack, spec.id, spec.reduce, selectedHours);
        if (!reduced) {
            return;
        }
        layerCtx.clearRect(0, 0, stack.nlon, stack.nlat);
        layerCtx.putImageData(colorizePolicyLayer(reduced, spec, stack.nlat, stack.nlon), 0, 0);
        compositeCtx.drawImage(layerCanvas, 0, 0);
    });

    ctx.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in ctx) {
        ctx.imageSmoothingQuality = 'high';
    }
    ctx.globalAlpha = POLICY_OVERLAY_ALPHA;
    ctx.drawImage(composite, srcX, srcY, srcW, srcH, destLeft, destTop, destWidth, destHeight);
    ctx.globalAlpha = 1;
}

function schedulePolicyOverlays() {
    if (policyOverlayRaf) {
        window.cancelAnimationFrame(policyOverlayRaf);
    }
    policyOverlayRaf = window.requestAnimationFrame(() => {
        policyOverlayRaf = 0;
        if (!isPolicyCategory()) {
            ['topLeft', 'bottomLeft', 'topRight', 'bottomRight'].forEach((panel) => {
                const canvas = getPolicyOverlayCanvas(panel);
                canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
            });
            return;
        }
        paintPolicyOverlay('topLeft', 'gfs');
        paintPolicyOverlay('bottomLeft', 'icon');
    });
}

function frameIndexForHour(hour, mode = 'exact') {
    const framePairs = getCurrentFramePairs();
    const target = Number(hour);
    const exact = framePairs.findIndex((pair) => Number(pair?.hour) === target);
    if (exact >= 0) {
        return exact + 1;
    }
    if (mode === 'start') {
        const index = framePairs.findIndex((pair) => Number(pair?.hour) >= target);
        return index >= 0 ? index + 1 : null;
    }
    if (mode === 'end') {
        for (let index = framePairs.length - 1; index >= 0; index -= 1) {
            if (Number(framePairs[index]?.hour) <= target) {
                return index + 1;
            }
        }
        return null;
    }
    return null;
}

function getPolicyRunInitDate() {
    const categoryMap = frameManifest?.domains?.[currentDomain]?.categories || {};
    const preferred = ['BG', 'TS', 'Airmass', 'Turbulence', currentCategory];
    const seen = new Set();
    for (const category of preferred) {
        if (!category || seen.has(category)) {
            continue;
        }
        seen.add(category);
        const framePairs = categoryMap[category] || framePairsCache[currentDomain]?.[category] || [];
        for (const framePair of framePairs) {
            for (const path of getFrameImagePaths(framePair)) {
                const initDate = parseValidDateFromFramePath(path);
                if (initDate) {
                    return initDate;
                }
            }
        }
    }
    return null;
}

function formatPolicyDdhh(dateValue) {
    if (!(dateValue instanceof Date) || Number.isNaN(dateValue.getTime())) {
        return null;
    }
    const day = String(dateValue.getUTCDate()).padStart(2, '0');
    const hour = String(dateValue.getUTCHours()).padStart(2, '0');
    return `${day}${hour}`;
}

function getPolicyPeriodWindows(initDate) {
    const hour = initDate instanceof Date && !Number.isNaN(initDate.getTime())
        ? initDate.getUTCHours()
        : 0;
    if (hour === 6 || hour === 18) {
        return [
            { startHour: 11, endHour: 29 },
            { startHour: 23, endHour: 41 },
        ];
    }
    return [
        { startHour: 17, endHour: 35 },
        { startHour: 29, endHour: 47 },
    ];
}

function updatePolicyPresetLabels() {
    const initDate = getPolicyRunInitDate();
    const windows = getPolicyPeriodWindows(initDate);
    policyPresets?.querySelectorAll('.policy-preset-btn').forEach((button, index) => {
        const periodIndex = Number(button.getAttribute('data-period-index'));
        const window = windows[Number.isFinite(periodIndex) ? periodIndex : index];
        if (!window) {
            button.textContent = `-- to --Z`;
            return;
        }
        button.setAttribute('data-start-hour', String(window.startHour));
        button.setAttribute('data-end-hour', String(window.endHour));
        if (!initDate) {
            button.textContent = `-- to --Z`;
            button.title = `+${window.startHour} to +${window.endHour}`;
            return;
        }
        const startStamp = formatPolicyDdhh(new Date(initDate.getTime() + (window.startHour * 60 * 60 * 1000)));
        const endStamp = formatPolicyDdhh(new Date(initDate.getTime() + (window.endHour * 60 * 60 * 1000)));
        button.textContent = `${startStamp} to ${endStamp}Z`;
        button.title = `+${window.startHour} to +${window.endHour}`;
    });
    syncPolicyPresetActiveState();
}

function applyPolicyPreset(startHour, endHour) {
    const startIndex = frameIndexForHour(startHour, 'start');
    const endIndex = frameIndexForHour(endHour, 'end');
    if (!startIndex || !endIndex) {
        return;
    }
    selectedRangeStart = Math.min(startIndex, endIndex);
    selectedRangeEnd = Math.max(startIndex, endIndex);
    if (frameRangeStartSlider) frameRangeStartSlider.value = selectedRangeStart;
    if (frameRangeEndSlider) frameRangeEndSlider.value = selectedRangeEnd;
    currentFrame = isPolicyCategory()
        ? selectedRangeEnd
        : clampFrameToSelectedRange(currentFrame);
    if (frameSlider) frameSlider.value = currentFrame;
    updateSelectedRangeHighlight();
    updateRangeTimeDisplay();
    updateImages();
}

function syncPolicyPresetActiveState() {
    policyPresets?.querySelectorAll('.policy-preset-btn[data-start-hour]').forEach((button) => {
        const startIndex = frameIndexForHour(Number(button.getAttribute('data-start-hour')), 'start');
        const endIndex = frameIndexForHour(Number(button.getAttribute('data-end-hour')), 'end');
        const active = Boolean(startIndex && endIndex
            && startIndex === selectedRangeStart
            && endIndex === selectedRangeEnd);
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
}

function normalizePolicyLayerOrder(order) {
    const seen = new Set();
    const next = [];
    (Array.isArray(order) ? order : []).forEach((id) => {
        const mapped = id === 'shear_lee' ? ['shear', 'lee'] : [id];
        mapped.forEach((layerId) => {
            if (DEFAULT_POLICY_LAYER_ORDER.includes(layerId) && !seen.has(layerId)) {
                seen.add(layerId);
                next.push(layerId);
            }
        });
    });
    DEFAULT_POLICY_LAYER_ORDER.forEach((id) => {
        if (!seen.has(id)) {
            next.push(id);
        }
    });
    return next;
}

function getOrderedPolicyLayerSpecs() {
    const byId = new Map(POLICY_LAYER_RENDER.map((spec) => [spec.id, spec]));
    return normalizePolicyLayerOrder(policyLayerOrder).map((id) => byId.get(id)).filter(Boolean);
}

function getPolicyLegendFields() {
    const fallback = FALLBACK_LEGENDS.Policy?.left?.fields || [];
    const config = getLegendConfigForCategory('Policy');
    const manifestFields = config?.left?.fields || [];
    const byId = new Map();
    [...manifestFields, ...fallback].forEach((field) => {
        if (!field?.id || EXCLUDED_LEGEND_FIELD_IDS.has(field.id)) {
            return;
        }
        byId.set(field.id, { ...byId.get(field.id), ...field });
    });
    return normalizePolicyLayerOrder(policyLayerOrder).map((id) => byId.get(id)).filter(Boolean);
}

function setPolicyLayerOrder(order, { persist = true } = {}) {
    policyLayerOrder = normalizePolicyLayerOrder(order);
    if (persist) {
        saveLegendPreferences();
    }
    renderPolicyLayerList();
    renderLegend();
    schedulePolicyOverlays();
}

function movePolicyLayer(layerId, delta) {
    const order = normalizePolicyLayerOrder(policyLayerOrder);
    const from = order.indexOf(layerId);
    if (from < 0) {
        return;
    }
    const to = Math.max(0, Math.min(order.length - 1, from + delta));
    if (to === from) {
        return;
    }
    order.splice(from, 1);
    order.splice(to, 0, layerId);
    setPolicyLayerOrder(order);
}

let policyLayerDrag = null;

function clearPolicyLayerDragStyle(button) {
    if (!button) {
        return;
    }
    button.classList.remove('is-dragging');
    button.style.position = '';
    button.style.left = '';
    button.style.top = '';
    button.style.width = '';
    button.style.height = '';
    button.style.zIndex = '';
}

function stopPolicyLayerDragListeners() {
    window.removeEventListener('pointermove', onPolicyLayerPointerMove);
    window.removeEventListener('pointerup', onPolicyLayerPointerUp);
    window.removeEventListener('pointercancel', onPolicyLayerPointerUp);
}

function finishPolicyLayerDrag() {
    const drag = policyLayerDrag;
    policyLayerDrag = null;
    document.body.classList.remove('policy-layer-dragging');
    stopPolicyLayerDragListeners();
    if (!drag) {
        return;
    }
    if (drag.button?.hasPointerCapture?.(drag.pointerId)) {
        drag.button.releasePointerCapture(drag.pointerId);
    }
    const order = [];
    if (drag.moved && policyLayersList) {
        [...policyLayersList.children].forEach((node) => {
            if (node === drag.button) {
                return;
            }
            if (node === drag.placeholder) {
                order.push(drag.layerId);
                return;
            }
            if (node.dataset.layerId) {
                order.push(node.dataset.layerId);
            }
        });
    }
    drag.placeholder?.remove();
    clearPolicyLayerDragStyle(drag.button);
    if (drag.moved) {
        setPolicyLayerOrder(order);
        return;
    }
    const hidden = getFieldHiddenState('Policy', 'left', drag.layerId);
    setFieldHiddenState('Policy', 'left', drag.layerId, !hidden);
    saveLegendPreferences();
    renderPolicyLayerList();
    renderLegend();
    schedulePolicyOverlays();
}

function updatePolicyLayerPlaceholder(clientY) {
    const drag = policyLayerDrag;
    if (!drag?.placeholder || !policyLayersList) {
        return;
    }
    const others = [...policyLayersList.querySelectorAll('.policy-layer-toggle')].filter((node) => node !== drag.button);
    let insertBefore = null;
    others.forEach((node) => {
        if (insertBefore) {
            return;
        }
        const rect = node.getBoundingClientRect();
        if (clientY < rect.top + rect.height / 2) {
            insertBefore = node;
        }
    });
    if (insertBefore) {
        policyLayersList.insertBefore(drag.placeholder, insertBefore);
    } else {
        policyLayersList.appendChild(drag.placeholder);
    }
}

function beginPolicyLayerDrag(event) {
    const drag = policyLayerDrag;
    if (!drag || drag.moved) {
        return;
    }
    drag.moved = true;
    document.body.classList.add('policy-layer-dragging');
    const rect = drag.button.getBoundingClientRect();
    drag.offsetX = event.clientX - rect.left;
    drag.offsetY = event.clientY - rect.top;
    const placeholder = document.createElement('div');
    placeholder.className = 'policy-layer-placeholder';
    placeholder.setAttribute('aria-hidden', 'true');
    placeholder.style.height = `${rect.height}px`;
    drag.placeholder = placeholder;
    policyLayersList.insertBefore(placeholder, drag.button);
    drag.button.classList.add('is-dragging');
    drag.button.style.width = `${rect.width}px`;
    drag.button.style.height = `${rect.height}px`;
    drag.button.style.left = `${rect.left}px`;
    drag.button.style.top = `${rect.top}px`;
    try {
        drag.button.setPointerCapture(event.pointerId);
    } catch (error) {
        // Pointer capture is optional; window listeners still track the drag.
    }
}

function onPolicyLayerPointerMove(event) {
    const drag = policyLayerDrag;
    if (!drag || event.pointerId !== drag.pointerId) {
        return;
    }
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < POLICY_LAYER_DRAG_THRESHOLD) {
        return;
    }
    if (!drag.moved) {
        beginPolicyLayerDrag(event);
    }
    event.preventDefault();
    drag.button.style.left = `${event.clientX - drag.offsetX}px`;
    drag.button.style.top = `${event.clientY - drag.offsetY}px`;
    updatePolicyLayerPlaceholder(event.clientY);
}

function onPolicyLayerPointerUp(event) {
    if (!policyLayerDrag || event.pointerId !== policyLayerDrag.pointerId) {
        return;
    }
    finishPolicyLayerDrag();
}

function onPolicyLayerPointerDown(event) {
    if (event.button !== 0 && event.pointerType !== 'touch') {
        return;
    }
    const button = event.target.closest('.policy-layer-toggle');
    if (!button || !policyLayersList?.contains(button) || button.disabled) {
        return;
    }
    if (policyLayerDrag) {
        finishPolicyLayerDrag();
    }
    policyLayerDrag = {
        pointerId: event.pointerId,
        button,
        layerId: button.dataset.layerId,
        startX: event.clientX,
        startY: event.clientY,
        offsetX: 0,
        offsetY: 0,
        moved: false,
        placeholder: null,
    };
    window.addEventListener('pointermove', onPolicyLayerPointerMove);
    window.addEventListener('pointerup', onPolicyLayerPointerUp);
    window.addEventListener('pointercancel', onPolicyLayerPointerUp);
}

function onPolicyLayerKeyDown(event) {
    const button = event.target.closest('.policy-layer-toggle');
    if (!button || !policyLayersList?.contains(button)) {
        return;
    }
    if (event.key === 'ArrowUp') {
        event.preventDefault();
        movePolicyLayer(button.dataset.layerId, -1);
        policyLayersList.querySelector(`[data-layer-id="${button.dataset.layerId}"]`)?.focus();
    } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        movePolicyLayer(button.dataset.layerId, 1);
        policyLayersList.querySelector(`[data-layer-id="${button.dataset.layerId}"]`)?.focus();
    } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        const hidden = getFieldHiddenState('Policy', 'left', button.dataset.layerId);
        setFieldHiddenState('Policy', 'left', button.dataset.layerId, !hidden);
        saveLegendPreferences();
        renderPolicyLayerList();
        renderLegend();
        schedulePolicyOverlays();
        policyLayersList.querySelector(`[data-layer-id="${button.dataset.layerId}"]`)?.focus();
    }
}

function bindPolicyLayerListEvents() {
    if (!policyLayersList || policyLayersList.dataset.bound === '1') {
        return;
    }
    policyLayersList.dataset.bound = '1';
    policyLayersList.addEventListener('pointerdown', onPolicyLayerPointerDown);
    policyLayersList.addEventListener('keydown', onPolicyLayerKeyDown);
}

function renderPolicyLayerList() {
    if (!policyLayersList) {
        return;
    }

    bindPolicyLayerListEvents();
    policyLayersList.innerHTML = '';
    if (!isPolicyCategory()) {
        return;
    }

    getPolicyLegendFields().forEach((field) => {
        const hidden = getFieldHiddenState('Policy', 'left', field.id);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `policy-layer-toggle${hidden ? ' is-off' : ''}`;
        button.dataset.layerId = field.id;
        button.setAttribute('aria-pressed', hidden ? 'false' : 'true');
        button.setAttribute(
            'aria-label',
            `${formatLegendLabel(field.label || field.id)}. Click to ${hidden ? 'show' : 'hide'}, drag to reorder.`,
        );
        button.title = 'Click to show or hide. Drag to change stacking order.';
        button.draggable = false;
        const grip = document.createElement('span');
        grip.className = 'policy-layer-grip';
        grip.setAttribute('aria-hidden', 'true');
        button.appendChild(grip);
        appendFieldSwatch(button, field);
        const label = document.createElement('span');
        label.className = 'legend-field-toggle-label';
        label.textContent = formatLegendLabel(field.label || field.id);
        button.appendChild(label);
        policyLayersList.appendChild(button);
    });
}

function syncPolicyMode() {
    const enabled = isPolicyCategory();
    document.body.classList.toggle('policy-mode', enabled);
    window.SoundingViewer?.setToolsAvailable?.(!enabled);
    updatePolicyPresetLabels();
    renderPolicyLayerList();
    if (playBtn) {
        playBtn.disabled = enabled;
        playBtn.title = enabled ? 'Playback is not used on Policy maps' : '';
        if (enabled) {
            stopAnimation();
        }
    }
    if (enabled) {
        currentFrame = selectedRangeEnd;
        if (frameSlider) {
            frameSlider.value = currentFrame;
        }
        requestAnimationFrame(schedulePolicyOverlays);
    }
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
        Object.values(mapImagesByPanel).forEach((img) => {
            if (!img) {
                return;
            }
            img.removeAttribute('src');
            img.removeAttribute('alt');
            img.classList.remove('error', 'loaded');
        });
        updateCurrentTimestepDisplay();
        updateMapTableChrome();
        schedulePolicyOverlays();
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
            // Pair: GFS on top row, ICON on bottom row (single product column).
            { panel: 'topLeft', path: framePair.leftPath || framePair.topLeftPath, title: config.topLeft?.title || config.left?.title },
            { panel: 'bottomLeft', path: framePair.rightPath || framePair.bottomLeftPath, title: config.bottomLeft?.title || config.right?.title },
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
        [rightImage, bottomRightImage].forEach((img) => {
            if (!img) return;
            img.removeAttribute('src');
            img.classList.remove('error');
        });
    }

    updateCurrentTimestepDisplay(framePair);
    updateMapTableChrome(framePair);
    schedulePolicyOverlays();

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

function getMapDomainIds() {
    const fromManifest = frameManifest?.domainOrder;
    if (Array.isArray(fromManifest) && fromManifest.length > 0) {
        return fromManifest;
    }
    return Array.from(new Set(Object.values(domainHotkeys)));
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

function preferredDomainForLonLat(lon, lat) {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
        return null;
    }
    const domainIds = Array.from(new Set(Object.values(domainHotkeys)));
    const containing = domainIds.filter((id) => isLonLatInDomain(lon, lat, id));
    if (!containing.length) {
        return null;
    }
    const regional = containing.filter((id) => id !== 'AU');
    const candidates = regional.length ? regional : containing;
    let bestId = candidates[0];
    let bestDist = Infinity;
    candidates.forEach((id) => {
        const extent = getDomainGeoref(id)?.extent;
        if (!extent) {
            return;
        }
        const centerLon = (extent.lonMin + extent.lonMax) / 2;
        const centerLat = (extent.latMin + extent.latMax) / 2;
        const dist = ((centerLon - lon) ** 2) + ((centerLat - lat) ** 2);
        if (dist < bestDist) {
            bestDist = dist;
            bestId = id;
        }
    });
    return bestId;
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
        schedulePolicyOverlays();
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
    // Rows are models: GFS on top, ICON below (pair and quad).
    const panelEl = img?.closest?.('.image-panel') || img;
    const row = panelEl?.getAttribute?.('data-row') || img?.getAttribute?.('data-row');
    if (row === '1') {
        return 'icon';
    }
    const panel = img?.getAttribute?.('data-panel') || panelEl?.getAttribute?.('data-panel');
    if (panel === 'bottomLeft' || panel === 'bottomRight') {
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
    getDomainIds: getMapDomainIds,
    isLonLatInDomain,
    preferredDomainForLonLat,
};

function startAnimation() {
    if (isPolicyCategory() || animationInterval) {
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
    if (isPolicyCategory()) {
        await ensurePolicyStacks();
    }
    setMaxFramesForCurrentSelection();
    syncPolicyMode();
    updatePolicyPresetLabels();
    updateImages();
    renderLegend();
}

async function loadSelectionCovered() {
    const token = beginMapSwapLoading();
    try {
        await loadSelection();
        await waitForVisibleMapsReady();
    } finally {
        endMapSwapLoading(token);
        if (isPolicyCategory()) {
            schedulePolicyOverlays();
        }
    }
}

async function switchCategory(category) {
    if (category === currentCategory) {
        return;
    }

    const shouldResume = isPlaying;
    pauseAnimationClock();

    categoryButtons.forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-category') === category);
    });

    currentCategory = category;
    if (mobileCategorySelect) mobileCategorySelect.value = category;
    clearAxisMaximize();
    syncPolicyMode();
    syncImagePairLayout();
    try {
        await loadSelectionCovered();
        syncAxisMaximizeButtons();
    } finally {
        resumeAnimationIfNeeded(shouldResume);
    }
}

async function switchDomain(domainId) {
    if (domainId === currentDomain) {
        return;
    }

    const shouldResume = isPlaying;
    pauseAnimationClock();

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
    try {
        await loadSelectionCovered();

        if (keepSounding) {
            requestAnimationFrame(() => {
                window.SoundingViewer?.syncPin?.();
            });
        }
    } finally {
        resumeAnimationIfNeeded(shouldResume);
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

    policyPresets?.querySelectorAll('.policy-preset-btn').forEach((button) => {
        button.addEventListener('click', function() {
            applyPolicyPreset(
                Number(this.getAttribute('data-start-hour')),
                Number(this.getAttribute('data-end-hour')),
            );
        });
    });

    window.addEventListener('resize', schedulePolicyOverlays);

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
        if (isPolicyCategory()) {
            return;
        }
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

    infoTabControls?.addEventListener('click', function() {
        setInfoTab('controls');
    });

    infoTabLayers?.addEventListener('click', function() {
        setInfoTab('layers');
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

    legendHelpBtn?.addEventListener('click', function() {
        openInfoModal('layers');
    });

    Object.values(mapImagesByPanel).forEach((img) => {
        if (!img) return;
        img.addEventListener('load', function() {
        this.classList.add('loaded');
            window.SoundingViewer?.syncPin?.();
            schedulePolicyOverlays();
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
            if (this.disabled) {
                return;
            }
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
        const isProfileSelect = target?.id === 'sounding-location-select'
            || target?.id === 'sounding-model-select';
        // Profile selects stay focused after a choice and swallow letter keys.
        // Release them so map / tool shortcuts work without an extra click.
        if (isProfileSelect) {
            target.blur();
            if (event.key === 'Escape') {
                event.preventDefault();
                return;
            }
        } else if (tagName === 'input' || tagName === 'select' || tagName === 'textarea' || target?.isContentEditable) {
            return;
        }

        if (isInfoModalOpen()) {
            if (event.key === 'Escape' || event.key.toLowerCase() === 'i') {
                closeInfoModal();
                event.preventDefault();
                return;
            }
            if (event.key === ' ' || event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key in domainHotkeys || event.key.toLowerCase() in categoryHotkeys) {
                event.preventDefault();
            }
            return;
        }

        if (event.key.toLowerCase() === 't' && event.shiftKey) {
            if (!isPolicyCategory()) {
                window.SoundingViewer?.toggleTool?.('table');
            }
                event.preventDefault();
            return;
        }

        const profileToolHotkeys = {
            s: 'sonde',
            h: 'hodograph',
        };
        const profileToolId = profileToolHotkeys[event.key.toLowerCase()];
        if (profileToolId && !event.shiftKey && window.SoundingViewer?.toggleTool) {
            if (!isPolicyCategory()) {
                window.SoundingViewer.toggleTool(profileToolId);
            }
            event.preventDefault();
            return;
        }

        if (window.SoundingViewer?.isHelpOpen?.() && event.key === 'Escape') {
            window.SoundingViewer.closeHelp();
                event.preventDefault();
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
        if (lowerKey === 'i') {
            openInfoModal();
            event.preventDefault();
            return;
        }

        if (lowerKey in categoryHotkeys) {
            switchCategory(categoryHotkeys[lowerKey]);
            event.preventDefault();
            return;
        }

        switch (event.key) {
            case 'ArrowLeft':
                if (isPolicyCategory()) {
                    if (selectedRangeEnd > selectedRangeStart) {
                        updateRangeEndValue(selectedRangeEnd - 1);
                    }
                } else if (currentFrame > selectedRangeStart) {
                    currentFrame -= 1;
                    frameSlider.value = currentFrame;
                    updateImages();
                }
                event.preventDefault();
                break;
            case 'ArrowRight':
                if (isPolicyCategory()) {
                    if (selectedRangeEnd < maxFrames) {
                        updateRangeEndValue(selectedRangeEnd + 1);
                    }
                } else if (currentFrame < selectedRangeEnd) {
                    currentFrame += 1;
                    frameSlider.value = currentFrame;
                    updateImages();
                }
                event.preventDefault();
                break;
            case ' ':
                if (!isPolicyCategory()) {
                if (isPlaying) {
                    stopAnimation();
                } else {
                    startAnimation();
                    }
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
            return preloadCurrentSelection();
        })
        .catch(error => {
            console.warn('Failed to initialize category data:', error);
        })
        .finally(() => {
            hideLoadingOverlay();
            updateViewerBottomOffset();
            preloadRemainingInBackground().catch(error => {
                console.warn('Failed to preload remaining map images:', error);
            });
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
    switchDomain,
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
    getValidTime: () => getValidDateForFramePair(getCurrentFramePairs()[currentFrame - 1]),
    clearAxisMaximize,
    isAnimationPlaying: () => isPlaying
};
