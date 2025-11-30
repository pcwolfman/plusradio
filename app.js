/**
 * Plus Radio Application
 * Main application logic for radio player
 */

class RadioApp {
    constructor() {
        this.parser = new M3UParser();
        this.currentStation = null;
        this.isPlaying = false;
        this.currentCategory = 'Tümü';
        this.favorites = this.loadFavorites();
        this.recentlyPlayed = this.loadRecentlyPlayed();
        this.brokenStations = this.loadBrokenStations();
        this.loadingTimeout = null;
        this.isLoading = false;
        this.viewMode = this.loadViewMode(); // 'compact', 'normal', 'grid'
        
        this.audio = document.getElementById('audioPlayer');
        this.playPauseBtn = document.getElementById('playPauseBtn');
        this.volumeBtn = document.getElementById('volumeBtn');
        this.volumeSlider = document.getElementById('volumeSlider');
        this.prevStationBtn = document.getElementById('prevStationBtn');
        this.nextStationBtn = document.getElementById('nextStationBtn');
        this.searchInput = document.getElementById('searchInput');
        this.searchBtn = null; // Removed from HTML
        this.bottomPlayer = document.getElementById('bottomPlayer');
        this.playerFavoriteBtn = document.getElementById('playerFavoriteBtn');
        this.listToggleBtn = document.getElementById('listToggleBtn');
        this.zoomToggleBtn = document.getElementById('zoomToggleBtn');
        this.zoomToggleBtnFullscreen = document.getElementById('zoomToggleBtnFullscreen');
        this.playerSpectrumCanvas = document.getElementById('playerSpectrumCanvas');
        
        // Zoom state
        this.zoomLevel = this.loadZoomLevel(); // 1.0 = normal, 1.25 = %125, 1.5 = %150, etc.
        this.spectrumStyleToggle = document.getElementById('spectrumStyleToggle');
        this.spectrumStyleToggleFullscreen = document.getElementById('spectrumStyleToggleFullscreen');
        this.playerFavoriteBtnFullscreen = document.getElementById('playerFavoriteBtnFullscreen');
        this.playPauseBtnFullscreen = document.getElementById('playPauseBtnFullscreen');
        this.volumeBtnFullscreen = document.getElementById('volumeBtnFullscreen');
        this.volumeSliderFullscreen = document.getElementById('volumeSliderFullscreen');
        this.playerProgressFill = document.getElementById('playerProgressFill');
        this.playerTimeCurrent = document.getElementById('playerTimeCurrent');
        this.playerTimeDuration = document.getElementById('playerTimeDuration');
        this.playerProgressBar = document.querySelector('.player-progress-bar');
        
        // Web Audio API for spectrum analysis
        this.audioContext = null;
        this.analyser = null;
        this.dataArray = null;
        this.playerSpectrumAnimationId = null;
        
        this.appContainer = document.getElementById('appContainer');
        this.offlineMessage = document.getElementById('offlineMessage');
        
        // Player state: 'normal', 'minimized', 'fullscreen'
        this.playerState = 'normal';
        this.lastTapTime = 0;
        this.tapTimeout = null;
        this.spectrumStyle = this.loadSpectrumStyle(); // 'style1', 'style2', or 'style3'
        this.fireworksParticles = []; // For style3 fireworks effect
        
        // Check online status and setup listeners
        this.checkOnlineStatus();
        this.setupOnlineListeners();
        
        // Ensure player is always visible from the start
        if (this.bottomPlayer) {
            this.bottomPlayer.style.display = 'flex';
            this.bottomPlayer.style.visibility = 'visible';
        }
        
        // Set initial placeholder for player logo (will be set after init)
        this.init();
    }
    
    checkOnlineStatus() {
        if (!navigator.onLine) {
            this.showOfflineMessage();
        } else {
            this.hideOfflineMessage();
        }
    }
    
    setupOnlineListeners() {
        window.addEventListener('online', () => {
            this.hideOfflineMessage();
            // Reload M3U file when coming back online
            if (this.parser && this.parser.stations.length === 0) {
                this.init();
            }
        });
        
        window.addEventListener('offline', () => {
            this.showOfflineMessage();
            // Stop playing if offline
            if (this.isPlaying) {
                this.audio.pause();
                this.isPlaying = false;
                this.updatePlayButton();
            }
        });
    }
    
    showOfflineMessage() {
        if (this.appContainer) {
            this.appContainer.style.display = 'none';
        }
        if (this.offlineMessage) {
            this.offlineMessage.style.display = 'flex';
        }
    }
    
    hideOfflineMessage() {
        if (this.appContainer) {
            this.appContainer.style.display = 'flex';
        }
        if (this.offlineMessage) {
            this.offlineMessage.style.display = 'none';
        }
    }
    
    loadViewMode() {
        try {
            const stored = localStorage.getItem('plusRadio_viewMode');
            return stored || 'compact'; // 'compact', 'normal', 'grid'
        } catch (e) {
            return 'compact';
        }
    }
    
    saveViewMode() {
        localStorage.setItem('plusRadio_viewMode', this.viewMode);
    }
    
    loadSpectrumStyle() {
        try {
            const stored = localStorage.getItem('plusRadio_spectrumStyle');
            return stored || 'style1'; // 'style1', 'style2', or 'style3'
        } catch (e) {
            return 'style1';
        }
    }
    
    saveSpectrumStyle() {
        localStorage.setItem('plusRadio_spectrumStyle', this.spectrumStyle);
    }
    
    toggleSpectrumStyle() {
        console.log('toggleSpectrumStyle called, current:', this.spectrumStyle);
        // Cycle through: style1 -> style2 -> style3 -> style4 -> style5 -> style1
        if (this.spectrumStyle === 'style1') {
            this.spectrumStyle = 'style2';
        } else if (this.spectrumStyle === 'style2') {
            this.spectrumStyle = 'style3';
        } else if (this.spectrumStyle === 'style3') {
            this.spectrumStyle = 'style4';
        } else if (this.spectrumStyle === 'style4') {
            this.spectrumStyle = 'style5';
        } else {
            this.spectrumStyle = 'style1';
        }
        console.log('toggleSpectrumStyle new style:', this.spectrumStyle);
        this.saveSpectrumStyle();
        this.updateSpectrumTooltip();
        
        // Stop current animation
        if (this.playerSpectrumAnimationId) {
            cancelAnimationFrame(this.playerSpectrumAnimationId);
            this.playerSpectrumAnimationId = null;
        }
        
        // Clear canvas
        if (this.playerSpectrumCanvas) {
            const ctx = this.playerSpectrumCanvas.getContext('2d');
            ctx.clearRect(0, 0, this.playerSpectrumCanvas.width, this.playerSpectrumCanvas.height);
        }
        
        // Restart animation with new style (if analyser is ready)
        if (this.analyser) {
            setTimeout(() => {
                this.startPlayerSpectrumAnimation();
            }, 50);
        } else {
            console.log('Analyser not ready, will restart when audio starts');
        }
    }
    
