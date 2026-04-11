// Configuration object defining image categories and their subfolder pairs
const imageConfig = {
    'Airmass': {
        left: { folder: 'FZL', title: 'FZL', prefix: 'AIRMASSFZL', extension: 'png' },
        right: { folder: 'Snow level', title: 'Snow Level', prefix: 'AIRMASSSL', extension: 'png' }
    },
    'BG': {
        left: { folder: 'US', title: 'US', prefix: '' },
        right: { folder: 'ICON', title: 'ICON', prefix: '' }
    },
    'TS': {
        left: { folder: 'Flash density', title: 'Flash Density', prefix: '' },
        right: { folder: 'Severe storm potential', title: 'Severe Storm Potential', prefix: '' }
    },
    'Turb': {
        left: { folder: 'MTW', title: 'MTW', prefix: '' },
        right: { folder: 'Wind', title: 'Wind', prefix: '' }
    }
};

// Global variables
let currentCategory = 'BG';
let currentFrame = 1;
const DEFAULT_MAX_FRAMES = 27;
let maxFrames = DEFAULT_MAX_FRAMES;
let isPlaying = false;
let animationInterval = null;
let animationSpeed = 500; // milliseconds
let bgFramePairs = [];
let tsFramePairs = [];
let airmassFramePairs = [];
let turbFramePairs = [];

// DOM elements
let frameSlider, leftImage, rightImage;
let playBtn, speedSlider, speedDisplay;
let categoryButtons;

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeElements();
    setupEventListeners();
    loadCategory(currentCategory)
        .then(() => {
            updateImages();
        })
        .catch(error => {
            console.warn('Failed to initialize category data:', error);
            updateImages();
        });
});

function extractBgHourFromFilename(filename) {
    const hourMatch = filename.match(/_(\d{2,3})\.[^.]+$/i);
    if (!hourMatch) return null;
    return parseInt(hourMatch[1], 10);
}

async function discoverBgFramesForDirectory(directoryPath) {
    const response = await fetch(`${directoryPath}/`);
    if (!response.ok) {
        throw new Error(`Unable to read ${directoryPath} directory: ${response.status}`);
    }

    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const links = Array.from(doc.querySelectorAll('a'));

    const frameInfo = links
        .map(link => {
            const href = link.getAttribute('href') || '';
            const filename = decodeURIComponent(href.split('/').pop().split('?')[0]);
            const hour = extractBgHourFromFilename(filename);
            return { filename, hour };
        })
        .filter(entry => /\.(png|jpg|jpeg|webp)$/i.test(entry.filename) && entry.hour !== null)
        .sort((a, b) => a.hour - b.hour)
        .map(entry => ({
            hour: entry.hour,
            path: `${directoryPath}/${entry.filename}`
        }));

    if (frameInfo.length === 0) {
        throw new Error(`No BG images found in ${directoryPath} directory`);
    }

    return frameInfo;
}

function buildFramePairs(leftFrames, rightFrames, errorMessage) {
    const leftByHour = new Map(leftFrames.map(frame => [frame.hour, frame.path]));
    const rightByHour = new Map(rightFrames.map(frame => [frame.hour, frame.path]));

    const commonHours = Array.from(leftByHour.keys())
        .filter(hour => rightByHour.has(hour))
        .sort((a, b) => a - b);

    const framePairs = commonHours.map(hour => ({
        hour,
        leftPath: leftByHour.get(hour),
        rightPath: rightByHour.get(hour)
    }));

    if (framePairs.length === 0) {
        throw new Error(errorMessage);
    }

    return framePairs;
}

async function discoverFramePairs(leftDirectory, rightDirectory, errorMessage) {
    const [leftFrames, rightFrames] = await Promise.all([
        discoverBgFramesForDirectory(leftDirectory),
        discoverBgFramesForDirectory(rightDirectory)
    ]);

    return buildFramePairs(leftFrames, rightFrames, errorMessage);
}

async function discoverBgFrames() {
    return discoverFramePairs('images/BG/US', 'images/BG/ICON', 'No overlapping BG US/ICON frame hours found');
}

async function discoverTsFrames() {
    return discoverFramePairs('images/TS/Flash density', 'images/TS/Severe storm potential', 'No overlapping TS flash/severe frame hours found');
}

async function ensureBgFramesLoaded(forceRefresh = false) {
    if (forceRefresh || bgFramePairs.length === 0) {
        bgFramePairs = await discoverBgFrames();
    }
    return bgFramePairs;
}

async function ensureTsFramesLoaded(forceRefresh = false) {
    if (forceRefresh || tsFramePairs.length === 0) {
        tsFramePairs = await discoverTsFrames();
    }
    return tsFramePairs;
}

async function discoverAirmassFrames() {
    return discoverFramePairs('images/Airmass/FZL', 'images/Airmass/Snow level', 'No overlapping Airmass FZL/Snow frame hours found');
}

async function ensureAirmassFramesLoaded(forceRefresh = false) {
    if (forceRefresh || airmassFramePairs.length === 0) {
        airmassFramePairs = await discoverAirmassFrames();
    }
    return airmassFramePairs;
}

