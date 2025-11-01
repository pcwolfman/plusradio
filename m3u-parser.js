/**
 * M3U Playlist Parser
 * Parses M3U files and extracts radio station information
 */

class M3UParser {
    constructor() {
        this.stations = [];
        this.categories = new Set();
    }

    /**
     * Parse M3U file content
     * @param {string} content - M3U file content
     * @returns {Array} Array of station objects
     */
    parse(content) {
        this.stations = [];
        this.categories.clear();

        const lines = content.split('\n');
        let currentStation = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            if (line.startsWith('#EXTINF:')) {
                // Parse EXTINF line
                const info = this.parseExtInf(line);
                
                // Skip header lines
                if (!info) {
                    continue;
                }
                
                currentStation = {
                    name: info.name || 'Unknown Station',
                    logo: info.logo || 'https://via.placeholder.com/200?text=Radio',
                    group: info.group || 'Genel',
                    url: ''
                };

                // Add category (skip generic/title categories)
                if (currentStation.group && 
                    currentStation.group !== 'RADYO KANALLARI  | TV' &&
                    !currentStation.group.startsWith('----------')) {
                    this.categories.add(currentStation.group);
                }

            } else if (line && !line.startsWith('#') && currentStation) {
                // URL line
                currentStation.url = line;
                if (currentStation.url) {
                    this.stations.push(currentStation);
                }
                currentStation = null;
            }
        }

        // Sort categories - prioritize common ones
        const categoryOrder = ['Pop', 'Rock', 'Türkü', 'Arabesk', 'Haber', 'Spor', 'Jazz', 'Klasik', 'Rap', 'Hip Hop'];
        const sortedCategories = Array.from(this.categories).sort((a, b) => {
            const indexA = categoryOrder.indexOf(a);
            const indexB = categoryOrder.indexOf(b);
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            return a.localeCompare(b, 'tr');
        });
        this.categories = new Set(sortedCategories);

        return this.stations;
    }

    /**
     * Parse EXTINF line
     * @param {string} line - EXTINF line
     * @returns {Object} Parsed information
     */
    parseExtInf(line) {
        const result = {
            name: '',
            logo: '',
            group: ''
        };

        // Extract attributes
        const attrMatch = line.match(/([^=]+)="([^"]+)"/g);
        if (attrMatch) {
            attrMatch.forEach(attr => {
                const [key, value] = attr.split('=');
                const cleanValue = value.replace(/"/g, '');
                
                if (key.includes('logo')) {
                    result.logo = cleanValue;
                } else if (key.includes('group-title')) {
                    result.group = cleanValue;
                }
            });
        }

        // Extract station name (last part after comma)
        const commaIndex = line.lastIndexOf(',');
        if (commaIndex !== -1) {
            let fullName = line.substring(commaIndex + 1).trim();
            
            // Remove header lines (starting with dashes)
            if (fullName.startsWith('----------')) {
                return null; // Skip header lines
            }
            
            // Extract category from name (format: "Station Name | Category")
            const categoryMatch = fullName.match(/\s*\|\s*(.+)$/);
            if (categoryMatch) {
                result.group = categoryMatch[1].trim();
                // Remove category from name
                result.name = fullName.replace(/\s*\|\s*.+$/, '').trim();
            } else {
                result.name = fullName;
                // Extract category from station name keywords
                result.group = this.extractCategoryFromName(fullName);
            }
            
            // Clean up name
            result.name = result.name.replace(/\s*\|\s*.+$/, '').trim();
        }

        return result;
    }

    /**
     * Extract category from station name based on keywords
     * @param {string} name - Station name
     * @returns {string} Category name
     */
    extractCategoryFromName(name) {
        const lowerName = name.toLowerCase();
        
        // Category keywords mapping
        const categoryMap = {
            'pop': 'Pop',
            'rock': 'Rock',
            'türkü': 'Türkü',
            'turkü': 'Türkü',
            'arabesk': 'Arabesk',
            'haber': 'Haber',
            'spor': 'Spor',
            'jazz': 'Jazz',
            'klasik': 'Klasik',
            'rap': 'Rap',
            'hip hop': 'Hip Hop',
            'hiphop': 'Hip Hop',
            'türk sanat': 'Türk Sanat Müziği',
            'tsm': 'Türk Sanat Müziği',
            'türk halk': 'Türk Halk Müziği',
            'thm': 'Türk Halk Müziği',
            'slow': 'Slow',
            'dini': 'Dini',
            'çocuk': 'Çocuk',
            'nostalji': 'Nostalji',
            'remix': 'Remix',
            'türkçe': 'Türkçe Pop',
            'foreign': 'Yabancı',
            'yabancı': 'Yabancı',
            'english': 'Yabancı',
            'ingilizce': 'Yabancı'
        };
        
        // Check for category keywords in name
        for (const [keyword, category] of Object.entries(categoryMap)) {
            if (lowerName.includes(keyword)) {
                return category;
            }
        }
        
        // Check if it's a news/info station
        if (lowerName.includes('haber') || lowerName.includes('news') || 
            lowerName.includes('info') || lowerName.includes('info')) {
            return 'Haber';
        }
        
        // Default category
        return 'Pop';
    }

    /**
     * Get all categories
     * @returns {Array} Array of category names
     */
    getCategories() {
        return Array.from(this.categories);
    }

    /**
     * Get stations by category
     * @param {string} category - Category name
     * @returns {Array} Filtered stations
     */
    getStationsByCategory(category) {
        if (!category || category === 'Tümü') {
            return this.stations;
        }
        return this.stations.filter(station => station.group === category);
    }

    /**
     * Search stations
     * @param {string} query - Search query
     * @returns {Array} Filtered stations
     */
    searchStations(query) {
        if (!query) return this.stations;
        
        const lowerQuery = query.toLowerCase();
        return this.stations.filter(station =>
            station.name.toLowerCase().includes(lowerQuery) ||
            station.group.toLowerCase().includes(lowerQuery)
        );
    }
}

