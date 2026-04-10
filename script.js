// Configuration object defining image categories and their subfolder pairs
const imageConfig = {
    'Airmass': {
        left: { folder: 'FZL', title: 'FZL', prefix: 'AIRMASSFZL' },
        right: { folder: 'Snow level', title: 'Snow Level', prefix: 'AIRMASSSL' }
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
        left: { folder: 'MTW', title: 'MTW', prefix: 'TURBMTW' },
        right: { folder: 'Wind', title: 'Wind', prefix: 'TURBWIND' }
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

async function discoverBgFrames() {
    const usFrames = await discoverBgFramesForDirectory('images/BG/US');
    const iconFrames = await discoverBgFramesForDirectory('images/BG/ICON');

    const usByHour = new Map(usFrames.map(frame => [frame.hour, frame.path]));
    const iconByHour = new Map(iconFrames.map(frame => [frame.hour, frame.path]));

    const commonHours = Array.from(usByHour.keys())
        .filter(hour => iconByHour.has(hour))
        .sort((a, b) => a - b);

    const framePairs = commonHours.map(hour => ({
        hour,
        leftPath: usByHour.get(hour),
        rightPath: iconByHour.get(hour)
    }));

    if (framePairs.length === 0) {
        throw new Error('No overlapping BG US/ICON frame hours found');
    }

    return framePairs;
}

async function discoverTsFrames() {
    const flashFrames = await discoverBgFramesForDirectory('images/TS/Flash density');
    const severeFrames = await discoverBgFramesForDirectory('images/TS/Severe storm potential');

    const flashByHour = new Map(flashFrames.map(frame => [frame.hour, frame.path]));
    const severeByHour = new Map(severeFrames.map(frame => [frame.hour, frame.path]));

    const commonHours = Array.from(flashByHour.keys())
        .filter(hour => severeByHour.has(hour))
        .sort((a, b) => a - b);

    const framePairs = commonHours.map(hour => ({
        hour,
        leftPath: flashByHour.get(hour),
        rightPath: severeByHour.get(hour)
    }));

    if (framePairs.length === 0) {
        throw new Error('No overlapping TS flash/severe frame hours found');
    }

    return framePairs;
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

function setMaxFramesForCategory(category) {
    if (category === 'BG' && bgFramePairs.length > 0) {
        maxFrames = bgFramePairs.length;
    } else if (category === 'TS' && tsFramePairs.length > 0) {
        maxFrames = tsFramePairs.length;
    } else {
        maxFrames = DEFAULT_MAX_FRAMES;
    }

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
    }
    
    setMaxFramesForCategory(category);
    
    // Keep current frame position - don't reset to frame 1
    // Just ensure the slider reflects the current frame
    frameSlider.value = currentFrame;
}

function updateImages() {
    const config = imageConfig[currentCategory];
    if (!config) return;

    if (currentCategory === 'BG') {
        if (bgFramePairs.length === 0) {
            console.warn('No BG frames available to display.');
            return;
        }

        const framePair = bgFramePairs[currentFrame - 1];
        const frameHour = framePair.hour;

        leftImage.classList.remove('error');
        rightImage.classList.remove('error');

        leftImage.src = framePair.leftPath;
        rightImage.src = framePair.rightPath;

        leftImage.alt = `US - Hour ${frameHour}`;
        rightImage.alt = `ICON - Hour ${frameHour}`;
        return;
    }

    if (currentCategory === 'TS') {
        if (tsFramePairs.length === 0) {
            console.warn('No TS frames available to display.');
            return;
        }

        const framePair = tsFramePairs[currentFrame - 1];
        const frameHour = framePair.hour;

        leftImage.classList.remove('error');
        rightImage.classList.remove('error');

        leftImage.src = framePair.leftPath;
        rightImage.src = framePair.rightPath;

        leftImage.alt = `Flash Density - Hour ${frameHour}`;
        rightImage.alt = `Severe Storm Potential - Hour ${frameHour}`;
        return;
    }
    
    const frameNumber = currentFrame.toString().padStart(3, '0');
    
    // Just remove error class, keep loaded class to prevent white flash
    leftImage.classList.remove('error');
    rightImage.classList.remove('error');
    
    // Update image sources
    leftImage.src = `images/${currentCategory}/${config.left.folder}/${config.left.prefix}${frameNumber}.jpeg`;
    rightImage.src = `images/${currentCategory}/${config.right.folder}/${config.right.prefix}${frameNumber}.jpeg`;
    
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

    if (category === 'BG') {
        bgFramePairs.forEach(framePair => {
            const leftImg = new Image();
            leftImg.src = framePair.leftPath;

            const rightImg = new Image();
            rightImg.src = framePair.rightPath;
        });
        return;
    }

    if (category === 'TS') {
        tsFramePairs.forEach(framePair => {
            const leftImg = new Image();
            leftImg.src = framePair.leftPath;

            const rightImg = new Image();
            rightImg.src = framePair.rightPath;
        });
        return;
    }
    
    for (let i = 1; i <= DEFAULT_MAX_FRAMES; i++) {
        const frameNumber = i.toString().padStart(3, '0');
        
        // Preload left images
        const leftImg = new Image();
        leftImg.src = `images/${category}/${config.left.folder}/${config.left.prefix}${frameNumber}.jpeg`;
        
        // Preload right images
        const rightImg = new Image();
        rightImg.src = `images/${category}/${config.right.folder}/${config.right.prefix}${frameNumber}.jpeg`;
    }
}

// Preload images for better performance
window.addEventListener('load', async function() {
    try {
        await ensureBgFramesLoaded();
        setMaxFramesForCategory('BG');
    } catch (error) {
        console.warn('Could not preload BG frames dynamically:', error);
    }

    try {
        await ensureTsFramesLoaded();
    } catch (error) {
        console.warn('Could not preload TS frames dynamically:', error);
    }

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