async function discoverTurbFrames() {
    return discoverFramePairs('images/Turb/MTW', 'images/Turb/Wind', 'No overlapping Turb MTW/Wind frame hours found');
}

async function ensureTurbFramesLoaded(forceRefresh = false) {
    if (forceRefresh || turbFramePairs.length === 0) {
        turbFramePairs = await discoverTurbFrames();
    }
    return turbFramePairs;
}

function getFramePairsForCategory(category) {
    if (category === 'BG') return bgFramePairs;
    if (category === 'TS') return tsFramePairs;
    if (category === 'Airmass') return airmassFramePairs;
    if (category === 'Turb') return turbFramePairs;
    return [];
}

function setMaxFramesForCategory(category) {
    const framePairs = getFramePairsForCategory(category);
    maxFrames = framePairs.length > 0 ? framePairs.length : DEFAULT_MAX_FRAMES;

    frameSlider.max = maxFrames;
    currentFrame = Math.min(currentFrame, maxFrames);
    frameSlider.value = currentFrame;
}

function initializeElements() {
    // Get references to DOM elements
    frameSlider = document.getElementById('frame-slider');
    leftImage = document.getElementById('left-image');
    rightImage = document.getElementById('right-image');
    playBtn = document.getElementById('play-btn');
    speedSlider = document.getElementById('speed-slider');
    speedDisplay = document.getElementById('speed-display');
    categoryButtons = document.querySelectorAll('.category-btn');
}

function getPanelExtension(panelConfig) {
    return panelConfig.extension || 'jpeg';
}

function setupEventListeners() {
    // Frame slider event listener
    frameSlider.addEventListener('input', function() {
        currentFrame = parseInt(this.value);
        updateImages();
    });

    // Play/Pause button event listener
    playBtn.addEventListener('click', function() {
        if (!isPlaying) {
            startAnimation();
        } else {
            stopAnimation();
        }
    });

    // Speed slider event listener
    speedSlider.addEventListener('input', function() {
        animationSpeed = parseInt(this.value);
        speedDisplay.textContent = animationSpeed + 'ms';
        
        // If animation is playing, restart with new speed
        if (isPlaying) {
            stopAnimation();
            startAnimation();
        }
    });

    // Category button event listeners
    categoryButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const category = this.getAttribute('data-category');
            switchCategory(category);
        });
    });

    // Image load event listeners for smooth transitions
    leftImage.addEventListener('load', function() {
        this.classList.add('loaded');
    });

    rightImage.addEventListener('load', function() {
        this.classList.add('loaded');
    });

    // Image error event listeners
    leftImage.addEventListener('error', function() {
        this.classList.add('error');
        console.warn(`Failed to load left image: ${this.src}`);
    });

    rightImage.addEventListener('error', function() {
        this.classList.add('error');
        console.warn(`Failed to load right image: ${this.src}`);
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        switch(e.key) {
            case 'ArrowLeft':
                if (currentFrame > 1) {
                    currentFrame--;
                    frameSlider.value = currentFrame;
                    updateImages();
                }
                e.preventDefault();
                break;
            case 'ArrowRight':
                if (currentFrame < maxFrames) {
                    currentFrame++;
                    frameSlider.value = currentFrame;
                    updateImages();
                }
                e.preventDefault();
                break;
            case ' ':
                if (isPlaying) {
                    stopAnimation();
                } else {
                    startAnimation();
                }
                e.preventDefault();
                break;
        }
    });
}

async function switchCategory(category) {
    if (category === currentCategory) return;
    
    // Remember if animation was playing
    const wasPlaying = isPlaying;
    
    // Temporarily stop animation if playing (but don't change button text)
    if (isPlaying) {
        if (animationInterval) {
            clearInterval(animationInterval);
            animationInterval = null;
        }
    }
    
    // Update active button
    categoryButtons.forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-category') === category) {
            btn.classList.add('active');
        }
    });
    
    currentCategory = category;
    await loadCategory(category);
    updateImages();
    
    // Resume animation if it was playing before
    if (wasPlaying) {
        animationInterval = setInterval(() => {
            currentFrame++;
            if (currentFrame > maxFrames) {
                currentFrame = 1; // Loop back to beginning
            }
            
            frameSlider.value = currentFrame;
            updateImages();
        }, animationSpeed);
    }
}

async function loadCategory(category) {
    const config = imageConfig[category];
    if (!config) {
        console.error(`Category ${category} not found in configuration`);
        return;
    }

    if (category === 'BG') {
        try {
            await ensureBgFramesLoaded(true);
        } catch (error) {
            console.warn('Could not dynamically discover BG files, using existing frame count.', error);
            bgFramePairs = [];
        }
    } else if (category === 'TS') {
        try {
            await ensureTsFramesLoaded(true);
        } catch (error) {
            console.warn('Could not dynamically discover TS files, using existing frame count.', error);
            tsFramePairs = [];
        }
    } else if (category === 'Airmass') {
        try {
            await ensureAirmassFramesLoaded(true);
        } catch (error) {
            console.warn('Could not dynamically discover Airmass FZL/Snow files, using existing frame count.', error);
            airmassFramePairs = [];
        }
    } else if (category === 'Turb') {
        try {
            await ensureTurbFramesLoaded(true);
        } catch (error) {
            console.warn('Could not dynamically discover Turb MTW/Wind files, using existing frame count.', error);
            turbFramePairs = [];
        }
    }
    
    setMaxFramesForCategory(category);
    
    // Keep current frame position - don't reset to frame 1
    // Just ensure the slider reflects the current frame
    frameSlider.value = currentFrame;
}