    updateSpectrumTooltip() {
        if (this.spectrumStyleToggle) {
            let styleName = 'Gökkuşağı';
            if (this.spectrumStyle === 'style2') {
                styleName = 'Rengarenk';
            } else if (this.spectrumStyle === 'style3') {
                styleName = 'Esrarengiz';
            }
            this.spectrumStyleToggle.title = `Spektrum Stili: ${styleName} (Tıkla ile değiştir)`;
            
            // Update icon based on style
            let iconSvg = '';
            if (this.spectrumStyle === 'style1') {
                iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path>
                   </svg>`;
            } else if (this.spectrumStyle === 'style2') {
                iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path>
                   </svg>`;
            } else {
                iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M12 2v4M12 18v4M2 12h4M18 12h4"></path>
                   </svg>`;
            }
            this.spectrumStyleToggle.innerHTML = iconSvg;
        }
    }
    
    loadZoomLevel() {
        try {
            const stored = localStorage.getItem('plusRadio_zoomLevel');
            return stored ? parseFloat(stored) : 1.0;
        } catch (e) {
            return 1.0;
        }
    }
    
    saveZoomLevel() {
        try {
            localStorage.setItem('plusRadio_zoomLevel', this.zoomLevel.toString());
        } catch (e) {
            console.warn('Could not save zoom level:', e);
        }
    }
    
    applyZoom() {
        // Check if we're in fullscreen player mode
        if (this.playerState === 'fullscreen' && this.bottomPlayer) {
            // In fullscreen mode, apply zoom to player-content
            const playerContent = this.bottomPlayer.querySelector('.player-content');
            if (playerContent) {
                playerContent.style.transform = `scale(${this.zoomLevel})`;
                playerContent.style.transformOrigin = 'center center';
                // Don't adjust width/height, let transform handle scaling
            }
            // Keep bottomPlayer at full size
            if (this.bottomPlayer) {
                this.bottomPlayer.style.transform = 'none';
                this.bottomPlayer.style.width = '100vw';
                this.bottomPlayer.style.height = '100vh';
            }
        } else {
            // Normal mode: apply zoom to appContainer
            if (this.appContainer) {
                this.appContainer.style.transform = `scale(${this.zoomLevel})`;
                this.appContainer.style.transformOrigin = 'top left';
                // Adjust container width to prevent horizontal scroll
                const scalePercent = (1 / this.zoomLevel) * 100;
                this.appContainer.style.width = `${scalePercent}%`;
            }
            
            // Reset player-content transform in normal mode
            if (this.bottomPlayer) {
                const playerContent = this.bottomPlayer.querySelector('.player-content');
                if (playerContent) {
                    playerContent.style.transform = 'none';
                    playerContent.style.width = '';
                    playerContent.style.height = '';
                }
            }
            
            // Player should NOT be affected by zoom in normal mode - keep it at 100% and always visible
            if (this.bottomPlayer) {
                this.bottomPlayer.style.transform = 'none';
                this.bottomPlayer.style.width = '100vw';
            }
        }
    }
    
    toggleZoom() {
        // Zoom levels: 1.0 (100%) -> 0.9 (90%) -> 0.85 (85%) -> 0.8 (80%) -> 1.0 (100%)
        const zoomLevels = [1.0, 0.9, 0.85, 0.8];
        const currentIndex = zoomLevels.findIndex(level => Math.abs(level - this.zoomLevel) < 0.01);
        const nextIndex = (currentIndex + 1) % zoomLevels.length;
        
        this.zoomLevel = zoomLevels[nextIndex];
        this.saveZoomLevel();
        this.applyZoom();
        this.updateZoomIcon();
    }
    
    updateZoomIcon() {
        // Update main zoom button
        if (this.zoomToggleBtn) {
            const fullscreenIcon = this.zoomToggleBtn.querySelector('.fullscreen-icon');
            const fullscreenExitIcon = this.zoomToggleBtn.querySelector('.fullscreen-exit-icon');
            
            if (fullscreenIcon && fullscreenExitIcon) {
                if (this.zoomLevel < 1.0) {
                    fullscreenIcon.style.display = 'none';
                    fullscreenExitIcon.style.display = 'block';
                    this.zoomToggleBtn.title = `Tam ekran (${Math.round(this.zoomLevel * 100)}%)`;
                } else {
                    fullscreenIcon.style.display = 'block';
                    fullscreenExitIcon.style.display = 'none';
                    this.zoomToggleBtn.title = 'Tam ekran';
                }
            }
        }
        
        // Update fullscreen player zoom button
        if (this.zoomToggleBtnFullscreen) {
            const fullscreenIcon = this.zoomToggleBtnFullscreen.querySelector('.fullscreen-icon');
            const fullscreenExitIcon = this.zoomToggleBtnFullscreen.querySelector('.fullscreen-exit-icon');
            
            if (fullscreenIcon && fullscreenExitIcon) {
                if (this.zoomLevel < 1.0) {
                    fullscreenIcon.style.display = 'none';
                    fullscreenExitIcon.style.display = 'block';
                    this.zoomToggleBtnFullscreen.title = `Yakınlaştır (${Math.round(this.zoomLevel * 100)}%)`;
                } else {
                    fullscreenIcon.style.display = 'block';
                    fullscreenExitIcon.style.display = 'none';
                    this.zoomToggleBtnFullscreen.title = 'Yakınlaştır';
                }
            }
        }
    }
    
    toggleViewMode() {
        // Cycle through: compact -> grid -> normal -> compact
        if (this.viewMode === 'compact') {
            this.viewMode = 'grid';
        } else if (this.viewMode === 'grid') {
            this.viewMode = 'normal';
        } else {
            this.viewMode = 'compact';
        }
        this.saveViewMode();
        this.updateViewModeIcon();
        this.renderChannels(this.searchInput.value);
    }
    
    updateViewModeIcon() {
        const btn = this.listToggleBtn;
        if (!btn) return;
        
        let iconSvg = '';
        if (this.viewMode === 'compact') {
            // Compact icon - küçük kutucuklar
            iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="7" height="7"></rect>
                <rect x="14" y="3" width="7" height="7"></rect>
                <rect x="3" y="14" width="7" height="7"></rect>
                <rect x="14" y="14" width="7" height="7"></rect>
            </svg>`;
        } else if (this.viewMode === 'grid') {
            // Grid icon - orta kutucuklar
            iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="5" height="5"></rect>
                <rect x="9" y="3" width="5" height="5"></rect>
                <rect x="15" y="3" width="5" height="5"></rect>
                <rect x="3" y="9" width="5" height="5"></rect>
                <rect x="9" y="9" width="5" height="5"></rect>
                <rect x="15" y="9" width="5" height="5"></rect>
                <rect x="3" y="15" width="5" height="5"></rect>
                <rect x="9" y="15" width="5" height="5"></rect>
                <rect x="15" y="15" width="5" height="5"></rect>
            </svg>`;
        } else {
            // Normal icon - liste
            iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="8" y1="6" x2="21" y2="6"></line>
                <line x1="8" y1="12" x2="21" y2="12"></line>
                <line x1="8" y1="18" x2="21" y2="18"></line>
                <line x1="3" y1="6" x2="3.01" y2="6"></line>
                <line x1="3" y1="12" x2="3.01" y2="12"></line>
                <line x1="3" y1="18" x2="3.01" y2="18"></line>
            </svg>`;
        }
        btn.innerHTML = iconSvg;
        btn.title = this.viewMode === 'compact' ? 'Küçük kutucuk görünümü' : 
                    this.viewMode === 'grid' ? 'Orta kutucuk görünümü' : 
                    'Liste görünümü';
    }
    
    loadBrokenStations() {
        try {
            const stored = localStorage.getItem('plusRadio_brokenStations');
            return stored ? new Set(JSON.parse(stored)) : new Set();
        } catch (e) {
            return new Set();
        }
    }
    
    saveBrokenStations() {
        localStorage.setItem('plusRadio_brokenStations', JSON.stringify(Array.from(this.brokenStations)));
    }
    
    markAsBroken(station) {
        const stationId = this.getStationId(station);
        if (!this.brokenStations.has(stationId)) {
            this.brokenStations.add(stationId);
            this.saveBrokenStations();
            
            // Check if category should be removed
            const stationCategory = station.group || 'Tümü';
            if (stationCategory !== 'Tümü' && stationCategory !== 'Favoriler' && stationCategory !== 'Son Dinlenenler') {
                const stationsInCategory = this.parser.getStationsByCategory(stationCategory);
                const workingStations = stationsInCategory.filter(s => !this.isBroken(s));
                
                // If no working stations left in category, refresh category list
                if (workingStations.length === 0) {
                    this.renderCategories();
                    // If we were viewing this category, switch to "Tümü"
                    if (this.currentCategory === stationCategory) {
                        this.selectCategory('Tümü');
                    }
                }
            }
            
            // Remove from UI if currently displayed
            if (this.currentCategory !== 'Favoriler' && this.currentCategory !== 'Son Dinlenenler') {
                this.renderChannels(this.searchInput.value);
            }
        }
    }
    
    isBroken(station) {
        const stationId = this.getStationId(station);
        return this.brokenStations.has(stationId);
    }
    
    loadFavorites() {
        try {
            const stored = localStorage.getItem('plusRadio_favorites');
            return stored ? JSON.parse(stored) : [];
        } catch (e) {
            return [];
        }
    }
    
    saveFavorites() {
        localStorage.setItem('plusRadio_favorites', JSON.stringify(this.favorites));
    }
    
    loadRecentlyPlayed() {
        try {
            const stored = localStorage.getItem('plusRadio_recentlyPlayed');
            return stored ? JSON.parse(stored) : [];
        } catch (e) {
            return [];
        }
    }
    
    saveRecentlyPlayed() {
        // Keep only last 20 items
        if (this.recentlyPlayed.length > 20) {
            this.recentlyPlayed = this.recentlyPlayed.slice(0, 20);
        }
        localStorage.setItem('plusRadio_recentlyPlayed', JSON.stringify(this.recentlyPlayed));
    }
    
    addToFavorites(station) {
        const stationId = this.getStationId(station);
        if (!this.favorites.includes(stationId)) {
            this.favorites.push(stationId);
            this.saveFavorites();
            return true;
        }
        return false;
    }
    
    removeFromFavorites(station) {
        const stationId = this.getStationId(station);
        const index = this.favorites.indexOf(stationId);
        if (index > -1) {
            this.favorites.splice(index, 1);
            this.saveFavorites();
            return true;
        }
        return false;
    }
    
    isFavorite(station) {
        const stationId = this.getStationId(station);
        return this.favorites.includes(stationId);
    }
    
    toggleFavorite(station) {
        if (this.isFavorite(station)) {
            this.removeFromFavorites(station);
            return false;
        } else {
            this.addToFavorites(station);
            return true;
        }
    }
    
    addToRecentlyPlayed(station) {
        const stationId = this.getStationId(station);
        // Remove if exists
        const index = this.recentlyPlayed.indexOf(stationId);
        if (index > -1) {
            this.recentlyPlayed.splice(index, 1);
        }
        // Add to beginning
        this.recentlyPlayed.unshift(stationId);
        this.saveRecentlyPlayed();
    }
    
    getStationId(station) {
        return `${station.name}|${station.url}`;
    }
    
    getStationById(stationId) {
        return this.parser.stations.find(s => this.getStationId(s) === stationId);
    }

    async init() {
        // Check if offline before trying to load
        if (!navigator.onLine) {
            this.showOfflineMessage();
            return;
        }
        
        try {
            // Load M3U file
            const response = await fetch('Radyo.m3u');
            if (!response.ok) {
                throw new Error('M3U dosyası bulunamadı. Lütfen Radyo.m3u dosyasını proje klasörüne ekleyin.');
            }
            
            const content = await response.text();
            this.parser.parse(content);
            
            // Setup UI
            this.renderCategories();
            this.renderChannels();
            this.setupEventListeners();
            this.updateViewModeIcon();
            this.initSpectrum();
            
            // Ensure player is always visible
            if (this.bottomPlayer) {
                this.bottomPlayer.style.display = 'flex';
                this.setPlayerState('normal');
                
                // Set initial placeholder for player logo if empty
                const stationLogo = document.getElementById('stationLogo');
                if (stationLogo && (!stationLogo.src || stationLogo.src === '' || stationLogo.src === window.location.href)) {
                    stationLogo.src = this.generatePlaceholderUrl('Radyo');
                }
            }
            
        } catch (error) {
            console.error('Hata:', error);
            // If it's a network error and we're offline, show offline message
            if (!navigator.onLine || error.message.includes('Failed to fetch')) {
                this.showOfflineMessage();
            } else {
                this.showError(error.message);
            }
        }
    }
    
    initSpectrum() {
        // Initialize player spectrum canvas
        const playerCanvas = this.playerSpectrumCanvas;
        if (!playerCanvas) {
            console.warn('Player spectrum canvas element not found');
            return;
        }
        
        // Ensure spectrum style toggle button exists
        if (!this.spectrumStyleToggle) {
            this.spectrumStyleToggle = document.getElementById('spectrumStyleToggle');
        }
        
        // Set initial tooltip
        this.updateSpectrumTooltip();
        
        const resizePlayerCanvas = () => {
            try {
                const wrapper = playerCanvas.parentElement;
                if (wrapper && typeof wrapper.clientWidth !== 'undefined' && wrapper.clientWidth > 0) {
                    playerCanvas.width = wrapper.clientWidth;
                    playerCanvas.height = wrapper.clientHeight || 60;
                } else {
                    // Fallback if wrapper not ready - use computed style or defaults
                    const computedStyle = window.getComputedStyle(wrapper || playerCanvas);
                    const width = parseInt(computedStyle.width) || 300;
                    const height = parseInt(computedStyle.height) || 60;
                    playerCanvas.width = width;
                    playerCanvas.height = height;
                }
            } catch (error) {
                console.warn('Error resizing player spectrum canvas:', error);
                // Safe fallback
                playerCanvas.width = 300;
                playerCanvas.height = 60;
            }
        };
        
        // Wait for DOM to be ready - longer timeout for Android
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(resizePlayerCanvas, 200);
            });
        } else {
            setTimeout(resizePlayerCanvas, 200);
        }
        
        window.addEventListener('resize', resizePlayerCanvas);
        
        // Also resize when bottom player becomes visible
        if (this.bottomPlayer) {
            const observer = new MutationObserver(() => {
                if (this.bottomPlayer) {
                    setTimeout(resizePlayerCanvas, 100);
                }
            });
            observer.observe(this.bottomPlayer, { attributes: true, attributeFilter: ['class'] });
        }
        
        // Initialize Web Audio API when audio starts playing
    }
    
    setupAudioContext() {
        if (!this.audioContext) {
            try {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                this.analyser = this.audioContext.createAnalyser();
                this.analyser.fftSize = 256; // Higher resolution
                this.analyser.smoothingTimeConstant = 0.8;
                
                const bufferLength = this.analyser.frequencyBinCount;
                this.dataArray = new Uint8Array(bufferLength);
                
                // Connect audio element to analyser
                // Note: createMediaElementSource can only be called once per audio element
                try {
                    const source = this.audioContext.createMediaElementSource(this.audio);
                    source.connect(this.analyser);
                    this.analyser.connect(this.audioContext.destination);
                } catch (e) {
                    // If source already exists, just connect analyser to destination
                    this.audio.connect(this.analyser);
                    this.analyser.connect(this.audioContext.destination);
                }
                
                // Ensure canvas has dimensions before starting animation
                if (this.playerSpectrumCanvas) {
                    const wrapper = this.playerSpectrumCanvas.parentElement;
                    if (this.playerSpectrumCanvas.width === 0 || this.playerSpectrumCanvas.height === 0) {
                        try {
                            if (wrapper && typeof wrapper.clientWidth !== 'undefined' && wrapper.clientWidth > 0) {
                                this.playerSpectrumCanvas.width = wrapper.clientWidth;
                                this.playerSpectrumCanvas.height = wrapper.clientHeight || 60;
                            } else {
                                const computedStyle = window.getComputedStyle(wrapper || this.playerSpectrumCanvas);
                                this.playerSpectrumCanvas.width = parseInt(computedStyle.width) || 300;
                                this.playerSpectrumCanvas.height = parseInt(computedStyle.height) || 60;
                            }
                        } catch (e) {
                            this.playerSpectrumCanvas.width = 300;
                            this.playerSpectrumCanvas.height = 60;
                        }
                    }
                }
                
                // Start player spectrum animation
                setTimeout(() => {
                    this.startPlayerSpectrumAnimation();
                }, 100);
            } catch (error) {
                console.warn('Web Audio API not supported or CORS issue:', error);
            }
        } else {
            // Resume audio context if suspended (required by some browsers)
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
            // Ensure canvas has dimensions
            if (this.playerSpectrumCanvas && (this.playerSpectrumCanvas.width === 0 || this.playerSpectrumCanvas.height === 0)) {
                const wrapper = this.playerSpectrumCanvas.parentElement;
                try {
                    if (wrapper && typeof wrapper.clientWidth !== 'undefined' && wrapper.clientWidth > 0) {
                        this.playerSpectrumCanvas.width = wrapper.clientWidth;
                        this.playerSpectrumCanvas.height = wrapper.clientHeight || 60;
                    } else {
                        const computedStyle = window.getComputedStyle(wrapper || this.playerSpectrumCanvas);
                        this.playerSpectrumCanvas.width = parseInt(computedStyle.width) || 300;
                        this.playerSpectrumCanvas.height = parseInt(computedStyle.height) || 60;
                    }
                } catch (e) {
                    this.playerSpectrumCanvas.width = 300;
                    this.playerSpectrumCanvas.height = 60;
                }
            }
            // Start animation if not already running
            if (!this.playerSpectrumAnimationId) {
                setTimeout(() => {
                    this.startPlayerSpectrumAnimation();
                }, 100);
            }
        }
    }
    
    stopSpectrumAnimation() {
        if (this.playerSpectrumAnimationId) {
            cancelAnimationFrame(this.playerSpectrumAnimationId);
            this.playerSpectrumAnimationId = null;
        }
        
        // Clear player canvas
        const playerCanvas = this.playerSpectrumCanvas;
        if (playerCanvas) {
            const ctx = playerCanvas.getContext('2d');
            ctx.clearRect(0, 0, playerCanvas.width, playerCanvas.height);
        }
    }
    
    startPlayerSpectrumAnimation() {
        if (this.playerSpectrumAnimationId) {
            cancelAnimationFrame(this.playerSpectrumAnimationId);
        }
        
        const canvas = this.playerSpectrumCanvas;
        if (!canvas) {
            console.warn('Player spectrum canvas not found');
            return;
        }
        
        if (!this.analyser) {
            console.warn('Analyser not ready for player spectrum');
            return;
        }
        
        // Ensure canvas has proper dimensions
        const wrapper = canvas.parentElement;
        let width, height;
        
        try {
            if (wrapper && typeof wrapper.clientWidth !== 'undefined' && wrapper.clientWidth > 0 && 
                typeof wrapper.clientHeight !== 'undefined' && wrapper.clientHeight > 0) {
                width = wrapper.clientWidth;
                height = wrapper.clientHeight;
            } else {
                // Use CSS computed dimensions or defaults
                try {
                    const computedStyle = window.getComputedStyle(wrapper || canvas);
                    width = parseInt(computedStyle.width) || 300;
                    height = parseInt(computedStyle.height) || 60;
                } catch (e) {
                    // Final fallback
                    width = 300;
                    height = 60;
                }
            }
        } catch (error) {
            console.warn('Error getting canvas dimensions:', error);
            width = 300;
            height = 60;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        
        const draw = () => {
            if (!this.analyser || !this.isPlaying) {
                this.playerSpectrumAnimationId = null;
                return;
            }
            
            // Update dimensions if needed - with null checks
            try {
                if (wrapper && typeof wrapper.clientWidth !== 'undefined' && 
                    typeof wrapper.clientHeight !== 'undefined' &&
                    (canvas.width !== wrapper.clientWidth || canvas.height !== wrapper.clientHeight)) {
                    width = wrapper.clientWidth || 300;
                    height = wrapper.clientHeight || 60;
                    canvas.width = width;
                    canvas.height = height;
                }
            } catch (error) {
                // Ignore resize errors, continue with current dimensions
            }
            
            this.analyser.getByteFrequencyData(this.dataArray);
            
            // Clear canvas with dark background
            ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
            ctx.fillRect(0, 0, width, height);
            
            const barCount = this.dataArray.length;
            
            if (this.spectrumStyle === 'style1') {
                // Style 1: Original rainbow gradient bars (bottom-up)
            const barWidth = width / barCount * 2.5;
            let x = 0;
            
            for (let i = 0; i < barCount; i++) {
                const dataValue = this.dataArray[i];
                const barHeight = (dataValue / 255) * height * 0.9;
                
                // Each bar gets unique color from rainbow spectrum
                const hue = (i / barCount) * 360;
                const saturation = 90 + (dataValue / 255) * 10;
                const lightness = 45 + (dataValue / 255) * 25;
                
                // Create gradient for each bar
                const barGradient = ctx.createLinearGradient(x, height, x, height - barHeight);
                const hue1 = hue;
                const hue2 = (hue + 30) % 360;
                const hue3 = (hue + 60) % 360;
                
                barGradient.addColorStop(0, `hsla(${hue1}, ${saturation}%, ${lightness}%, 0.9)`);
                barGradient.addColorStop(0.5, `hsla(${hue2}, ${saturation}%, ${lightness + 10}%, 1)`);
                barGradient.addColorStop(1, `hsla(${hue3}, ${saturation}%, ${lightness + 20}%, 1)`);
                
                // Draw bar
                ctx.fillStyle = barGradient;
                ctx.fillRect(x, height - barHeight, barWidth - 1, barHeight);
                
                // Add glow effect
                ctx.shadowBlur = 15;
                ctx.shadowColor = `hsl(${hue}, ${saturation}%, ${lightness + 10}%)`;
                ctx.fillRect(x, height - barHeight, barWidth - 1, barHeight);
                ctx.shadowBlur = 0;
                
                x += barWidth;
                }
            } else if (this.spectrumStyle === 'style2') {
                // Style 2: Vibrant colorful bars from center (mirrored up and down)
                const barWidth = width / barCount * 2.5;
                const centerY = height / 2;
                let x = 0;
                
                // Color palette - vibrant rainbow colors
                const colors = [
                    { h: 0, s: 100, l: 50 },    // Red
                    { h: 30, s: 100, l: 50 },   // Orange
                    { h: 60, s: 100, l: 50 },   // Yellow
                    { h: 120, s: 100, l: 50 },  // Green
                    { h: 180, s: 100, l: 50 },  // Cyan
                    { h: 240, s: 100, l: 50 },  // Blue
                    { h: 270, s: 100, l: 50 },  // Purple
                    { h: 300, s: 100, l: 50 },  // Magenta
                    { h: 330, s: 100, l: 50 },  // Pink
                    { h: 15, s: 100, l: 50 },   // Red-Orange
                ];
                
                for (let i = 0; i < barCount; i++) {
                    const dataValue = this.dataArray[i];
                    const barHeight = (dataValue / 255) * height * 0.45; // Slightly taller for better visibility
                    
                    // Each bar gets a unique vibrant color from the palette
                    const colorIndex = i % colors.length;
                    const baseColor = colors[colorIndex];
                    
                    // Dynamic saturation and lightness based on audio data
                    const saturation = 90 + (dataValue / 255) * 10;
                    const lightness = 40 + (dataValue / 255) * 30;
                    
                    // Create vibrant linear gradient for each bar
                    const centerX = x + barWidth / 2;
                    const barGradient = ctx.createLinearGradient(
                        centerX, centerY - barHeight,
                        centerX, centerY + barHeight
                    );
                    
                    // Gradient with multiple color stops for vibrant effect
                    const hue1 = baseColor.h;
                    const hue2 = (baseColor.h + 20) % 360;
                    const hue3 = (baseColor.h + 40) % 360;
                    
                    barGradient.addColorStop(0, `hsla(${hue1}, ${saturation}%, ${lightness + 20}%, 1)`);
                    barGradient.addColorStop(0.3, `hsla(${hue2}, ${saturation}%, ${lightness + 10}%, 1)`);
                    barGradient.addColorStop(0.5, `hsla(${hue1}, ${saturation}%, ${lightness}%, 1)`);
                    barGradient.addColorStop(0.7, `hsla(${hue3}, ${saturation}%, ${lightness + 10}%, 1)`);
                    barGradient.addColorStop(1, `hsla(${hue1}, ${saturation}%, ${lightness + 20}%, 1)`);
                    
                    // Draw mirrored bars (top and bottom from center)
                    ctx.fillStyle = barGradient;
                    
                    // Top bar (going up from center)
                    ctx.fillRect(x, centerY - barHeight, barWidth - 1, barHeight);
                    
                    // Bottom bar (going down from center)
                    ctx.fillRect(x, centerY, barWidth - 1, barHeight);
                    
                    // Add vibrant glow effect with matching color
                    ctx.shadowBlur = 25;
                    ctx.shadowColor = `hsl(${hue1}, ${saturation}%, ${lightness + 15}%)`;
                    ctx.fillRect(x, centerY - barHeight, barWidth - 1, barHeight);
                    ctx.fillRect(x, centerY, barWidth - 1, barHeight);
                    ctx.shadowBlur = 0;
                    
                    // Add bright connecting line in center
                    ctx.strokeStyle = `hsla(${hue1}, ${saturation}%, ${lightness + 25}%, 0.8)`;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(centerX, centerY - barHeight);
                    ctx.lineTo(centerX, centerY + barHeight);
                    ctx.stroke();
                    
                    // Add highlight on top of each bar
                    ctx.fillStyle = `hsla(${hue1}, ${saturation}%, ${lightness + 30}%, 0.6)`;
                    ctx.fillRect(x, centerY - barHeight, barWidth - 1, Math.max(2, barHeight * 0.1));
                    ctx.fillRect(x, centerY, barWidth - 1, Math.max(2, barHeight * 0.1));
                    
                    x += barWidth;
                }
            } else if (this.spectrumStyle === 'style3') {
                // Style 3: Esrarengiz Havai Fişek & Şimşek Bass - Mysterious Fireworks & Lightning Bass
                const centerX = width / 2;
                const centerY = height / 2;
                const barWidth = width / barCount * 2.5;
                const time = Date.now() * 0.001;
                
                // Initialize fireworks particles if not exists
                if (!this.fireworksParticles) {
                    this.fireworksParticles = [];
                }
                
                // Bass detection - use lower frequencies (first 20% of bars)
                const bassBars = Math.floor(barCount * 0.2);
                let bassIntensity = 0;
                for (let i = 0; i < bassBars; i++) {
                    bassIntensity += this.dataArray[i] / 255;
                }
                bassIntensity = bassIntensity / bassBars;
                
                // Create new fireworks on strong bass hits
                if (bassIntensity > 0.7 && Math.random() < 0.15) {
                    const fireworkX = Math.random() * width;
                    const fireworkY = Math.random() * height * 0.5; // Upper half
                    const colors = [
                        { h: 0, s: 100, l: 60 },    // Red
                        { h: 30, s: 100, l: 65 },    // Orange
                        { h: 60, s: 100, l: 70 },    // Yellow
                        { h: 180, s: 100, l: 70 },   // Cyan
                        { h: 240, s: 100, l: 65 },   // Blue
                        { h: 280, s: 100, l: 60 },   // Purple
                        { h: 320, s: 100, l: 65 },   // Magenta
                    ];
                    const color = colors[Math.floor(Math.random() * colors.length)];
                    
                    // Create particle explosion
                    const particleCount = 20 + Math.floor(Math.random() * 30);
                    for (let p = 0; p < particleCount; p++) {
                        const angle = (p / particleCount) * Math.PI * 2;
                        const speed = 2 + Math.random() * 4;
                        this.fireworksParticles.push({
                            x: fireworkX,
                            y: fireworkY,
                            vx: Math.cos(angle) * speed,
                            vy: Math.sin(angle) * speed,
                            life: 1.0,
                            decay: 0.01 + Math.random() * 0.02,
                            size: 2 + Math.random() * 4,
                            color: color,
                            trail: []
                        });
                    }
                }
                
                // Update and draw fireworks particles
                for (let i = this.fireworksParticles.length - 1; i >= 0; i--) {
                    const p = this.fireworksParticles[i];
                    p.x += p.vx;
                    p.y += p.vy;
                    p.vy += 0.15; // Gravity
                    p.life -= p.decay;
                    
                    // Add to trail
                    p.trail.push({ x: p.x, y: p.y, life: p.life });
                    if (p.trail.length > 8) {
                        p.trail.shift();
                    }
                    
                    // Draw trail
                    for (let t = 0; t < p.trail.length; t++) {
                        const trailPoint = p.trail[t];
                        const trailAlpha = (trailPoint.life / p.trail.length) * p.life * 0.6;
                        ctx.fillStyle = `hsla(${p.color.h}, ${p.color.s}%, ${p.color.l}%, ${trailAlpha})`;
                        ctx.shadowBlur = 8;
                        ctx.shadowColor = `hsla(${p.color.h}, ${p.color.s}%, ${p.color.l + 20}%, 0.8)`;
                        ctx.beginPath();
                        ctx.arc(trailPoint.x, trailPoint.y, p.size * 0.5, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    
                    // Draw particle
                    ctx.fillStyle = `hsla(${p.color.h}, ${p.color.s}%, ${p.color.l}%, ${p.life})`;
                    ctx.shadowBlur = 15;
                    ctx.shadowColor = `hsla(${p.color.h}, ${p.color.s}%, ${p.color.l + 25}%, 0.9)`;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.shadowBlur = 0;
                    
                    // Remove dead particles
                    if (p.life <= 0 || p.y > height + 50) {
                        this.fireworksParticles.splice(i, 1);
                    }
                }
                
                // Draw lightning effects on strong bass
                if (bassIntensity > 0.6) {
                    const lightningCount = Math.floor(bassIntensity * 3);
                    for (let l = 0; l < lightningCount; l++) {
                        const startX = Math.random() * width;
                        const startY = 0;
                        const endX = startX + (Math.random() - 0.5) * width * 0.3;
                        const endY = height * (0.3 + Math.random() * 0.4);
                        
                        // Draw lightning bolt
                        ctx.strokeStyle = `hsla(200, 100%, 80%, ${0.7 * bassIntensity})`;
                        ctx.lineWidth = 2 + bassIntensity * 3;
                        ctx.shadowBlur = 20;
                        ctx.shadowColor = 'hsla(200, 100%, 90%, 0.9)';
                        
                        ctx.beginPath();
                        ctx.moveTo(startX, startY);
                        
                        // Zigzag lightning path
                        let currentX = startX;
                        let currentY = startY;
                        const segments = 8;
                        for (let s = 1; s <= segments; s++) {
                            const progress = s / segments;
                            currentX = startX + (endX - startX) * progress + (Math.random() - 0.5) * 20;
                            currentY = startY + (endY - startY) * progress;
                            ctx.lineTo(currentX, currentY);
                        }
                        ctx.lineTo(endX, endY);
                        ctx.stroke();
                        ctx.shadowBlur = 0;
                        
                        // Lightning glow
                        ctx.strokeStyle = `hsla(200, 100%, 90%, ${0.4 * bassIntensity})`;
                        ctx.lineWidth = 1;
                        ctx.stroke();
                    }
                }
                
                // Draw bass bars with mysterious glow
                let x = 0;
                for (let i = 0; i < barCount; i++) {
                    const dataValue = this.dataArray[i];
                    const normalizedValue = dataValue / 255;
                    const barHeight = normalizedValue * height * 0.45;
                    
                    if (barHeight < 0.5) {
                        x += barWidth;
                        continue;
                    }
                    
                    // Mysterious color scheme - dark purple to electric blue
                    const isBass = i < bassBars;
                    const hue = isBass ? 280 + (bassIntensity * 40) : 200 + (i / barCount) * 60;
                    const saturation = isBass ? 90 + bassIntensity * 10 : 70 + normalizedValue * 20;
                    const lightness = isBass ? 50 + bassIntensity * 20 : 55 + normalizedValue * 15;
                    
                    // Create mysterious gradient
                    const gradient = ctx.createLinearGradient(
                        x, centerY - barHeight,
                        x + barWidth, centerY + barHeight
                    );
                    
                    // Esrarengiz renk geçişi
                    gradient.addColorStop(0, `hsla(${hue}, ${saturation}%, ${lightness + 20}%, 0.9)`);
                    gradient.addColorStop(0.3, `hsla(${hue + 20}, ${saturation}%, ${lightness + 25}%, 1)`);
                    gradient.addColorStop(0.5, `hsla(${hue}, ${saturation}%, ${lightness + 30}%, 0.95)`);
                    gradient.addColorStop(0.7, `hsla(${hue - 20}, ${saturation}%, ${lightness + 25}%, 1)`);
                    gradient.addColorStop(1, `hsla(${hue}, ${saturation}%, ${lightness + 20}%, 0.9)`);
                    
                    // Draw top bar
                    ctx.fillStyle = gradient;
                    ctx.shadowBlur = isBass ? 25 : 15;
                    ctx.shadowColor = `hsla(${hue}, ${saturation}%, ${lightness + 30}%, 0.8)`;
                    ctx.fillRect(x, centerY - barHeight, barWidth - 1, barHeight);
                    
                    // Draw bottom bar
                    ctx.fillRect(x, centerY, barWidth - 1, barHeight);
                    ctx.shadowBlur = 0;
                    
                    // Add mysterious sparkles on high frequencies
                    if (normalizedValue > 0.7 && !isBass) {
                        const sparkleCount = Math.floor(normalizedValue * 3);
                        for (let s = 0; s < sparkleCount; s++) {
                            const sparkleX = x + Math.random() * barWidth;
                            const sparkleY = centerY - barHeight - 5 - Math.random() * 10;
                            const sparkleSize = 1 + Math.random() * 2;
                            const sparkleAlpha = normalizedValue * 0.9;
                            
                            ctx.fillStyle = `hsla(${hue + s * 30}, ${saturation}%, ${lightness + 35}%, ${sparkleAlpha})`;
                            ctx.shadowBlur = 10;
                            ctx.shadowColor = `hsla(${hue}, ${saturation}%, ${lightness + 40}%, 0.8)`;
                            ctx.beginPath();
                            ctx.arc(sparkleX, sparkleY, sparkleSize, 0, Math.PI * 2);
                            ctx.fill();
                            ctx.shadowBlur = 0;
                        }
                    }
                    
                    // Bass pulse effect
                    if (isBass && bassIntensity > 0.5) {
                        const pulseSize = bassIntensity * 15;
                        const pulseAlpha = bassIntensity * 0.4;
                        ctx.strokeStyle = `hsla(${hue}, ${saturation}%, ${lightness + 30}%, ${pulseAlpha})`;
                        ctx.lineWidth = 2;
                        ctx.shadowBlur = 20;
                        ctx.shadowColor = `hsla(${hue}, ${saturation}%, ${lightness + 35}%, 0.6)`;
                        ctx.beginPath();
                        ctx.arc(x + barWidth / 2, centerY, pulseSize, 0, Math.PI * 2);
                        ctx.stroke();
                        ctx.shadowBlur = 0;
                    }
                    
                    x += barWidth;
                }
                
                // Mysterious center orb
                const maxData = Math.max(...Array.from(this.dataArray));
                const pulseIntensity = (maxData / 255);
                const orbRadius = 8 + pulseIntensity * 20;
                const orbGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, orbRadius);
                orbGradient.addColorStop(0, `hsla(280, 100%, 70%, ${0.8 + pulseIntensity * 0.2})`);
                orbGradient.addColorStop(0.4, `hsla(240, 100%, 60%, ${0.6 + pulseIntensity * 0.3})`);
                orbGradient.addColorStop(0.7, `hsla(200, 90%, 55%, ${0.4 + pulseIntensity * 0.2})`);
                orbGradient.addColorStop(1, `hsla(280, 80%, 50%, 0)`);
                
                ctx.fillStyle = orbGradient;
                ctx.shadowBlur = 30;
                ctx.shadowColor = 'hsla(280, 100%, 70%, 0.9)';
                ctx.beginPath();
                ctx.arc(centerX, centerY, orbRadius, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
            } else if (this.spectrumStyle === 'style4') {
                // Style 4: Neon Wave Spectrum - Smooth flowing waves with neon glow
                const barWidth = width / barCount * 2.5;
                const centerY = height / 2;
                let x = 0;
                
                // Create smooth wave effect
                const waveOffset = Date.now() * 0.001;
                
                for (let i = 0; i < barCount; i++) {
                    const dataValue = this.dataArray[i];
                    const normalizedValue = dataValue / 255;
                    const barHeight = normalizedValue * height * 0.45;
                    
                    if (barHeight < 0.5) {
                        x += barWidth;
                        continue;
                    }
                    
                    // Neon color scheme - vibrant cyan to purple
                    const hue = 180 + (i / barCount) * 120; // Cyan to Purple
                    const saturation = 85 + normalizedValue * 15;
                    const lightness = 50 + normalizedValue * 20;
                    
                    // Wave effect with smooth curves
                    const wavePhase = (i / barCount) * Math.PI * 4 + waveOffset;
                    const waveAmplitude = Math.sin(wavePhase) * 3;
                    
                    // Top bar (going up from center)
                    const topY = centerY - barHeight - waveAmplitude;
                    const bottomY = centerY + barHeight + waveAmplitude;
                    
                    // Create neon gradient
                    const topGradient = ctx.createLinearGradient(x, topY, x + barWidth, topY + barHeight);
                    topGradient.addColorStop(0, `hsla(${hue}, ${saturation}%, ${lightness + 20}%, 0.9)`);
                    topGradient.addColorStop(0.5, `hsla(${hue + 20}, ${saturation}%, ${lightness + 30}%, 1)`);
                    topGradient.addColorStop(1, `hsla(${hue}, ${saturation}%, ${lightness + 15}%, 0.8)`);
                    
                    const bottomGradient = ctx.createLinearGradient(x, bottomY - barHeight, x + barWidth, bottomY);
                    bottomGradient.addColorStop(0, `hsla(${hue}, ${saturation}%, ${lightness + 20}%, 0.9)`);
                    bottomGradient.addColorStop(0.5, `hsla(${hue + 20}, ${saturation}%, ${lightness + 30}%, 1)`);
                    bottomGradient.addColorStop(1, `hsla(${hue}, ${saturation}%, ${lightness + 15}%, 0.8)`);
                    
                    // Draw top bar with neon glow
                    ctx.fillStyle = topGradient;
                    ctx.shadowBlur = 20;
                    ctx.shadowColor = `hsla(${hue}, ${saturation}%, ${lightness + 25}%, 0.9)`;
                    ctx.fillRect(x, topY, barWidth - 1, barHeight);
                    
                    // Draw bottom bar with neon glow
                    ctx.fillStyle = bottomGradient;
                    ctx.fillRect(x, bottomY - barHeight, barWidth - 1, barHeight);
                    ctx.shadowBlur = 0;
                    
                    // Add connecting line in center with neon effect
                    const centerX = x + barWidth / 2;
                    ctx.strokeStyle = `hsla(${hue}, ${saturation}%, ${lightness + 30}%, 0.7)`;
                    ctx.lineWidth = 1.5;
                    ctx.shadowBlur = 10;
                    ctx.shadowColor = `hsla(${hue}, ${saturation}%, ${lightness + 25}%, 0.8)`;
                    ctx.beginPath();
                    ctx.moveTo(centerX, topY + barHeight);
                    ctx.lineTo(centerX, bottomY - barHeight);
                    ctx.stroke();
                    ctx.shadowBlur = 0;
                    
                    // Add floating particles for high frequencies
                    if (normalizedValue > 0.6) {
                        const particleCount = Math.floor(normalizedValue * 5);
                        for (let p = 0; p < particleCount; p++) {
                            const particleX = x + (p / particleCount) * barWidth;
                            const particleY = topY - 5 - Math.random() * 10;
                            const particleSize = 1 + normalizedValue * 2;
                            const particleAlpha = normalizedValue * 0.8;
                            
                            ctx.fillStyle = `hsla(${hue + p * 10}, ${saturation}%, ${lightness + 30}%, ${particleAlpha})`;
                            ctx.shadowBlur = 8;
                            ctx.shadowColor = `hsla(${hue}, ${saturation}%, ${lightness + 25}%, 0.6)`;
                            ctx.beginPath();
                            ctx.arc(particleX, particleY, particleSize, 0, Math.PI * 2);
                            ctx.fill();
                            ctx.shadowBlur = 0;
                        }
                    }
                    
                    x += barWidth;
                }
            } else if (this.spectrumStyle === 'style5') {
                // Style 5: Modern Minimal - Clean design with soft color transitions
                const barWidth = width / barCount * 2.5;
                const centerY = height / 2;
                let x = 0;
                
                // Soft color palette: Purple -> Blue -> Cyan -> Green
                const colorStops = [
                    { h: 280, s: 70, l: 60 },  // Purple
                    { h: 240, s: 75, l: 65 },  // Blue
                    { h: 200, s: 80, l: 70 },  // Cyan
                    { h: 160, s: 75, l: 65 },  // Green
                ];
                
                for (let i = 0; i < barCount; i++) {
                    const dataValue = this.dataArray[i];
                    const normalizedValue = dataValue / 255;
                    const barHeight = normalizedValue * height * 0.4;
                    
                    if (barHeight < 0.5) {
                        x += barWidth;
                        continue;
                    }
                    
                    // Smooth color transition across spectrum
                    const colorIndex = (i / barCount) * (colorStops.length - 1);
                    const colorIndex1 = Math.floor(colorIndex);
                    const colorIndex2 = Math.min(Math.ceil(colorIndex), colorStops.length - 1);
                    const colorBlend = colorIndex - colorIndex1;
                    
                    const color1 = colorStops[colorIndex1];
                    const color2 = colorStops[colorIndex2];
                    
                    const hue = color1.h + (color2.h - color1.h) * colorBlend;
                    const saturation = color1.s + (color2.s - color1.s) * colorBlend;
                    const lightness = color1.l + (color2.l - color1.l) * colorBlend;
                    
                    // Create soft gradient
                    const centerX = x + barWidth / 2;
                    const topGradient = ctx.createLinearGradient(
                        centerX, centerY - barHeight,
                        centerX, centerY
                    );
                    topGradient.addColorStop(0, `hsla(${hue}, ${saturation}%, ${lightness + 15}%, 0.85)`);
                    topGradient.addColorStop(1, `hsla(${hue}, ${saturation}%, ${lightness}%, 0.6)`);
                    
                    const bottomGradient = ctx.createLinearGradient(
                        centerX, centerY,
                        centerX, centerY + barHeight
                    );
                    bottomGradient.addColorStop(0, `hsla(${hue}, ${saturation}%, ${lightness}%, 0.6)`);
                    bottomGradient.addColorStop(1, `hsla(${hue}, ${saturation}%, ${lightness + 15}%, 0.85)`);
                    
                    // Draw centered bars with subtle glow
                    ctx.fillStyle = topGradient;
                    ctx.shadowBlur = 8;
                    ctx.shadowColor = `hsla(${hue}, ${saturation}%, ${lightness + 10}%, 0.5)`;
                    ctx.fillRect(x, centerY - barHeight, barWidth - 1, barHeight);
                    
                    ctx.fillStyle = bottomGradient;
                    ctx.fillRect(x, centerY, barWidth - 1, barHeight);
                    ctx.shadowBlur = 0;
                    
                    // Add subtle connecting line
                    ctx.strokeStyle = `hsla(${hue}, ${saturation}%, ${lightness + 20}%, 0.4)`;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(centerX, centerY - barHeight);
                    ctx.lineTo(centerX, centerY + barHeight);
                    ctx.stroke();
                    
                    // Add minimal highlight on top
                    ctx.fillStyle = `hsla(${hue}, ${saturation}%, ${lightness + 25}%, 0.3)`;
                    ctx.fillRect(x, centerY - barHeight, barWidth - 1, Math.max(1, barHeight * 0.08));
                    ctx.fillRect(x, centerY, barWidth - 1, Math.max(1, barHeight * 0.08));
                    
                    x += barWidth;
                }
            }
            
            this.playerSpectrumAnimationId = requestAnimationFrame(draw);
        };
        
        draw();
    }

    setupEventListeners() {
        // Play/Pause button
        this.playPauseBtn.addEventListener('click', () => {
            if (this.currentStation) {
                this.togglePlayPause();
            } else {
                alert('Lütfen önce bir radyo istasyonu seçin.');
            }
        });

        // Volume control
        this.volumeSlider.addEventListener('input', (e) => {
            this.setVolume(e.target.value / 100);
        });

        this.volumeBtn.addEventListener('click', () => {
            if (this.audio.volume > 0) {
                this.volumeSlider.value = 0;
                this.setVolume(0);
            } else {
                this.volumeSlider.value = 80;
                this.setVolume(0.8);
            }
        });

        // Previous/Next/Stop station buttons
        if (this.prevStationBtn) {
            this.prevStationBtn.addEventListener('click', () => {
                this.playPreviousStation();
            });
        }

        if (this.nextStationBtn) {
            this.nextStationBtn.addEventListener('click', () => {
                this.playNextStation();
            });
        }

        // Fullscreen buttons
        if (this.playPauseBtnFullscreen) {
            this.playPauseBtnFullscreen.addEventListener('click', () => {
                if (this.currentStation) {
                    this.togglePlayPause();
                }
            });
        }

        if (this.volumeSliderFullscreen) {
            this.volumeSliderFullscreen.addEventListener('input', (e) => {
                this.setVolume(e.target.value / 100);
                // Sync with main volume slider
                if (this.volumeSlider) {
                    this.volumeSlider.value = e.target.value;
                }
            });
        }

        if (this.volumeBtnFullscreen) {
            this.volumeBtnFullscreen.addEventListener('click', () => {
                if (this.audio.volume > 0) {
                    if (this.volumeSliderFullscreen) this.volumeSliderFullscreen.value = 0;
                    if (this.volumeSlider) this.volumeSlider.value = 0;
                    this.setVolume(0);
                } else {
                    if (this.volumeSliderFullscreen) this.volumeSliderFullscreen.value = 80;
                    if (this.volumeSlider) this.volumeSlider.value = 80;
                    this.setVolume(0.8);
                }
            });
        }

        if (this.spectrumStyleToggleFullscreen) {
            this.spectrumStyleToggleFullscreen.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                // Toggle spectrum style in both normal and fullscreen modes
                this.toggleSpectrumStyle();
            });
        }

        if (this.playerFavoriteBtnFullscreen) {
            this.playerFavoriteBtnFullscreen.addEventListener('click', () => {
                if (this.currentStation) {
                    const isNowFavorite = this.toggleFavorite(this.currentStation);
                    this.updatePlayerFavoriteButton();
                }
            });
        }

        // Sync volume sliders
        if (this.volumeSlider) {
            this.volumeSlider.addEventListener('input', (e) => {
                if (this.volumeSliderFullscreen) {
                    this.volumeSliderFullscreen.value = e.target.value;
                }
            });
        }

        // Sync initial volume slider values
        if (this.volumeSlider && this.volumeSliderFullscreen) {
            this.volumeSliderFullscreen.value = this.volumeSlider.value;
        }

        // Progress bar click handler (for seeking, if supported)
        if (this.playerProgressBar) {
            this.playerProgressBar.addEventListener('click', (e) => {
                if (this.audio.duration && isFinite(this.audio.duration)) {
                    const rect = this.playerProgressBar.getBoundingClientRect();
                    const percent = (e.clientX - rect.left) / rect.width;
                    this.audio.currentTime = percent * this.audio.duration;
                }
            });
        }

        // Audio events
        this.audio.addEventListener('play', () => {
            this.clearLoadingTimeout();
            this.isPlaying = true;
            this.isLoading = false;
            this.updatePlayButton();
            this.hideLoadingState();
            this.setupAudioContext();
        });

        this.audio.addEventListener('pause', () => {
            this.isPlaying = false;
            this.updatePlayButton();
            this.stopSpectrumAnimation();
        });

        this.audio.addEventListener('error', (e) => {
            console.error('Audio error:', e);
            this.clearLoadingTimeout();
            this.isLoading = false;
            this.hideLoadingState();
            this.isPlaying = false;
            this.updatePlayButton();
            
            // Mark as broken and remove from view
            if (this.currentStation) {
                this.markAsBroken(this.currentStation);
                this.showError('Radyo yayını çalışmıyor. Liste güncellendi.');
                // Try to find next working station
                this.findNextWorkingStation();
            }
        });

        this.audio.addEventListener('loadstart', () => {
            this.isLoading = true;
            this.showLoadingState();
            // Set timeout for slow connections (15 seconds)
            this.loadingTimeout = setTimeout(() => {
                if (this.isLoading && this.currentStation) {
                    console.warn('Loading timeout for:', this.currentStation.name);
                    this.markAsBroken(this.currentStation);
                    this.audio.load(); // Reset
                    this.showError('Radyo yayını çok yavaş yükleniyor. Liste güncellendi.');
                    this.findNextWorkingStation();
                }
            }, 15000);
        });

        this.audio.addEventListener('canplay', () => {
            this.clearLoadingTimeout();
            this.isLoading = false;
            this.hideLoadingState();
        });

        this.audio.addEventListener('stalled', () => {
            // Connection stalled, wait a bit then mark as broken if continues
            setTimeout(() => {
                if (this.audio.readyState < 3 && this.currentStation) {
                    this.markAsBroken(this.currentStation);
                    this.findNextWorkingStation();
                }
            }, 15000);
        });

        this.audio.addEventListener('loadedmetadata', () => {
            this.updateProgressBar();
        });

        this.audio.addEventListener('timeupdate', () => {
            this.updateProgressBar();
        });

        this.audio.addEventListener('loadedmetadata', () => {
            this.updateProgressBar();
        });

        this.audio.addEventListener('timeupdate', () => {
            this.updateProgressBar();
        });

        // Search
        this.searchInput.addEventListener('input', (e) => {
            this.searchChannels(e.target.value);
        });

        this.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.searchChannels(e.target.value);
            }
        });

        // Zoom toggle
        if (this.zoomToggleBtn) {
            this.zoomToggleBtn.addEventListener('click', () => {
                this.toggleZoom();
            });
            
            // Apply saved zoom level on load
            this.applyZoom();
            this.updateZoomIcon();
        }
        
        // Zoom toggle for fullscreen player
        if (this.zoomToggleBtnFullscreen) {
            this.zoomToggleBtnFullscreen.addEventListener('click', () => {
                this.toggleZoom();
            });
        }

        // View mode toggle
        if (this.listToggleBtn) {
            this.listToggleBtn.addEventListener('click', () => {
                this.toggleViewMode();
            });
        }

        // Spectrum canvas tap controls - STRONG event listeners to ensure fullscreen return works
        if (this.playerSpectrumCanvas) {
            const spectrumWrapper = this.playerSpectrumCanvas.parentElement;
            if (spectrumWrapper) {
                // Add event listener to wrapper with capture phase
                spectrumWrapper.addEventListener('click', (e) => {
                    // Don't handle if clicking on buttons
                    if (e.target.closest('.player-btn') || 
                        e.target.closest('button') ||
                        e.target.closest('.player-navigation-controls')) {
                        return;
                    }
                    
                    // In fullscreen mode, immediately return to home - THIS IS CRITICAL
                    if (this.playerState === 'fullscreen') {
                        e.stopPropagation();
                        e.preventDefault();
                        e.stopImmediatePropagation();
                        console.log('Fullscreen mode (wrapper) - returning to home page');
                        this.returnToHomePage();
                        return false;
                    }
                    
                    // Handle spectrum tap for normal mode
                    this.handleSpectrumTap(e);
                }, true); // Capture phase - handles before other listeners
            }
            
            // Also add direct listener to canvas as backup - CRITICAL for fullscreen
            this.playerSpectrumCanvas.addEventListener('click', (e) => {
                // Don't handle if clicking on buttons
                if (e.target.closest('.player-btn') || 
                    e.target.closest('button') ||
                    e.target.closest('.player-navigation-controls')) {
                    return;
                }
                
                // In fullscreen mode, immediately return to home - THIS IS CRITICAL
                if (this.playerState === 'fullscreen') {
                    e.stopPropagation();
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    console.log('Fullscreen mode (canvas) - returning to home page');
                    this.returnToHomePage();
                    return false;
                }
                
                // Handle spectrum tap for normal mode
                this.handleSpectrumTap(e);
            }, true); // Capture phase
        }
        
        // Spectrum style toggle button - multiple approaches to ensure it works
        const setupSpectrumToggle = () => {
            const toggleBtn = document.getElementById('spectrumStyleToggle');
            if (toggleBtn) {
                console.log('Spectrum style toggle button found!', toggleBtn);
                this.spectrumStyleToggle = toggleBtn;
                
                // Method 1: Direct click listener
                const handleClick = (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    console.log('=== SPECTRUM TOGGLE CLICKED ===');
                    // Toggle spectrum style in both normal and fullscreen modes
                    this.toggleSpectrumStyle();
                    return false;
                };
                
                toggleBtn.onclick = handleClick;
                toggleBtn.addEventListener('click', handleClick, true); // Use capture phase
                toggleBtn.addEventListener('click', handleClick, false);
                
                // Also handle SVG clicks
                const svg = toggleBtn.querySelector('svg');
                if (svg) {
                    svg.style.pointerEvents = 'none'; // Let clicks pass through to button
                }
                
                // Method 2: Event delegation on player-controls
                const playerControls = toggleBtn.closest('.player-controls');
                if (playerControls && !playerControls.hasAttribute('data-spectrum-delegation')) {
                    playerControls.setAttribute('data-spectrum-delegation', 'true');
                    playerControls.addEventListener('click', (e) => {
                        if (e.target.closest('#spectrumStyleToggle') || e.target.id === 'spectrumStyleToggle') {
                            e.stopPropagation();
                            e.preventDefault();
                            console.log('=== SPECTRUM TOGGLE CLICKED (delegation) ===');
                            // Toggle spectrum style in both normal and fullscreen modes
                            this.toggleSpectrumStyle();
                        }
                    }, true);
                }
            } else {
                console.warn('Spectrum style toggle button NOT found!');
            }
        };
        
        // Try multiple times
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setupSpectrumToggle();
                setTimeout(setupSpectrumToggle, 100);
            });
        } else {
            setupSpectrumToggle();
        }
        
        setTimeout(setupSpectrumToggle, 500);
        setTimeout(setupSpectrumToggle, 1000);
        
        // Bottom player tap controls - only handle non-button, non-spectrum clicks
        // Spectrum clicks are handled by spectrumWrapper listener above (capture phase)
        if (this.bottomPlayer) {
            this.bottomPlayer.addEventListener('click', (e) => {
                // Don't handle button clicks
                if (e.target.closest('.player-btn') || 
                    e.target.closest('.player-controls') ||
                    e.target.closest('.volume-control') ||
                    e.target.closest('.volume-slider') ||
                    e.target.closest('input') ||
                    e.target.closest('button') ||
                    e.target.closest('.player-navigation-controls')) {
                    return;
                }
                
                // Don't handle spectrum clicks (handled by spectrumWrapper listener in capture phase)
                if (e.target === this.playerSpectrumCanvas || 
                    e.target.closest('.player-spectrum-wrapper') ||
                    e.target.closest('.player-spectrum-canvas')) {
                    return;
                }
                
                // For other areas in player, handle tap
                this.handleSpectrumTap(e);
            });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && e.target.tagName !== 'INPUT') {
                e.preventDefault();
                if (this.currentStation) {
                    this.togglePlayPause();
                }
            }
        });
    }
    
    handleSpectrumTap(e) {
        // If fullscreen, single tap returns directly to home page (anasayfa)
        if (this.playerState === 'fullscreen') {
            if (e) {
                e.stopPropagation();
                e.preventDefault();
            }
            this.returnToHomePage();
            return;
        }
        
        // In normal mode, single tap goes to fullscreen (büyük stil)
        if (this.playerState === 'normal') {
            if (e) {
                e.stopPropagation();
                e.preventDefault();
            }
            this.setPlayerState('fullscreen');
            return;
        }
        
        // In minimized mode, single tap goes to normal
        if (this.playerState === 'minimized') {
            if (e) {
                e.stopPropagation();
                e.preventDefault();
            }
            this.setPlayerState('normal');
            return;
        }
    }
    
    returnToHomePage() {
        // Return to home page (ilk açılış sayfası) from fullscreen
        console.log('returnToHomePage called, current state:', this.playerState);
        
        // Check if we're actually in fullscreen
        if (this.playerState !== 'fullscreen') {
            console.log('Not in fullscreen, current state:', this.playerState);
            return;
        }
        
        console.log('Returning to home page from fullscreen');
        
        // First, ensure app container and main content are visible
        if (this.appContainer) {
            this.appContainer.style.display = '';
            this.appContainer.style.visibility = '';
            this.appContainer.style.opacity = '';
            this.appContainer.scrollTop = 0;
        }
        
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            mainContent.style.display = '';
            mainContent.style.visibility = '';
            mainContent.style.opacity = '';
            mainContent.scrollTop = 0;
        }
        
        // Ensure categories section is visible
        const categoriesSection = document.querySelector('.categories-section');
        if (categoriesSection) {
            categoriesSection.style.display = '';
            categoriesSection.style.visibility = '';
            categoriesSection.style.opacity = '';
        }
        
        // Ensure channels grid is visible
        const channelsGrid = document.getElementById('channelsGrid');
        if (channelsGrid) {
            channelsGrid.style.display = '';
            channelsGrid.style.visibility = '';
            channelsGrid.style.opacity = '';
        }
        
        // Reset to "Tümü" category (ilk açılış sayfası gibi) - DO THIS FIRST
        if (this.currentCategory !== 'Tümü') {
            console.log('Changing category to Tümü');
            this.selectCategory('Tümü');
        } else {
            // Even if already Tümü, re-render to ensure channels are visible
            console.log('Re-rendering channels for Tümü');
            this.renderChannels();
        }
        
        // Scroll to top of the page (anasayfa) immediately - DO THIS BEFORE STATE CHANGE
        window.scrollTo({ top: 0, behavior: 'instant' });
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        
        // Now change state to normal using setPlayerState to ensure all state changes happen
        // Use a flag to prevent infinite recursion
        if (!this._returningToHome) {
            this._returningToHome = true;
            
            // Immediately remove fullscreen class and add normal class
            if (this.bottomPlayer) {
                this.bottomPlayer.classList.remove('player-fullscreen');
                this.bottomPlayer.classList.add('player-normal');
                // Force remove any inline styles that might interfere
                this.bottomPlayer.style.position = '';
                this.bottomPlayer.style.top = '';
                this.bottomPlayer.style.left = '';
                this.bottomPlayer.style.right = '';
                this.bottomPlayer.style.bottom = '';
                this.bottomPlayer.style.width = '';
                this.bottomPlayer.style.height = '';
                this.bottomPlayer.style.zIndex = '';
            }
            
            this.setPlayerState('normal');
            this._returningToHome = false;
        } else {
            // If already returning, just update state directly
            this.playerState = 'normal';
            if (this.bottomPlayer) {
                this.bottomPlayer.classList.remove('player-fullscreen');
                this.bottomPlayer.classList.add('player-normal');
                // Force remove any inline styles that might interfere
                this.bottomPlayer.style.position = '';
                this.bottomPlayer.style.top = '';
                this.bottomPlayer.style.left = '';
                this.bottomPlayer.style.right = '';
                this.bottomPlayer.style.bottom = '';
                this.bottomPlayer.style.width = '';
                this.bottomPlayer.style.height = '';
                this.bottomPlayer.style.zIndex = '';
            }
        }
        
        // Immediately resize canvas to normal size
        if (this.playerSpectrumCanvas) {
            const wrapper = this.playerSpectrumCanvas.parentElement;
            if (wrapper) {
                // Clear ALL fullscreen styles immediately
                this.playerSpectrumCanvas.style.width = '';
                this.playerSpectrumCanvas.style.height = '';
                this.playerSpectrumCanvas.style.minWidth = '';
                this.playerSpectrumCanvas.style.minHeight = '';
                
                // Force immediate layout recalculation
                void wrapper.offsetWidth;
                void wrapper.offsetHeight;
                
                // Set normal size immediately - use fixed small size to ensure it's small
                const normalWidth = 300; // Fixed small width
                const normalHeight = 60; // Fixed small height
                this.playerSpectrumCanvas.width = normalWidth;
                this.playerSpectrumCanvas.height = normalHeight;
                
                console.log('Canvas resized to normal size:', normalWidth, 'x', normalHeight);
            }
        }
        
        // Apply zoom for normal mode
        this.applyZoom();
        
        // Update tooltip
        this.updateSpectrumTooltip();
        
        // Force resize to ensure canvas stays small and channels are visible
        setTimeout(() => {
            if (this.playerSpectrumCanvas && this.playerState === 'normal') {
                const wrapper = this.playerSpectrumCanvas.parentElement;
                if (wrapper) {
                    this.playerSpectrumCanvas.style.width = '';
                    this.playerSpectrumCanvas.style.height = '';
                    const normalWidth = wrapper.clientWidth || 300;
                    const normalHeight = wrapper.clientHeight || 60;
                    this.playerSpectrumCanvas.width = normalWidth;
                    this.playerSpectrumCanvas.height = normalHeight;
                    console.log('Canvas final size:', normalWidth, 'x', normalHeight);
                }
            }
            
            // Ensure main content is visible and scrolled to top
            const mainContentEl = document.querySelector('.main-content');
            if (mainContentEl) {
                mainContentEl.scrollTop = 0;
                mainContentEl.style.display = ''; // Ensure it's visible
            }
            
            // Ensure channels grid is visible
            const channelsGrid = document.getElementById('channelsGrid');
            if (channelsGrid) {
                channelsGrid.style.display = ''; // Ensure it's visible
            }
            
            // Ensure categories are visible
            const categoriesSection = document.querySelector('.categories-section');
            if (categoriesSection) {
                categoriesSection.style.display = ''; // Ensure it's visible
            }
        }, 10);
        
        console.log('returnToHomePage completed, new state:', this.playerState);
    }
    
    setPlayerState(state) {
        this.playerState = state;
        
        if (!this.bottomPlayer) return;
        
        // Remove all state classes
        this.bottomPlayer.classList.remove('player-normal', 'player-minimized', 'player-fullscreen');
        
        // Add new state class
        this.bottomPlayer.classList.add(`player-${state}`);
        
        // Apply zoom when state changes (especially important for fullscreen)
        this.applyZoom();
        
        // Resize spectrum canvas when state changes
        if (state === 'fullscreen') {
            // For fullscreen, immediately set large size and resize multiple times
            // First, force immediate resize
            this.resizeSpectrumCanvas();
            // Then resize multiple times to ensure large size is set
            requestAnimationFrame(() => {
                this.resizeSpectrumCanvas();
                this.updateSpectrumTooltip();
            });
            setTimeout(() => {
                this.resizeSpectrumCanvas();
            }, 50);
            setTimeout(() => {
                this.resizeSpectrumCanvas();
            }, 200);
            setTimeout(() => {
                this.resizeSpectrumCanvas();
            }, 500);
        } else {
            setTimeout(() => {
                this.resizeSpectrumCanvas();
                // Update tooltip icon size
                this.updateSpectrumTooltip();
            }, 100);
        }
    }
    
    resizeSpectrumCanvas() {
        if (!this.playerSpectrumCanvas) return;
        
        const wrapper = this.playerSpectrumCanvas.parentElement;
        if (!wrapper) return;
        
        try {
            if (this.playerState === 'fullscreen') {
                // In fullscreen mode, set large size IMMEDIATELY
                // Force wrapper visibility and layout
                wrapper.style.display = 'flex';
                wrapper.style.visibility = 'visible';
                wrapper.style.opacity = '1';
                
                // Force layout recalculation
                void wrapper.offsetWidth;
                void wrapper.offsetHeight;
                
                // Calculate large canvas size for fullscreen
                const screenWidth = window.innerWidth;
                const screenHeight = window.innerHeight;
                
                // Large size for fullscreen (70% of screen width, 40% of screen height)
                const canvasWidth = Math.min(Math.max(screenWidth * 0.7, 600), 1200);
                const canvasHeight = Math.min(Math.max(screenHeight * 0.4, 300), 500);
                
                // Set CSS styles for large size IMMEDIATELY
                this.playerSpectrumCanvas.style.width = `${canvasWidth}px`;
                this.playerSpectrumCanvas.style.height = `${canvasHeight}px`;
                this.playerSpectrumCanvas.style.minWidth = `${canvasWidth}px`;
                this.playerSpectrumCanvas.style.minHeight = `${canvasHeight}px`;
                
                // Set actual canvas dimensions IMMEDIATELY
                this.playerSpectrumCanvas.width = canvasWidth;
                this.playerSpectrumCanvas.height = canvasHeight;
                
                // Force another layout recalculation after setting size
                void this.playerSpectrumCanvas.offsetWidth;
                void this.playerSpectrumCanvas.offsetHeight;
            } else {
                // In normal/minimized mode, use wrapper size
                // Clear fullscreen styles
                this.playerSpectrumCanvas.style.width = '';
                this.playerSpectrumCanvas.style.height = '';
                this.playerSpectrumCanvas.style.minWidth = '';
                this.playerSpectrumCanvas.style.minHeight = '';
                
                // Force layout recalculation
                void wrapper.offsetWidth;
                
                if (wrapper && typeof wrapper.clientWidth !== 'undefined' && wrapper.clientWidth > 0) {
                    this.playerSpectrumCanvas.width = wrapper.clientWidth;
                    this.playerSpectrumCanvas.height = wrapper.clientHeight || 60;
                } else {
                    const computedStyle = window.getComputedStyle(wrapper || this.playerSpectrumCanvas);
                    this.playerSpectrumCanvas.width = parseInt(computedStyle.width) || 300;
                    this.playerSpectrumCanvas.height = parseInt(computedStyle.height) || 60;
                }
            }
        } catch (error) {
            console.warn('Error resizing spectrum canvas:', error);
            if (this.playerState === 'fullscreen') {
                this.playerSpectrumCanvas.width = 1000;
                this.playerSpectrumCanvas.height = 400;
            } else {
                this.playerSpectrumCanvas.width = 300;
                this.playerSpectrumCanvas.height = 60;
            }
        }
    }

    renderCategories() {
        const categoryList = document.getElementById('categoryList');
        categoryList.innerHTML = '';

        // Add "Tümü" option
        const allItem = document.createElement('div');
        allItem.className = 'category-item active';
        allItem.innerHTML = '<span class="category-icon">📻</span> Tümü';
        allItem.addEventListener('click', () => this.selectCategory('Tümü'));
        categoryList.appendChild(allItem);

        // Add "Favoriler" option
        const favoritesItem = document.createElement('div');
        favoritesItem.className = 'category-item';
        favoritesItem.innerHTML = '<span class="category-icon">❤️</span> Favoriler';
        favoritesItem.addEventListener('click', () => this.selectCategory('Favoriler'));
        categoryList.appendChild(favoritesItem);

        // Add "Son Dinlenenler" option
        const recentItem = document.createElement('div');
        recentItem.className = 'category-item';
        recentItem.innerHTML = '<span class="category-icon">🕐</span> Son Dinlenenler';
        recentItem.addEventListener('click', () => this.selectCategory('Son Dinlenenler'));
        categoryList.appendChild(recentItem);

        // Add other categories
        const categories = this.parser.getCategories();
        categories.forEach(category => {
            // Skip generic/title categories
            if (category.includes('RADYO KANALLARI') || 
                category.includes('TV') || 
                category.startsWith('----------') ||
                !category || 
                category.length < 2) {
                return;
            }

            // Check if category has any working stations
            const stationsInCategory = this.parser.getStationsByCategory(category);
            const workingStations = stationsInCategory.filter(s => !this.isBroken(s));
            
            // Skip category if no working stations
            if (workingStations.length === 0) {
                return;
            }

            const item = document.createElement('div');
            item.className = 'category-item';
            item.textContent = category;
            item.addEventListener('click', () => this.selectCategory(category));
            categoryList.appendChild(item);
        });
    }

    renderChannels(searchQuery = '') {
        const channelsGrid = document.getElementById('channelsGrid');
        channelsGrid.innerHTML = '';
        
        // Update class based on view mode
        channelsGrid.className = 'channels-list';
        if (this.viewMode === 'compact') {
            channelsGrid.classList.add('view-compact');
        } else if (this.viewMode === 'grid') {
            channelsGrid.classList.add('view-grid');
        } else {
            channelsGrid.classList.add('view-normal');
        }

        let stations;
        if (searchQuery) {
            stations = this.parser.searchStations(searchQuery);
        } else if (this.currentCategory === 'Favoriler') {
            stations = this.favorites
                .map(id => this.getStationById(id))
                .filter(s => s !== undefined);
        } else if (this.currentCategory === 'Son Dinlenenler') {
            stations = this.recentlyPlayed
                .map(id => this.getStationById(id))
                .filter(s => s !== undefined);
        } else {
            stations = this.parser.getStationsByCategory(this.currentCategory);
        }
        
        // Filter out broken stations
        stations = stations.filter(s => !this.isBroken(s));

        const categoryTitle = document.getElementById('categoryTitle');
        const channelCount = document.getElementById('channelCount');
        
        if (searchQuery) {
            categoryTitle.textContent = `Arama: "${searchQuery}"`;
        } else if (this.currentCategory === 'Tümü') {
            categoryTitle.textContent = 'Tüm Kanallar';
        } else {
            categoryTitle.textContent = this.currentCategory;
        }
        
        channelCount.textContent = `${stations.length} kanal`;

        if (stations.length === 0) {
            channelsGrid.innerHTML = '<div class="loading">Kanallar bulunamadı</div>';
            return;
        }

        stations.forEach(station => {
            // Skip broken stations
            if (this.isBroken(station)) {
                return;
            }

            const item = document.createElement('div');
            item.className = 'channel-item';
            
            if (this.currentStation && this.currentStation.name === station.name && 
                this.currentStation.url === station.url) {
                item.classList.add('playing');
            }

            const isFav = this.isFavorite(station);
            
            // Fix logo URL - convert http to https if needed
            let logoUrl = station.logo || '';
            let useProxy = false;
            
            // Clean and validate logo URL
            if (logoUrl) {
                logoUrl = String(logoUrl).trim();
                // Convert http to https
                if (logoUrl.startsWith('http://')) {
                    logoUrl = logoUrl.replace('http://', 'https://');
                }
                // Ensure it's a valid URL
                if (!logoUrl.startsWith('http://') && !logoUrl.startsWith('https://') && !logoUrl.startsWith('data:')) {
                    logoUrl = '';
                } else if (logoUrl.startsWith('https://') || logoUrl.startsWith('http://')) {
                    // Mark that we should use proxy
                    useProxy = true;
                }
            }
            
            // Only use placeholder if logo is truly empty
            const originalLogoUrl = logoUrl && logoUrl !== '' && logoUrl !== 'undefined' && logoUrl !== 'null' ? logoUrl : null;
            if (!originalLogoUrl) {
                logoUrl = this.generatePlaceholderUrl(station.name);
                useProxy = false;
            }
            // Try direct URL first, proxy will be fallback in error handler
            
            // Different HTML structure based on view mode
            // Optimize logo loading with decode="async" and fetchpriority
            // Use eager loading for first 30 items (visible area on homepage)
            const itemIndex = stations.indexOf(station);
            const isInViewport = itemIndex < 30;
            const isPlaying = (this.currentStation && this.currentStation.name === station.name);
            const fetchPriority = isPlaying ? 'high' : (isInViewport ? 'high' : 'low');
            const loadingStrategy = (isInViewport || isPlaying) ? 'eager' : 'lazy';
            
            if (this.viewMode === 'compact') {
                // Compact view: küçük kutucuklar, sadece logo ve isim
                item.innerHTML = `
                    <img src="${logoUrl}" alt="${station.name}" class="channel-logo" 
                         loading="${loadingStrategy}"
                         decoding="async"
                         fetchpriority="${fetchPriority}"
                         referrerpolicy="no-referrer"
                         data-station-name="${station.name.replace(/"/g, '&quot;')}">
                    <div class="channel-info">
                        <div class="channel-name">${station.name}</div>
                    </div>
                    <button class="favorite-star ${isFav ? 'active' : ''}" title="${isFav ? 'Favorilerden çıkar' : 'Favorilere ekle'}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                        </svg>
                    </button>
                `;
            } else if (this.viewMode === 'grid') {
                // Grid view: orta kutucuklar, logo üstte, isim ve kategori altta
                item.innerHTML = `
                    <div class="channel-logo-wrapper">
                        <img src="${logoUrl}" alt="${station.name}" class="channel-logo" 
                             loading="${loadingStrategy}"
                             decoding="async"
                             fetchpriority="${fetchPriority}"
                             referrerpolicy="no-referrer"
                             data-station-name="${station.name.replace(/"/g, '&quot;')}">
                        <button class="favorite-star ${isFav ? 'active' : ''}" title="${isFav ? 'Favorilerden çıkar' : 'Favorilere ekle'}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                            </svg>
                        </button>
                    </div>
                    <div class="channel-info">
                        <div class="channel-name">${station.name}</div>
                        <div class="channel-group">${station.group || '-'}</div>
                    </div>
                `;
            } else {
                // Normal view: liste görünümü (mevcut)
                item.innerHTML = `
                    <img src="${logoUrl}" alt="${station.name}" class="channel-logo" 
                         loading="${loadingStrategy}"
                         decoding="async"
                         fetchpriority="${fetchPriority}"
                         referrerpolicy="no-referrer"
                         data-station-name="${station.name.replace(/"/g, '&quot;')}">
                    <div class="channel-info">
                        <div class="channel-name">${station.name}</div>
                        <div class="channel-group">${station.group || '-'}</div>
                    </div>
                    <button class="favorite-star ${isFav ? 'active' : ''}" title="${isFav ? 'Favorilerden çıkar' : 'Favorilere ekle'}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                        </svg>
                    </button>
                `;
            }

            // Logo error handler with proxy fallback
            const logoImg = item.querySelector('.channel-logo');
            if (logoImg && originalLogoUrl) {
                const stationName = station.name;
                let loadTimeout = null;
                let hasTriedProxy = false;
                
                // Set timeout (10 seconds for visible items, 8 seconds for others)
                const timeoutDuration = isInViewport ? 10000 : 8000;
                
                // Start loading with direct URL first
                loadTimeout = setTimeout(() => {
                    if (!logoImg.complete || logoImg.naturalWidth === 0) {
                        // Logo didn't load in time, try proxy if we haven't already
                        if (!hasTriedProxy && !logoImg.src.includes('corsproxy.io') && !logoImg.src.includes('data:image/svg+xml')) {
                            hasTriedProxy = true;
                            const proxyUrl = this.getProxiedLogoUrl(originalLogoUrl);
                            logoImg.src = proxyUrl;
                            
                            // Set timeout for proxy attempt (5 seconds)
                            loadTimeout = setTimeout(() => {
                                if (!logoImg.complete || logoImg.naturalWidth === 0) {
                                    logoImg.src = this.generatePlaceholderUrl(stationName);
                                }
                            }, 5000);
                        } else {
                            // All attempts failed, use placeholder
                            logoImg.src = this.generatePlaceholderUrl(stationName);
                        }
                    }
                }, timeoutDuration);
                
                // Clear timeout when image loads successfully
                logoImg.addEventListener('load', () => {
                    if (loadTimeout) clearTimeout(loadTimeout);
                    logoImg.style.opacity = '1';
                }, { once: true });
                
                // Error handler - try proxy, then placeholder
                logoImg.addEventListener('error', function() {
                    if (loadTimeout) clearTimeout(loadTimeout);
                    
                    // Try proxy if we haven't already and have original URL
                    if (!hasTriedProxy && originalLogoUrl && !this.src.includes('corsproxy.io') && !this.src.includes('data:image/svg+xml')) {
                        hasTriedProxy = true;
                        const proxyUrl = window.radioApp.getProxiedLogoUrl(originalLogoUrl);
                        this.src = proxyUrl;
                        
                        // Set timeout for proxy attempt
                        loadTimeout = setTimeout(() => {
                            if (!this.complete || this.naturalWidth === 0) {
                                this.src = window.radioApp.generatePlaceholderUrl(stationName);
                            }
                        }, 5000);
                    } else {
                        // Already tried proxy or no original URL, use placeholder
                        if (!this.src.includes('data:image/svg+xml')) {
                            this.src = window.radioApp.generatePlaceholderUrl(stationName);
                        }
                    }
                }, { once: false });
            }

            // Favorite button handler
            const favBtn = item.querySelector('.favorite-star');
            if (favBtn) {
                favBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const isNowFavorite = this.toggleFavorite(station);
                    favBtn.classList.toggle('active', isNowFavorite);
                    favBtn.title = isNowFavorite ? 'Favorilerden çıkar' : 'Favorilere ekle';
                    this.updatePlayerFavoriteButton();
                    if (this.currentCategory === 'Favoriler') {
                        this.renderChannels(); // Refresh if in favorites view
                    }
                });
            }

            // Item click handler
            item.addEventListener('click', (e) => {
                if (e.target.closest('.favorite-star')) return;
                e.stopPropagation();
                this.selectStation(station, item);
            });
            channelsGrid.appendChild(item);
        });
    }

    selectCategory(category) {
        this.currentCategory = category;
        
        // Update active category
        document.querySelectorAll('.category-item').forEach(item => {
            item.classList.remove('active');
            // Check text content or innerHTML for icon cases
            const itemText = item.textContent.trim() || item.innerText.trim();
            if (itemText === category || 
                itemText.includes('Tümü') && category === 'Tümü' ||
                itemText.includes('Favoriler') && category === 'Favoriler' ||
                itemText.includes('Son Dinlenenler') && category === 'Son Dinlenenler' ||
                itemText === category) {
                item.classList.add('active');
            }
        });

        // Clear search
        this.searchInput.value = '';
        this.renderChannels();
    }

    selectStation(station, itemElement = null) {
        this.currentStation = station;
        
        // Add to recently played
        this.addToRecentlyPlayed(station);
        
        // Preserve player state if in fullscreen, otherwise set to normal
        if (this.playerState !== 'fullscreen') {
        this.setPlayerState('normal');
        }
        
        // Resize player spectrum canvas when player becomes visible (only if not fullscreen)
        if (this.playerSpectrumCanvas && this.playerState !== 'fullscreen') {
            setTimeout(() => {
                try {
                    const wrapper = this.playerSpectrumCanvas.parentElement;
                    if (wrapper && typeof wrapper.clientWidth !== 'undefined') {
                        this.playerSpectrumCanvas.width = wrapper.clientWidth || 300;
                        this.playerSpectrumCanvas.height = wrapper.clientHeight || 60;
                    } else {
                        // Use computed style or defaults
                        try {
                            const computedStyle = window.getComputedStyle(wrapper || this.playerSpectrumCanvas);
                            this.playerSpectrumCanvas.width = parseInt(computedStyle.width) || 300;
                            this.playerSpectrumCanvas.height = parseInt(computedStyle.height) || 60;
                        } catch (e) {
                            this.playerSpectrumCanvas.width = 300;
                            this.playerSpectrumCanvas.height = 60;
                        }
                    }
                } catch (error) {
                    console.warn('Error resizing canvas in selectStation:', error);
                    this.playerSpectrumCanvas.width = 300;
                    this.playerSpectrumCanvas.height = 60;
                }
            }, 150);
        } else if (this.playerSpectrumCanvas && this.playerState === 'fullscreen') {
            // In fullscreen, just resize the canvas without changing state
            setTimeout(() => {
                this.resizeSpectrumCanvas();
            }, 100);
        }
        
        // Update bottom player UI
        document.getElementById('stationName').textContent = station.name;
        document.getElementById('stationGroup').textContent = station.group || '-';
        const stationNameProgress = document.getElementById('stationNameProgress');
        if (stationNameProgress) {
            stationNameProgress.textContent = station.name;
        }
        const logoImg = document.getElementById('stationLogo');
        let logoUrl = station.logo || '';
        let useProxy = false;
        
        // Clean and validate logo URL
        if (logoUrl) {
            logoUrl = logoUrl.trim();
            // Convert http to https
            if (logoUrl.startsWith('http://')) {
                logoUrl = logoUrl.replace('http://', 'https://');
            }
            // Ensure it's a valid URL
            if (!logoUrl.startsWith('http://') && !logoUrl.startsWith('https://') && !logoUrl.startsWith('data:')) {
                logoUrl = '';
            } else if (logoUrl.startsWith('https://') || logoUrl.startsWith('http://')) {
                useProxy = true;
            }
        }
        
        // Only use placeholder if logo is truly empty
        const originalLogoUrl = logoUrl && logoUrl !== '' && logoUrl !== 'undefined' && logoUrl !== 'null' ? logoUrl : null;
        if (!originalLogoUrl) {
            logoUrl = this.generatePlaceholderUrl(station.name);
            useProxy = false;
        }
        // Try direct URL first, proxy will be fallback in error handler
        
        let hasTriedProxy = false;
        
        // Optimize player logo loading - try direct URL first
        logoImg.src = logoUrl;
        logoImg.setAttribute('referrerpolicy', 'no-referrer');
        logoImg.setAttribute('decoding', 'async');
        logoImg.setAttribute('fetchpriority', 'high');
        logoImg.setAttribute('loading', 'eager'); // Player logo should load immediately
        
        // Update small logo in progress container
        const logoImgSmall = document.getElementById('stationLogoSmall');
        if (logoImgSmall) {
            logoImgSmall.src = logoUrl;
            logoImgSmall.setAttribute('referrerpolicy', 'no-referrer');
            logoImgSmall.setAttribute('decoding', 'async');
            logoImgSmall.setAttribute('fetchpriority', 'high');
            logoImgSmall.setAttribute('loading', 'eager');
        }
        
        // Set timeout for player logo loading (10 seconds)
        let playerLogoTimeout = setTimeout(() => {
            if (!logoImg.complete || logoImg.naturalWidth === 0) {
                // Try proxy if we haven't already
                if (originalLogoUrl && !hasTriedProxy && !logoImg.src.includes('corsproxy.io') && !logoImg.src.includes('data:image/svg+xml')) {
                    hasTriedProxy = true;
                    const proxyUrl = this.getProxiedLogoUrl(originalLogoUrl);
                    logoImg.src = proxyUrl;
                    if (logoImgSmall) logoImgSmall.src = proxyUrl;
                    
                    // Set timeout for proxy attempt
                    playerLogoTimeout = setTimeout(() => {
                        if (!logoImg.complete || logoImg.naturalWidth === 0) {
                            const placeholder = this.generatePlaceholderUrl(station.name);
                            logoImg.src = placeholder;
                            if (logoImgSmall) logoImgSmall.src = placeholder;
                        }
                    }, 5000);
                } else {
                    // All attempts failed, use placeholder
                    logoImg.src = this.generatePlaceholderUrl(station.name);
                    if (logoImgSmall) logoImgSmall.src = this.generatePlaceholderUrl(station.name);
                }
            }
            if (logoImgSmall && (!logoImgSmall.complete || logoImgSmall.naturalWidth === 0)) {
                if (originalLogoUrl && !hasTriedProxy && !logoImgSmall.src.includes('corsproxy.io') && !logoImgSmall.src.includes('data:image/svg+xml')) {
                    const proxyUrl = this.getProxiedLogoUrl(originalLogoUrl);
                    logoImgSmall.src = proxyUrl;
                } else {
                    logoImgSmall.src = this.generatePlaceholderUrl(station.name);
                }
            }
        }, 10000);
        
        // Clear timeout when image loads successfully
        logoImg.addEventListener('load', () => {
            if (playerLogoTimeout) clearTimeout(playerLogoTimeout);
            logoImg.style.opacity = '1';
        }, { once: true });
        
        if (logoImgSmall) {
            logoImgSmall.addEventListener('load', () => {
                logoImgSmall.style.opacity = '1';
            }, { once: true });
        }
        
        // Error handler - try proxy, then placeholder
        const handleLogoError = function() {
            if (playerLogoTimeout) clearTimeout(playerLogoTimeout);
            
            // Try proxy if we haven't already and have original URL
            if (originalLogoUrl && !hasTriedProxy && !this.src.includes('corsproxy.io') && !this.src.includes('data:image/svg+xml')) {
                hasTriedProxy = true;
                const proxyUrl = window.radioApp.getProxiedLogoUrl(originalLogoUrl);
                this.src = proxyUrl;
                if (logoImgSmall && this === logoImg) logoImgSmall.src = proxyUrl;
                else if (logoImgSmall && this === logoImgSmall) logoImg.src = proxyUrl;
                
                // Set timeout for proxy attempt
                playerLogoTimeout = setTimeout(() => {
                    if (!this.complete || this.naturalWidth === 0) {
                        const placeholder = window.radioApp.generatePlaceholderUrl(station.name);
                        this.src = placeholder;
                        if (logoImgSmall && this === logoImg) logoImgSmall.src = placeholder;
                        else if (logoImgSmall && this === logoImgSmall) logoImg.src = placeholder;
                    }
                }, 5000);
            } else {
                // Already tried proxy or no original URL, use placeholder
                if (!this.src.includes('data:image/svg+xml')) {
                    const placeholder = window.radioApp.generatePlaceholderUrl(station.name);
                    this.src = placeholder;
                    if (logoImgSmall && this === logoImg) logoImgSmall.src = placeholder;
                    else if (logoImgSmall && this === logoImgSmall) logoImg.src = placeholder;
                }
            }
        };
        
        logoImg.onerror = handleLogoError;
        if (logoImgSmall) logoImgSmall.onerror = handleLogoError;

        // Update playing state on channel items
        document.querySelectorAll('.channel-item').forEach(item => {
            item.classList.remove('playing');
        });
        
        if (itemElement) {
            itemElement.classList.add('playing');
        } else {
            // Find the item by station name and URL
            document.querySelectorAll('.channel-item').forEach(item => {
                const nameElement = item.querySelector('.channel-name');
                if (nameElement && nameElement.textContent === station.name) {
                    item.classList.add('playing');
                }
            });
        }

        // Update favorite button in player area
        this.updatePlayerFavoriteButton();

        // Load and play
        this.loadStation(station.url);
    }
    
    updatePlayerFavoriteButton() {
        if (!this.currentStation) return;
        
        const isFav = this.isFavorite(this.currentStation);
        this.playerFavoriteBtn.classList.toggle('active', isFav);
        this.playerFavoriteBtn.title = isFav ? 'Favorilerden çıkar' : 'Favorilere ekle';
        
        if (this.playerFavoriteBtnFullscreen) {
            this.playerFavoriteBtnFullscreen.classList.toggle('active', isFav);
            this.playerFavoriteBtnFullscreen.title = isFav ? 'Favorilerden çıkar' : 'Favorilere ekle';
        }
        
        // Add click handler if not already added
        if (!this.playerFavoriteBtn.hasAttribute('data-handler-attached')) {
            this.playerFavoriteBtn.setAttribute('data-handler-attached', 'true');
            this.playerFavoriteBtn.addEventListener('click', () => {
                const isNowFavorite = this.toggleFavorite(this.currentStation);
                this.playerFavoriteBtn.classList.toggle('active', isNowFavorite);
                this.playerFavoriteBtn.title = isNowFavorite ? 'Favorilerden çıkar' : 'Favorilere ekle';
                
                // Update favorite star in channel list
                document.querySelectorAll('.channel-item').forEach(item => {
                    const nameElement = item.querySelector('.channel-name');
                    if (nameElement && nameElement.textContent === this.currentStation.name) {
                        const favBtn = item.querySelector('.favorite-star');
                        if (favBtn) {
                            favBtn.classList.toggle('active', isNowFavorite);
                        }
                    }
                });
            });
        }
    }

    loadStation(url) {
        // Clear previous loading state
        this.clearLoadingTimeout();
        this.hideLoadingState();
        
        // Stop current audio first
        this.audio.pause();
        this.audio.src = '';
        
        // Set new source with optimized settings
        this.audio.preload = 'auto';
        this.audio.src = url;
        
        // Load and try to play immediately
        this.audio.load();
        
        // Auto-play (browser may block this, user interaction required)
        const playPromise = this.audio.play();
        
        if (playPromise !== undefined) {
            playPromise
                .then(() => {
                    // Playing started successfully
                    this.clearLoadingTimeout();
                })
                .catch(error => {
                    console.warn('Auto-play blocked:', error);
                    // User needs to click play button - this is normal
                });
        }
    }
    
    clearLoadingTimeout() {
        if (this.loadingTimeout) {
            clearTimeout(this.loadingTimeout);
            this.loadingTimeout = null;
        }
    }
    
    showLoadingState() {
        const stationName = document.getElementById('stationName');
        if (stationName) {
            stationName.innerHTML = 'Yükleniyor... <span class="loading-dots"></span>';
        }
        this.playPauseBtn.disabled = true;
        this.playPauseBtn.style.opacity = '0.6';
    }
    
    hideLoadingState() {
        const stationName = document.getElementById('stationName');
        if (stationName && this.currentStation) {
            stationName.textContent = this.currentStation.name;
        }
        this.playPauseBtn.disabled = false;
        this.playPauseBtn.style.opacity = '1';
    }
    
    formatTime(seconds) {
        if (!isFinite(seconds) || isNaN(seconds)) {
            return '0:00';
        }
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    
    updateProgressBar() {
        if (!this.playerProgressFill || !this.playerTimeCurrent || !this.playerTimeDuration) {
            return;
        }
        
        const currentTime = this.audio.currentTime || 0;
        const duration = this.audio.duration || 0;
        
        // Update time displays
        this.playerTimeCurrent.textContent = this.formatTime(currentTime);
        
        if (duration && isFinite(duration)) {
            this.playerTimeDuration.textContent = this.formatTime(duration);
            
            // Update progress bar
            const progress = (currentTime / duration) * 100;
            this.playerProgressFill.style.width = `${Math.min(100, Math.max(0, progress))}%`;
        } else {
            // Live stream or duration not available
            this.playerTimeDuration.textContent = '∞';
            this.playerProgressFill.style.width = '0%';
        }
    }
    
    findNextWorkingStation() {
        // Try to find and play next working station in same category
        const allStations = this.currentCategory === 'Tümü' 
            ? this.parser.stations 
            : this.parser.getStationsByCategory(this.currentCategory);
        
        const workingStations = allStations.filter(s => 
            !this.isBroken(s) && 
            this.getStationId(s) !== this.getStationId(this.currentStation)
        );
        
        if (workingStations.length > 0) {
            // Find index of current station
            const currentIndex = workingStations.findIndex(s => 
                this.getStationId(s) === this.getStationId(this.currentStation)
            );
            
            // Play next station or first one
            const nextIndex = currentIndex >= 0 && currentIndex < workingStations.length - 1
                ? currentIndex + 1
                : 0;
            
            setTimeout(() => {
                this.selectStation(workingStations[nextIndex]);
            }, 1000);
        }
    }

    getWorkingStations() {
        // Get all working stations in the currently displayed category
        // Always use currentCategory to stay in the same page/category
        const categoryToUse = this.currentCategory;
        
        let allStations = [];
        
        if (categoryToUse === 'Tümü') {
            allStations = this.parser.stations;
        } else if (categoryToUse === 'Favoriler') {
            allStations = this.favorites.map(favId => {
                return this.parser.stations.find(s => this.getStationId(s) === favId);
            }).filter(s => s !== undefined);
        } else if (categoryToUse === 'Son Dinlenenler') {
            allStations = this.recentlyPlayed.map(recentId => {
                return this.parser.stations.find(s => this.getStationId(s) === recentId);
            }).filter(s => s !== undefined);
        } else {
            allStations = this.parser.getStationsByCategory(categoryToUse);
        }
        
        return allStations.filter(s => !this.isBroken(s));
    }

    playNextStation() {
        if (!this.currentStation) return;
        
        const workingStations = this.getWorkingStations();
        if (workingStations.length === 0) return;
        
        const currentIndex = workingStations.findIndex(s => 
            this.getStationId(s) === this.getStationId(this.currentStation)
        );
        
        const nextIndex = currentIndex >= 0 && currentIndex < workingStations.length - 1
            ? currentIndex + 1
            : 0;
        
        // Don't change category, just select the station
        this.selectStation(workingStations[nextIndex], null);
    }

    playPreviousStation() {
        if (!this.currentStation) return;
        
        const workingStations = this.getWorkingStations();
        if (workingStations.length === 0) return;
        
        const currentIndex = workingStations.findIndex(s => 
            this.getStationId(s) === this.getStationId(this.currentStation)
        );
        
        const prevIndex = currentIndex > 0
            ? currentIndex - 1
            : workingStations.length - 1;
        
        // Don't change category, just select the station
        this.selectStation(workingStations[prevIndex], null);
    }

    stopStation() {
        if (!this.currentStation) return;
        
        // Toggle: if playing, stop; if stopped, play
        if (this.isPlaying) {
            // Stop
            if (this.audio) {
                this.audio.pause();
                this.audio.currentTime = 0;
            }
            this.isPlaying = false;
            this.updatePlayButton();
            this.stopSpectrumAnimation();
        } else {
            // Play
            if (this.audio) {
                this.audio.play().catch(error => {
                    console.error('Play error:', error);
                    this.showError('Radyo yayını başlatılamadı. Lütfen tekrar deneyin.');
                });
            }
        }
    }

    togglePlayPause() {
        if (!this.currentStation) return;

        if (this.isPlaying) {
            this.audio.pause();
        } else {
            this.audio.play().catch(error => {
                console.error('Play error:', error);
                this.showError('Radyo yayını başlatılamadı. Lütfen tekrar deneyin.');
            });
        }
    }

    updatePlayButton() {
        if (this.isPlaying) {
            this.playPauseBtn.classList.add('playing');
            this.playPauseBtn.title = 'Durdur';
            if (this.playPauseBtnFullscreen) {
                this.playPauseBtnFullscreen.classList.add('playing');
                this.playPauseBtnFullscreen.title = 'Durdur';
            }
        } else {
            this.playPauseBtn.classList.remove('playing');
            this.playPauseBtn.title = 'Oynat';
            if (this.playPauseBtnFullscreen) {
                this.playPauseBtnFullscreen.classList.remove('playing');
                this.playPauseBtnFullscreen.title = 'Oynat';
            }
        }
        
        // Update play/pause icons
        const playIcons = [this.playPauseBtn, this.playPauseBtnFullscreen].filter(btn => btn);
        playIcons.forEach(btn => {
            const playIcon = btn.querySelector('.play-icon');
            const pauseIcon = btn.querySelector('.pause-icon');
            if (playIcon && pauseIcon) {
                if (this.isPlaying) {
                    playIcon.style.display = 'none';
                    pauseIcon.style.display = 'block';
                } else {
                    playIcon.style.display = 'block';
                    pauseIcon.style.display = 'none';
                }
            }
        });
    }

    setVolume(value) {
        this.audio.volume = value;
        
        // Update volume sliders
        if (this.volumeSlider) {
            this.volumeSlider.value = value * 100;
        }
        if (this.volumeSliderFullscreen) {
            this.volumeSliderFullscreen.value = value * 100;
        }
        
        // Update volume button icons (both normal and fullscreen)
        const volumeButtons = [this.volumeBtn, this.volumeBtnFullscreen].filter(btn => btn);
        volumeButtons.forEach(volumeBtn => {
            const volumeIcon = volumeBtn.querySelector('svg');
            if (volumeIcon) {
        if (value === 0) {
            volumeIcon.innerHTML = `
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <line x1="23" y1="9" x2="17" y2="15"></line>
                <line x1="17" y1="9" x2="23" y2="15"></line>
            `;
        } else if (value < 0.5) {
            volumeIcon.innerHTML = `
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
            `;
        } else {
            volumeIcon.innerHTML = `
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            `;
        }
            }
        });
    }

    searchChannels(query) {
        this.renderChannels(query);
    }

    showError(message) {
        alert(message); // Can be replaced with a better UI component
    }
    
    getProxiedLogoUrl(originalUrl) {
        // Use CORS proxy to bypass CORS issues for images
        // corsproxy.io works best for images
        return `https://corsproxy.io/?${encodeURIComponent(originalUrl)}`;
    }
    
    async loadLogoWithProxy(logoUrl, imgElement, stationName) {
        // Try to load logo through proxy with fallback
        const proxies = [
            `https://corsproxy.io/?${encodeURIComponent(logoUrl)}`,
            `https://api.allorigins.win/raw?url=${encodeURIComponent(logoUrl)}`,
            `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(logoUrl)}`
        ];
        
        // Try first proxy
        imgElement.src = proxies[0];
        
        // If fails, try next proxy
        imgElement.onerror = function() {
            if (this.dataset.proxyIndex === undefined) {
                this.dataset.proxyIndex = '0';
            }
            const currentIndex = parseInt(this.dataset.proxyIndex);
            if (currentIndex < proxies.length - 1) {
                this.dataset.proxyIndex = (currentIndex + 1).toString();
                this.src = proxies[currentIndex + 1];
            } else {
                // All proxies failed, use placeholder
                this.src = window.radioApp.generatePlaceholderUrl(stationName);
            }
        };
    }
    
    generatePlaceholderUrl(text) {
        // Create a better placeholder with gradient background
        const initials = text.substring(0, 2).toUpperCase().replace(/[^A-Z0-9]/g, '');
        const displayText = initials || 'RD';
        const colors = ['6366f1', '8b5cf6', 'ec4899', 'f59e0b', '10b981', '3b82f6', 'a855f7'];
        const color = colors[text.charCodeAt(0) % colors.length];
        
        // Create SVG with proper encoding
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
            <defs>
                <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:#${color};stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#${color}88;stop-opacity:0.8" />
                </linearGradient>
            </defs>
            <rect width="200" height="200" fill="url(#grad)"/>
            <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" 
                  fill="white" font-size="48" font-weight="bold" font-family="Arial, sans-serif">${displayText}</text>
        </svg>`;
        
        return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.radioApp = new RadioApp();
});

