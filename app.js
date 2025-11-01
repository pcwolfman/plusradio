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
        
        this.audio = document.getElementById('audioPlayer');
        this.playPauseBtn = document.getElementById('playPauseBtn');
        this.volumeBtn = document.getElementById('volumeBtn');
        this.volumeSlider = document.getElementById('volumeSlider');
        this.searchInput = document.getElementById('searchInput');
        this.searchBtn = document.getElementById('searchBtn');
        
        this.init();
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
            
        } catch (error) {
            console.error('Hata:', error);
            this.showError(error.message);
        }
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
            document.querySelector('.station-logo-container').classList.add('playing');
        });

        this.audio.addEventListener('pause', () => {
            this.isPlaying = false;
            this.updatePlayButton();
            document.querySelector('.station-logo-container').classList.remove('playing');
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
            // Set timeout for slow connections (8 seconds)
            this.loadingTimeout = setTimeout(() => {
                if (this.isLoading && this.currentStation) {
                    console.warn('Loading timeout for:', this.currentStation.name);
                    this.markAsBroken(this.currentStation);
                    this.audio.load(); // Reset
                    this.showError('Radyo yayını çok yavaş yükleniyor. Liste güncellendi.');
                    this.findNextWorkingStation();
                }
            }, 8000);
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
            }, 5000);
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

        this.searchBtn.addEventListener('click', () => {
            this.searchChannels(this.searchInput.value);
        });

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

        // Add separator
        const separator = document.createElement('div');
        separator.className = 'category-separator';
        categoryList.appendChild(separator);

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

            const card = document.createElement('div');
            card.className = 'channel-card';
            
            if (this.currentStation && this.currentStation.name === station.name && 
                this.currentStation.url === station.url) {
                card.classList.add('playing');
            }

            const isFav = this.isFavorite(station);
            const favoriteIcon = isFav ? '❤️' : '🤍';
            
            // Fix logo URL - convert http to https if needed, add referrer policy
            let logoUrl = station.logo || '';
            if (logoUrl && logoUrl.startsWith('http://')) {
                logoUrl = logoUrl.replace('http://', 'https://');
            }
            if (!logoUrl || logoUrl === '') {
                logoUrl = this.generatePlaceholderUrl(station.name);
            }
            
            card.innerHTML = `
                <div class="channel-card-header">
                    <button class="favorite-btn" title="${isFav ? 'Favorilerden çıkar' : 'Favorilere ekle'}">
                        ${favoriteIcon}
                    </button>
                </div>
                <div class="channel-logo-container-card">
                    <img src="${logoUrl}" alt="${station.name}" class="channel-logo" 
                         loading="lazy"
                         referrerpolicy="no-referrer"
                         crossorigin="anonymous"
                         data-station-name="${station.name.replace(/"/g, '&quot;')}">
                    <div class="logo-overlay"></div>
                </div>
                <div class="channel-name">${station.name}</div>
            `;

            // Logo error handler
            const logoImg = card.querySelector('.channel-logo');
            logoImg.addEventListener('error', function() {
                const stationName = this.getAttribute('data-station-name');
                if (stationName) {
                    this.src = window.radioApp.generatePlaceholderUrl(stationName);
                }
            });

            // Favorite button handler
            const favBtn = card.querySelector('.favorite-btn');
            favBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isNowFavorite = this.toggleFavorite(station);
                favBtn.innerHTML = isNowFavorite ? '❤️' : '🤍';
                favBtn.title = isNowFavorite ? 'Favorilerden çıkar' : 'Favorilere ekle';
                if (this.currentCategory === 'Favoriler') {
                    this.renderChannels(); // Refresh if in favorites view
                }
            });

            // Card click handler
            card.addEventListener('click', (e) => {
                if (e.target.classList.contains('favorite-btn')) return;
                e.stopPropagation();
                this.selectStation(station, card);
            });
            channelsGrid.appendChild(card);
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

    selectStation(station, cardElement = null) {
        this.currentStation = station;
        
        // Add to recently played
        this.addToRecentlyPlayed(station);
        
        // Update UI
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

        // Update playing state on cards
        document.querySelectorAll('.channel-card').forEach(card => {
            card.classList.remove('playing');
        });
        
        if (cardElement) {
            cardElement.classList.add('playing');
        } else {
            // Find the card by station name and URL
            document.querySelectorAll('.channel-card').forEach(card => {
                const nameElement = card.querySelector('.channel-name');
                if (nameElement && nameElement.textContent === station.name) {
                    card.classList.add('playing');
                }
            });
        }

        // Update favorite button in player area if needed
        this.updatePlayerFavoriteButton();

        // Load and play
        this.loadStation(station.url);
    }
    
    updatePlayerFavoriteButton() {
        // This can be used to show favorite status in player area if needed
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
        } else {
            this.playPauseBtn.classList.remove('playing');
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

