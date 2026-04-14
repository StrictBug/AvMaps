const imageConfig = {
    Airmass: {
        left: { folder: 'FZL', title: 'FZL' },
        right: { folder: 'Snow level', title: 'Snow Level' }
    },
    BG: {
        left: { folder: 'US', title: 'US' },
        right: { folder: 'ICON', title: 'ICON' }
    },
    TS: {
        left: { folder: 'Flash density', title: 'Flash Density' },
        right: { folder: 'Severe storm potential', title: 'Severe Storm Potential' }
    },
    Turb: {
        left: { folder: 'MTW', title: 'MTW' },
        right: { folder: 'Wind', title: 'Wind' }
    }
};

const domainHotkeys = {
    '1': 'AU',
    '2': 'WA_SA',
    '3': 'VIC_TAS',
    '4': 'NSW'
};

const categoryHotkeys = {
    b: 'BG',
    s: 'TS',
    a: 'Airmass',
    t: 'Turb'
};

let currentCategory = 'BG';
let currentDomain = 'AU';
let currentFrame = 1;
const DEFAULT_MAX_FRAMES = 40;
let maxFrames = DEFAULT_MAX_FRAMES;
let isPlaying = false;
let animationInterval = null;
let animationSpeed = 500;
let frameManifest = null;
const framePairsCache = {};

let frameSlider;
let leftImage;
let rightImage;
let playBtn;
let speedSlider;
let speedDisplay;
let categoryButtons;
let loadingOverlay;
let loadingBarFill;
let loadingStatus;

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
        domains: normalizedDomains
    };
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
    currentFrame = Math.min(currentFrame, maxFrames);
    frameSlider.value = currentFrame;
}

function initializeElements() {
    frameSlider = document.getElementById('frame-slider');
    leftImage = document.getElementById('left-image');
    rightImage = document.getElementById('right-image');
    playBtn = document.getElementById('play-btn');
    speedSlider = document.getElementById('speed-slider');
    speedDisplay = document.getElementById('speed-display');
    categoryButtons = document.querySelectorAll('.category-btn');
    loadingOverlay = document.getElementById('loading-overlay');
    loadingBarFill = document.getElementById('loading-bar-fill');
    loadingStatus = document.getElementById('loading-status');
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

async function preloadAllFrames() {
    const domainIds = Array.from(new Set(Object.values(domainHotkeys)));
    const sources = [];

    for (const domainId of domainIds) {
        for (const category of Object.keys(imageConfig)) {
            const framePairs = await loadCategoryFrames(domainId, category);
            framePairs.forEach(framePair => {
                sources.push(framePair.leftPath, framePair.rightPath);
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
}

function updateImages() {
    const config = imageConfig[currentCategory];
    if (!config) {
        return;
    }

    const framePairs = getCurrentFramePairs();
    if (framePairs.length === 0) {
        console.warn(`No ${currentCategory} frames available for domain ${currentDomain}.`);
        return;
    }

    const framePair = framePairs[currentFrame - 1];
    if (!framePair) {
        console.warn(`No ${currentCategory} frame available for domain ${currentDomain} at index ${currentFrame}.`);
        return;
    }

    leftImage.classList.remove('error');
    rightImage.classList.remove('error');

    leftImage.src = framePair.leftPath;
    rightImage.src = framePair.rightPath;
    leftImage.alt = `${config.left.title} - Hour ${framePair.hour}`;
    rightImage.alt = `${config.right.title} - Hour ${framePair.hour}`;
}

function startAnimation() {
    if (animationInterval) {
        return;
    }

    isPlaying = true;
    playBtn.textContent = '⏸ Pause';

    animationInterval = setInterval(() => {
        currentFrame += 1;
        if (currentFrame > maxFrames) {
            currentFrame = 1;
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
    await loadSelection(true);

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

    currentDomain = domainId;
    await loadSelection(true);

    if (wasPlaying) {
        startAnimation();
    }
}

async function preloadImages(domainId, category) {
    const framePairs = await loadCategoryFrames(domainId, category);
    framePairs.forEach(framePair => {
        const leftImg = new Image();
        leftImg.src = framePair.leftPath;

        const rightImg = new Image();
        rightImg.src = framePair.rightPath;
    });
}

function setupEventListeners() {
    frameSlider.addEventListener('input', function() {
        currentFrame = parseInt(this.value, 10);
        updateImages();
    });

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

    leftImage.addEventListener('load', function() {
        this.classList.add('loaded');
    });

    rightImage.addEventListener('load', function() {
        this.classList.add('loaded');
    });

    leftImage.addEventListener('error', function() {
        this.classList.add('error');
        console.warn(`Failed to load left image: ${this.src}`);
    });

    rightImage.addEventListener('error', function() {
        this.classList.add('error');
        console.warn(`Failed to load right image: ${this.src}`);
    });

    document.addEventListener('keydown', function(event) {
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
                if (currentFrame > 1) {
                    currentFrame -= 1;
                    frameSlider.value = currentFrame;
                    updateImages();
                }
                event.preventDefault();
                break;
            case 'ArrowRight':
                if (currentFrame < maxFrames) {
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
    initializeElements();
    setupEventListeners();
    setLoadingProgress(0, 0);
    loadSelection()
        .then(() => {
            updateImages();
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
        });
});

window.addEventListener('resize', function() {
    updateImages();
});

window.AnimationController = {
    switchCategory,
    startAnimation,
    stopAnimation,
    setFrame(frame) {
        if (frame >= 1 && frame <= maxFrames) {
            currentFrame = frame;
            frameSlider.value = currentFrame;
            updateImages();
        }
    },
    getCurrentFrame: () => currentFrame,
    getCurrentCategory: () => currentCategory,
    getCurrentDomain: () => currentDomain,
    isAnimationPlaying: () => isPlaying
};
