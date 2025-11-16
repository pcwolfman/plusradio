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
                    logo: info.logo || '', // Don't use placeholder here, let app.js handle it
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
        const categoryOrder = ['Pop', 'Rock', 'Türkü', 'Türk Halk Müziği', 'Türk Sanat Müziği', 'Arabesk', 'Slow', 'Haber', 'Spor', 'Jazz', 'Klasik', 'Rap', 'Dini', 'Nostalji', 'Yabancı', 'Çocuk', 'Genel'];
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

        // Extract attributes - improved regex to handle tvg-logo properly
        // First try: direct regex for tvg-logo (most reliable)
        const logoMatch = line.match(/tvg-logo=["']([^"']+)["']/);
        if (logoMatch && logoMatch[1]) {
            result.logo = logoMatch[1].trim();
        }
        
        // Extract group-title - but ignore generic ones like "canliradyodinle.fm"
        const groupMatch = line.match(/group-title=["']([^"']+)["']/);
        if (groupMatch && groupMatch[1]) {
            const groupTitle = groupMatch[1].trim();
            // Ignore generic group titles
            if (groupTitle && 
                groupTitle !== 'canliradyodinle.fm' && 
                !groupTitle.includes('RADYO KANALLARI') &&
                groupTitle.length > 2) {
                result.group = groupTitle;
            }
        }
        
        // Fallback: try generic attribute matching
        if (!result.logo) {
            const attrMatch = line.match(/([^=]+)="([^"]+)"/g);
            if (attrMatch) {
                attrMatch.forEach(attr => {
                    const parts = attr.split('=');
                    if (parts.length === 2) {
                        const key = parts[0].trim();
                        const value = parts[1].replace(/^["']|["']$/g, '').trim();
                        
                        if (key.includes('logo') || key === 'tvg-logo') {
                            result.logo = value;
                        } else if (key.includes('group-title') || key === 'group-title') {
                            result.group = value;
                        }
                    }
                });
            }
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
                // Only extract category from name if group-title was not set or was generic
                if (!result.group || result.group === 'canliradyodinle.fm' || result.group === 'Genel') {
                    result.group = this.extractCategoryFromName(fullName);
                }
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
        
        // Priority-based category keywords mapping (order matters - more specific first)
        const categoryChecks = [
            // Haber & Spor (check first as they're very specific)
            { keywords: ['habertürk', 'haber turk', 'ntv radyo', 'cnn türk', 'trt haber', 'trt spor', 'a haber', 'show radyo', 'show tv'], category: 'Haber' },
            { keywords: ['spor', 'beşiktaş', 'galatasaray', 'fenerbahçe', 'trabzonspor', 'süper lig'], category: 'Spor' },
            
            // Türk Sanat Müziği
            { keywords: ['türk sanat', 'tsm', 'sanat müziği', 'klasik türk', 'türk klasik'], category: 'Türk Sanat Müziği' },
            
            // Türk Halk Müziği
            { keywords: ['türk halk', 'thm', 'halk müziği', 'türkü', 'turkü', 'folk'], category: 'Türk Halk Müziği' },
            
            // Arabesk
            { keywords: ['arabesk', 'arabesk fm', 'arabesk radyo'], category: 'Arabesk' },
            
            // Slow
            { keywords: ['slow', 'slow fm', 'slow radyo', 'romantik', 'romantic'], category: 'Slow' },
            
            // Dini/İslami
            { keywords: ['dini', 'islami', 'islam', 'kuran', 'kur\'an', 'mevlid', 'ilahi', 'tasavvuf'], category: 'Dini' },
            
            // Rock & Rap
            { keywords: ['rock', 'rock fm', 'rock radyo'], category: 'Rock' },
            { keywords: ['rap', 'hip hop', 'hiphop', 'rap fm'], category: 'Rap' },
            
            // Jazz & Klasik
            { keywords: ['jazz', 'jazz fm', 'caz'], category: 'Jazz' },
            { keywords: ['klasik', 'classical', 'klasik müzik', 'classical music'], category: 'Klasik' },
            
            // Nostalji
            { keywords: ['nostalji', 'nostalgia', 'eski', 'retro'], category: 'Nostalji' },
            
            // Çocuk
            { keywords: ['çocuk', 'cocuk', 'kids', 'children'], category: 'Çocuk' },
            
            // Yabancı Müzik
            { keywords: ['yabancı', 'yabanci', 'foreign', 'english', 'ingilizce', 'international', 'world music'], category: 'Yabancı' },
            
            // Pop (check last as it's most common)
            { keywords: ['türkçe pop', 'turkce pop', 'pop', 'fm', 'radyo'], category: 'Pop' }
        ];
        
        // Check each category in priority order
        for (const check of categoryChecks) {
            for (const keyword of check.keywords) {
                if (lowerName.includes(keyword)) {
                    return check.category;
                }
            }
        }
        
        // Check for news/info stations
        if (lowerName.includes('haber') || lowerName.includes('news') || 
            lowerName.includes('info') || lowerName.includes('gazete')) {
            return 'Haber';
        }
        
        // Default category - try to infer from common patterns
        if (lowerName.includes('fm') || lowerName.includes('radyo')) {
            return 'Pop'; // Most Turkish radio stations are pop
        }
        
        return 'Genel';
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

