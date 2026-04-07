// Configuration object defining image categories and their subfolder pairs
const imageConfig = {
    'Airmass': {
        left: { folder: 'FZL', title: 'FZL', prefix: 'AIRMASSFZL' },
        right: { folder: 'Snow level', title: 'Snow Level', prefix: 'AIRMASSSL' }
    },
    'BG': {
        left: { folder: 'AG', title: 'AG', prefix: 'BGAG' },
        right: { folder: 'AC', title: 'AC', prefix: 'BGAC' }
    },
    'TS': {
        left: { folder: 'AG', title: 'AG', prefix: 'TSAG' },
        right: { folder: 'EC', title: 'EC', prefix: 'TSEC' }
    },
    'Turb': {
        left: { folder: 'MTW', title: 'MTW', prefix: 'TURBMTW' },
        right: { folder: 'Wind', title: 'Wind', prefix: 'TURBWIND' }
    }
};

// Global variables
let currentCategory = 'BG';
let currentFrame = 1;
let maxFrames = 27;
let isPlaying = false;
let animationInterval = null;
let animationSpeed = 500; // milliseconds

// DOM elements
let frameSlider, leftImage, rightImage;
let playBtn, speedSlider, speedDisplay;
let categoryButtons;

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeElements();
    setupEventListeners();
    loadCategory(currentCategory);
    updateImages();
});

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

function switchCategory(category) {
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
    loadCategory(category);
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

function loadCategory(category) {
    const config = imageConfig[category];
    if (!config) {
        console.error(`Category ${category} not found in configuration`);
        return;
    }
    
    // Keep current frame position - don't reset to frame 1
    // Just ensure the slider reflects the current frame
    frameSlider.value = currentFrame;
}

function updateImages() {
    const config = imageConfig[currentCategory];
    if (!config) return;
    
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
    
    for (let i = 1; i <= maxFrames; i++) {
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
window.addEventListener('load', function() {
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