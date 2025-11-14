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
        this.searchInput = document.getElementById('searchInput');
        this.searchBtn = null; // Removed from HTML
        this.bottomPlayer = document.getElementById('bottomPlayer');
        this.playerFavoriteBtn = document.getElementById('playerFavoriteBtn');
        this.listToggleBtn = document.getElementById('listToggleBtn');
        this.playerSpectrumCanvas = document.getElementById('playerSpectrumCanvas');
        
        // Web Audio API for spectrum analysis
        this.audioContext = null;
        this.analyser = null;
        this.dataArray = null;
        this.playerSpectrumAnimationId = null;
        
        this.appContainer = document.getElementById('appContainer');
        this.offlineMessage = document.getElementById('offlineMessage');
        
        // Check online status and setup listeners
        this.checkOnlineStatus();
        this.setupOnlineListeners();
        
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
            return stored || 'normal'; // 'compact', 'normal', 'grid'
        } catch (e) {
            return 'normal';
        }
    }
    
    saveViewMode() {
        localStorage.setItem('plusRadio_viewMode', this.viewMode);
    }
    
    toggleViewMode() {
        // Cycle through: normal -> compact -> grid -> normal
        if (this.viewMode === 'normal') {
            this.viewMode = 'compact';
        } else if (this.viewMode === 'compact') {
            this.viewMode = 'grid';
        } else {
            this.viewMode = 'normal';
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
                if (this.bottomPlayer && this.bottomPlayer.classList.contains('visible')) {
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
            const barWidth = width / barCount * 2.5;
            let x = 0;
            
            // Draw compact spectrum bars with unique colors
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

        // Search
        this.searchInput.addEventListener('input', (e) => {
            this.searchChannels(e.target.value);
        });

        this.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.searchChannels(e.target.value);
            }
        });

        // View mode toggle
        if (this.listToggleBtn) {
            this.listToggleBtn.addEventListener('click', () => {
                this.toggleViewMode();
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
            if (logoUrl && logoUrl.startsWith('http://')) {
                logoUrl = logoUrl.replace('http://', 'https://');
            }
            if (!logoUrl || logoUrl === '') {
                logoUrl = this.generatePlaceholderUrl(station.name);
            }
            
            // Different HTML structure based on view mode
            if (this.viewMode === 'compact') {
                // Compact view: küçük kutucuklar, sadece logo ve isim
                item.innerHTML = `
                    <img src="${logoUrl}" alt="${station.name}" class="channel-logo" 
                         loading="lazy"
                         referrerpolicy="no-referrer"
                         crossorigin="anonymous"
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
                             loading="lazy"
                             referrerpolicy="no-referrer"
                             crossorigin="anonymous"
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
                         loading="lazy"
                         referrerpolicy="no-referrer"
                         crossorigin="anonymous"
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

            // Logo error handler
            const logoImg = item.querySelector('.channel-logo');
            logoImg.addEventListener('error', function() {
                const stationName = this.getAttribute('data-station-name');
                if (stationName) {
                    this.src = window.radioApp.generatePlaceholderUrl(stationName);
                }
            });

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
        
        // Show bottom player
        this.bottomPlayer.classList.add('visible');
        
        // Resize player spectrum canvas when player becomes visible
        if (this.playerSpectrumCanvas) {
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
        }
        
        // Update bottom player UI
        document.getElementById('stationName').textContent = station.name;
        document.getElementById('stationGroup').textContent = station.group || '-';
        const logoImg = document.getElementById('stationLogo');
        let logoUrl = station.logo || '';
        if (logoUrl && logoUrl.startsWith('http://')) {
            logoUrl = logoUrl.replace('http://', 'https://');
        }
        if (!logoUrl || logoUrl === '') {
            logoUrl = this.generatePlaceholderUrl(station.name);
        }
        logoImg.src = logoUrl;
        logoImg.setAttribute('referrerpolicy', 'no-referrer');
        logoImg.setAttribute('crossorigin', 'anonymous');
        logoImg.onerror = function() {
            this.src = window.radioApp.generatePlaceholderUrl(station.name);
        };

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
        } else {
            this.playPauseBtn.classList.remove('playing');
            this.playPauseBtn.title = 'Oynat';
        }
    }

    setVolume(value) {
        this.audio.volume = value;
        
        // Update volume button icon
        const volumeIcon = this.volumeBtn.querySelector('svg');
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

    searchChannels(query) {
        this.renderChannels(query);
    }

    showError(message) {
        alert(message); // Can be replaced with a better UI component
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