function updateImages() {
    const config = imageConfig[currentCategory];
    if (!config) return;

    const framePairs = getFramePairsForCategory(currentCategory);
    if (framePairs.length > 0) {
        const framePair = framePairs[currentFrame - 1];
        if (!framePair) {
            console.warn(`No ${currentCategory} frame available for index ${currentFrame}.`);
            return;
        }

        leftImage.classList.remove('error');
        rightImage.classList.remove('error');

        leftImage.src = framePair.leftPath;
        rightImage.src = framePair.rightPath;
        leftImage.alt = `${config.left.title} - Hour ${framePair.hour}`;
        rightImage.alt = `${config.right.title} - Hour ${framePair.hour}`;
        return;
    }
    
    const frameNumber = currentFrame.toString().padStart(3, '0');
    
    // Just remove error class, keep loaded class to prevent white flash
    leftImage.classList.remove('error');
    rightImage.classList.remove('error');
    
    // Update image sources
    const leftExt = getPanelExtension(config.left);
    const rightExt = getPanelExtension(config.right);
    leftImage.src = `images/${currentCategory}/${config.left.folder}/${config.left.prefix}${frameNumber}.${leftExt}`;
    rightImage.src = `images/${currentCategory}/${config.right.folder}/${config.right.prefix}${frameNumber}.${rightExt}`;
    
    leftImage.alt = `${config.left.title} - Frame ${currentFrame}`;
    rightImage.alt = `${config.right.title} - Frame ${currentFrame}`;
}

// Frame counter removed - no longer needed

function startAnimation() {
    if (isPlaying) return;
    
    isPlaying = true;
    playBtn.textContent = '⏸ Pause';
    
    animationInterval = setInterval(() => {
        currentFrame++;
        if (currentFrame > maxFrames) {
            currentFrame = 1; // Loop back to beginning
        }
        
        frameSlider.value = currentFrame;
        updateImages();
    }, animationSpeed);
}

function stopAnimation() {
    if (!isPlaying) return;
    
    isPlaying = false;
    playBtn.textContent = '▶ Play';
    
    if (animationInterval) {
        clearInterval(animationInterval);
        animationInterval = null;
    }
}

// Utility function to preload images for smoother animation
function preloadImages(category) {
    const config = imageConfig[category];
    if (!config) return;

    const framePairs = getFramePairsForCategory(category);
    if (framePairs.length > 0) {
        framePairs.forEach(framePair => {
            const leftImg = new Image();
            leftImg.src = framePair.leftPath;

            const rightImg = new Image();
            rightImg.src = framePair.rightPath;
        });
        return;
    }
    
    for (let i = 1; i <= DEFAULT_MAX_FRAMES; i++) {
        const frameNumber = i.toString().padStart(3, '0');
        const leftExt = getPanelExtension(config.left);
        const rightExt = getPanelExtension(config.right);
        
        // Preload left images
        const leftImg = new Image();
        leftImg.src = `images/${category}/${config.left.folder}/${config.left.prefix}${frameNumber}.${leftExt}`;
        
        // Preload right images
        const rightImg = new Image();
        rightImg.src = `images/${category}/${config.right.folder}/${config.right.prefix}${frameNumber}.${rightExt}`;
    }
}

// Preload images for better performance
window.addEventListener('load', async function() {
    await Promise.all([
        ensureBgFramesLoaded()
            .then(() => {
                setMaxFramesForCategory('BG');
            })
            .catch(error => {
                console.warn('Could not preload BG frames dynamically:', error);
            }),
        ensureTsFramesLoaded().catch(error => {
            console.warn('Could not preload TS frames dynamically:', error);
        }),
        ensureAirmassFramesLoaded().catch(error => {
            console.warn('Could not preload Airmass frames dynamically:', error);
        }),
        ensureTurbFramesLoaded().catch(error => {
            console.warn('Could not preload Turb frames dynamically:', error);
        })
    ]);

    // Preload images for all categories
    Object.keys(imageConfig).forEach(category => {
        preloadImages(category);
    });
});

// Handle window resize for responsive behavior
window.addEventListener('resize', function() {
    // Force image refresh to ensure proper scaling
    updateImages();
});

// Export functions for potential external use
window.AnimationController = {
    switchCategory,
    startAnimation,
    stopAnimation,
    setFrame: function(frame) {
        if (frame >= 1 && frame <= maxFrames) {
            currentFrame = frame;
            frameSlider.value = currentFrame;
            updateImages();
        }
    },
    getCurrentFrame: () => currentFrame,
    getCurrentCategory: () => currentCategory,
    isAnimationPlaying: () => isPlaying
};