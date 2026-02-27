/**
 * Game metadata provider abstraction layer.
 *
 * Provider adapters expose:
 *   search(query, config) => basic game cards
 *   details(apiId, config) => rich metadata for one game
 *   test(config)
 */

function isSet(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return true;
}

function uniqStrings(values) {
    const out = [];
    const seen = new Set();
    for (const value of values) {
        if (!isSet(value)) continue;
        const normalized = String(value).trim();
        if (!normalized) continue;
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        out.push(normalized);
    }
    return out;
}

function canonicalizeVideoUrl(url) {
    if (!url) return '';
    try {
        const parsed = new URL(url);
        const host = parsed.hostname.toLowerCase();

        // Normalize youtube URLs to the same watch?v=<id> format
        if (host.includes('youtube.com') || host.includes('youtu.be')) {
            let videoId = parsed.searchParams.get('v');
            if (!videoId && host.includes('youtu.be')) {
                videoId = parsed.pathname.replace('/', '');
            }
            if (!videoId && parsed.pathname.includes('/embed/')) {
                videoId = parsed.pathname.split('/embed/')[1]?.split('/')[0];
            }
            if (videoId) return `https://www.youtube.com/watch?v=${videoId}`;
        }

        parsed.hash = '';
        return parsed.toString();
    } catch {
        return String(url).trim();
    }
}

function normalizeVideoName(name) {
    return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeTitle(value) {
    return (value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function pickBestSearchMatch(results, title, releaseYear) {
    if (!Array.isArray(results) || results.length === 0) return null;
    const target = normalizeTitle(title);
    const withScore = results.map((result) => {
        let score = 0;
        const candidate = normalizeTitle(result.title);
        if (candidate === target) score += 3;
        else if (candidate.includes(target) || target.includes(candidate)) score += 1;

        if (releaseYear && result.release_year === releaseYear) score += 2;
        else if (releaseYear && result.release_year && Math.abs(result.release_year - releaseYear) <= 1) score += 1;

        return { result, score };
    });

    withScore.sort((a, b) => b.score - a.score);
    return withScore[0].result;
}

function mergeProviderData(providerDataOrdered) {
    const scalarFields = [
        'title', 'description', 'genre', 'release_year', 'release_date', 'platforms',
        'rating', 'developer', 'tags', 'website', 'age_rating',
        'time_to_beat', 'player_counts', 'coop', 'online_offline',
    ];

    const imageTypes = ['poster', 'thumbnail', 'logo', 'backdrop'];

    const merged = {
        screenshots: [],
        videos: [],
        images: {
            poster: null,
            thumbnail: null,
            logo: null,
            backdrop: null,
        },
    };

    for (const field of scalarFields) {
        merged[field] = null;
    }

    for (const providerGame of providerDataOrdered) {
        if (!providerGame) continue;

        for (const field of scalarFields) {
            if (!isSet(merged[field]) && isSet(providerGame[field])) {
                merged[field] = providerGame[field];
            }
        }

        if (Array.isArray(providerGame.screenshots)) {
            merged.screenshots.push(...providerGame.screenshots);
        }
        if (Array.isArray(providerGame.videos)) {
            merged.videos.push(...providerGame.videos);
        }

        for (const imageType of imageTypes) {
            if (!isSet(merged.images[imageType]) && isSet(providerGame.images?.[imageType])) {
                merged.images[imageType] = providerGame.images[imageType];
            }
        }
    }

    merged.screenshots = uniqStrings(merged.screenshots);

    const uniqueVideos = [];
    const seenVideos = new Set();
    for (const video of merged.videos) {
        if (!video || !video.url) continue;

        const videoType = String(video.type || '').toLowerCase();
        const videoName = String(video.name || '').toLowerCase();
        const isTrailer = videoType === 'trailer' || videoType === 'gameplay_trailer' || videoName.includes('trailer');
        const isGameplayTrailer = videoType === 'gameplay_trailer' || videoName.includes('gameplay trailer');
        if (!isTrailer && !isGameplayTrailer) continue;

        const canonicalUrl = canonicalizeVideoUrl(video.url);
        const normalizedName = normalizeVideoName(video.name);
        const key = `${canonicalUrl}::${normalizedName}`;
        if (seenVideos.has(key)) continue;
        seenVideos.add(key);

        uniqueVideos.push({
            ...video,
            type: isGameplayTrailer ? 'gameplay_trailer' : 'trailer',
            url: canonicalUrl,
        });
    }
    merged.videos = uniqueVideos;

    if (!isSet(merged.images.backdrop)) {
        merged.images.backdrop = merged.images.poster || merged.images.thumbnail || null;
    }
    if (!isSet(merged.images.thumbnail)) {
        merged.images.thumbnail = merged.images.poster || merged.images.backdrop || null;
    }

    return merged;
}

// ── RAWG Adapter ────────────────────────────────────────────────────────────
const rawgAdapter = {
    name: 'rawg',

    _toRating(g) {
        if (g.metacritic) return +(g.metacritic / 10).toFixed(1);
        if (g.rating) return +(g.rating * 2).toFixed(1);
        return null;
    },

    _mapBasic(g) {
        return {
            api_id: String(g.id),
            api_provider: 'rawg',
            title: g.name,
            cover_url: g.background_image || null,
            backdrop_url: g.background_image || null,
            description: g.description_raw || g.description || '',
            genre: (g.genres || []).map((x) => x.name).join(', '),
            release_year: g.released ? parseInt(g.released.slice(0, 4), 10) : null,
            platforms: (g.platforms || []).map((x) => x.platform?.name).filter(Boolean).join(', '),
            rating: this._toRating(g),
            developer: (g.developers || []).map((d) => d.name).filter(Boolean).join(', ') || null,
            tags: (g.tags || []).slice(0, 12).map((t) => t.name).filter(Boolean).join(', ') || null,
            website: g.website || null,
        };
    },

    _mapDetails(game, moviesData) {
        const basic = this._mapBasic(game);
        const screenshots = uniqStrings((game.short_screenshots || []).map((s) => s.image));

        const videos = [];
        for (const item of (moviesData?.results || [])) {
            const videoUrl = item?.data?.max || item?.data?.['480'];
            if (!videoUrl) continue;
            videos.push({
                provider: 'rawg',
                type: 'gameplay_trailer',
                name: item.name || 'Trailer',
                url: videoUrl,
            });
        }

        const released = game.released || null;
        const playtimeHours = game.playtime ? `~${game.playtime}h` : null;

        return {
            ...basic,
            release_date: released,
            age_rating: game.esrb_rating?.name || null,
            time_to_beat: playtimeHours,
            player_counts: null,
            coop: null,
            online_offline: null,
            screenshots,
            videos,
            images: {
                poster: game.background_image || null,
                thumbnail: game.background_image || null,
                logo: null,
                backdrop: game.background_image || null,
            },
        };
    },

    async search(query, config) {
        const key = config.api_key;
        if (!key) throw new Error('RAWG API key not configured');

        const url = `https://api.rawg.io/api/games?key=${encodeURIComponent(key)}&search=${encodeURIComponent(query)}&page_size=10`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`RAWG API error: ${res.status}`);
        const data = await res.json();
        return (data.results || []).map((g) => this._mapBasic(g));
    },

    async details(apiId, config) {
        const key = config.api_key;
        if (!key) throw new Error('RAWG API key not configured');

        const gameUrl = `https://api.rawg.io/api/games/${encodeURIComponent(apiId)}?key=${encodeURIComponent(key)}`;
        const moviesUrl = `https://api.rawg.io/api/games/${encodeURIComponent(apiId)}/movies?key=${encodeURIComponent(key)}`;

        const [gameRes, moviesRes] = await Promise.all([
            fetch(gameUrl),
            fetch(moviesUrl),
        ]);

        if (!gameRes.ok) throw new Error(`RAWG API error: ${gameRes.status}`);
        const gameData = await gameRes.json();
        const moviesData = moviesRes.ok ? await moviesRes.json() : { results: [] };

        return this._mapDetails(gameData, moviesData);
    },

    async test(config) {
        const key = config.api_key;
        if (!key) return { ok: false, detail: 'API key is missing' };
        try {
            const url = `https://api.rawg.io/api/games?key=${encodeURIComponent(key)}&page_size=1`;
            const res = await fetch(url);
            if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
            return { ok: true, detail: 'Connection successful' };
        } catch (err) {
            return { ok: false, detail: err.message };
        }
    },
};

// ── IGDB Adapter ────────────────────────────────────────────────────────────
const igdbAdapter = {
    name: 'igdb',
    _tokenCache: { token: null, expires: 0 },

    async _getToken(config) {
        const now = Date.now();
        if (this._tokenCache.token && this._tokenCache.expires > now) {
            return this._tokenCache.token;
        }

        const res = await fetch(
            `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(config.client_id)}&client_secret=${encodeURIComponent(config.client_secret)}&grant_type=client_credentials`,
            { method: 'POST' }
        );
        if (!res.ok) throw new Error(`IGDB token error: ${res.status}`);

        const data = await res.json();
        this._tokenCache = { token: data.access_token, expires: now + (data.expires_in - 60) * 1000 };
        return data.access_token;
    },

    _buildImage(url, size) {
        if (!url) return null;
        return `https:${url.replace('t_thumb', size)}`;
    },

    _formatAgeRating(ageRatings) {
        const first = (ageRatings || [])[0];
        if (!first) return null;

        if (first.rating) {
            if (first.category) return `Category ${first.category} - Rating ${first.rating}`;
            return `Rating ${first.rating}`;
        }
        return null;
    },

    _mapBasic(g) {
        const cover = this._buildImage(g.cover?.url, 't_cover_big_2x');
        const backdrop = g.screenshots?.length
            ? this._buildImage(g.screenshots[0].url, 't_screenshot_big')
            : (cover || null);

        const rawRating = g.aggregated_rating || g.rating || null;
        const rating = rawRating ? +(rawRating / 10).toFixed(1) : null;

        return {
            api_id: String(g.id),
            api_provider: 'igdb',
            title: g.name,
            cover_url: cover,
            backdrop_url: backdrop,
            description: g.summary || '',
            genre: (g.genres || []).map((x) => x.name).join(', '),
            release_year: g.first_release_date ? new Date(g.first_release_date * 1000).getFullYear() : null,
            platforms: (g.platforms || []).map((x) => x.name).join(', '),
            rating,
            developer: (g.involved_companies || [])
                .filter((ic) => ic.developer)
                .map((ic) => ic.company?.name)
                .filter(Boolean)
                .join(', ') || null,
            tags: (g.themes || []).map((t) => t.name).filter(Boolean).join(', ') || null,
            website: (g.websites || []).find((w) => w.category === 1)?.url || null,
        };
    },

    _mapDetails(gameData, timeToBeat, multiplayerModes, gameVideos) {
        const basic = this._mapBasic(gameData);

        const cover = this._buildImage(gameData.cover?.url, 't_cover_big_2x');
        const screenshotList = uniqStrings((gameData.screenshots || []).map((s) => this._buildImage(s.url, 't_screenshot_big')));
        const artworkList = uniqStrings((gameData.artworks || []).map((a) => this._buildImage(a.url, 't_1080p')));

        const videos = (gameVideos || [])
            .filter((v) => v.video_id)
            .map((v) => ({
                provider: 'igdb',
                type: 'trailer',
                name: v.name || 'Trailer',
                url: `https://www.youtube.com/watch?v=${v.video_id}`,
            }));

        const onlineMax = Math.max(0, ...(multiplayerModes || []).map((m) => m.onlinemax || 0));
        const offlineMax = Math.max(0, ...(multiplayerModes || []).map((m) => m.offlinemax || 0));
        const onlineCoopMax = Math.max(0, ...(multiplayerModes || []).map((m) => m.onlinecoopmax || 0));
        const offlineCoopMax = Math.max(0, ...(multiplayerModes || []).map((m) => m.offlinecoopmax || 0));

        const hasOnline = (multiplayerModes || []).some((m) => m.onlinecoop || (m.onlinemax || 0) > 1 || m.splitscreenonline);
        const hasOffline = (multiplayerModes || []).some((m) => m.offlinecoop || (m.offlinemax || 0) > 1 || m.splitscreen || m.lancoop);
        const hasCampaignCoop = (multiplayerModes || []).some((m) => m.campaigncoop);

        const playerCounts = (onlineMax > 0 || offlineMax > 0)
            ? `Online max: ${onlineMax || 0} · Offline max: ${offlineMax || 0}`
            : null;

        const coopFlags = [];
        if (onlineCoopMax > 0) coopFlags.push(`Online coop: ${onlineCoopMax}`);
        if (offlineCoopMax > 0) coopFlags.push(`Offline coop: ${offlineCoopMax}`);
        if (hasCampaignCoop) coopFlags.push('Campaign coop');
        const coop = coopFlags.length > 0 ? coopFlags.join(' · ') : null;

        const onlineOffline = hasOnline && hasOffline
            ? 'Online + Offline'
            : hasOnline
                ? 'Online'
                : hasOffline
                    ? 'Offline'
                    : null;

        let timeToBeatText = null;
        if (timeToBeat) {
            const secondsToHours = (value) => (value ? Math.round((value / 3600) * 10) / 10 : null);
            const normally = secondsToHours(timeToBeat.normally);
            const hastily = secondsToHours(timeToBeat.hastily);
            const completely = secondsToHours(timeToBeat.completely);
            const pieces = [];
            if (hastily) pieces.push(`Rush: ${hastily}h`);
            if (normally) pieces.push(`Main: ${normally}h`);
            if (completely) pieces.push(`100%: ${completely}h`);
            timeToBeatText = pieces.length > 0 ? pieces.join(' · ') : null;
        }

        const releaseDate = (gameData.release_dates || [])
            .map((r) => r.human)
            .find(Boolean) || null;

        return {
            ...basic,
            release_date: releaseDate,
            age_rating: this._formatAgeRating(gameData.age_ratings),
            time_to_beat: timeToBeatText,
            player_counts: playerCounts,
            coop,
            online_offline: onlineOffline,
            screenshots: uniqStrings([...screenshotList, ...artworkList]),
            videos,
            images: {
                poster: cover,
                thumbnail: artworkList[0] || cover || null,
                logo: null,
                backdrop: screenshotList[0] || artworkList[0] || cover || null,
            },
        };
    },

    async _post(config, token, endpoint, body) {
        const res = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
            method: 'POST',
            headers: {
                'Client-ID': config.client_id,
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'text/plain',
            },
            body,
        });
        if (!res.ok) throw new Error(`IGDB API error ${endpoint}: ${res.status}`);
        return res.json();
    },

    async search(query, config) {
        if (!config.client_id || !config.client_secret) throw new Error('IGDB credentials not configured');
        const token = await this._getToken(config);

        const games = await this._post(
            config,
            token,
            'games',
            `search "${query.replace(/"/g, '\\"')}"; fields name,cover.url,summary,genres.name,first_release_date,platforms.name,rating,aggregated_rating,screenshots.url,involved_companies.company.name,involved_companies.developer,themes.name,websites.url,websites.category; limit 10;`
        );

        return games.map((g) => this._mapBasic(g));
    },

    async details(apiId, config) {
        if (!config.client_id || !config.client_secret) throw new Error('IGDB credentials not configured');
        const token = await this._getToken(config);

        const [games, gameTimeToBeat, multiplayerModes, gameVideos] = await Promise.all([
            this._post(
                config,
                token,
                'games',
                `where id = ${apiId}; fields name,cover.url,summary,genres.name,first_release_date,release_dates.human,platforms.name,rating,aggregated_rating,screenshots.url,artworks.url,involved_companies.company.name,involved_companies.developer,themes.name,websites.url,websites.category,age_ratings.rating,age_ratings.category; limit 1;`
            ),
            this._post(
                config,
                token,
                'game_time_to_beats',
                `fields normally,hastily,completely; where game_id = ${apiId}; limit 1;`
            ).catch(() => []),
            this._post(
                config,
                token,
                'multiplayer_modes',
                `fields campaigncoop,dropin,lancoop,offlinecoop,offlinecoopmax,offlinemax,onlinecoop,onlinecoopmax,onlinemax,splitscreen,splitscreenonline; where game = ${apiId}; limit 20;`
            ).catch(() => []),
            this._post(
                config,
                token,
                'game_videos',
                `fields name,video_id; where game = ${apiId}; limit 20;`
            ).catch(() => []),
        ]);

        const game = games[0];
        if (!game) throw new Error('Game not found on IGDB');

        return this._mapDetails(game, gameTimeToBeat[0], multiplayerModes, gameVideos);
    },

    async test(config) {
        if (!config.client_id || !config.client_secret) {
            return { ok: false, detail: 'Client ID or Client Secret is missing' };
        }
        try {
            await this._getToken(config);
            return { ok: true, detail: 'Authentication successful' };
        } catch (err) {
            return { ok: false, detail: err.message };
        }
    },
};

// ── Registry ────────────────────────────────────────────────────────────────
const adapters = {
    rawg: rawgAdapter,
    igdb: igdbAdapter,
};

/**
 * Parse the game_api_providers JSON setting into an ordered list of enabled providers.
 */
function parseProviders(providersJson) {
    try {
        const list = JSON.parse(providersJson || '[]');
        return list
            .filter((p) => p.enabled)
            .sort((a, b) => (a.priority || 99) - (b.priority || 99));
    } catch {
        return [];
    }
}

/**
 * Search for games across all enabled providers in priority order.
 * Returns results from the first provider that succeeds with at least one result.
 */
async function searchGames(query, providersJson) {
    const providers = parseProviders(providersJson);
    if (providers.length === 0) return { results: [], provider: null };

    for (const provider of providers) {
        const adapter = adapters[provider.type];
        if (!adapter) continue;
        try {
            const results = await adapter.search(query, provider);
            if (results && results.length > 0) {
                return { results, provider: provider.type };
            }
        } catch (err) {
            console.warn(`[COOPLYST] Provider ${provider.type} search failed:`, err.message);
        }
    }

    return { results: [], provider: null };
}

/**
 * Fetch rich metadata from all enabled providers in priority order and merge field-by-field.
 *
 * @param {{ title: string, release_year?: number, api_id?: string, api_provider?: string }} game
 * @param {string} providersJson
 */
async function fetchMergedMetadata(game, providersJson) {
    const providers = parseProviders(providersJson);
    if (providers.length === 0) {
        return { merged: null, byProvider: {}, order: [] };
    }

    const byProvider = {};
    const orderedResults = [];

    for (const provider of providers) {
        const adapter = adapters[provider.type];
        if (!adapter) continue;

        try {
            let details = null;

            if (game.api_provider === provider.type && game.api_id) {
                details = await adapter.details(game.api_id, provider);
            } else {
                const searchResults = await adapter.search(game.title, provider);
                const best = pickBestSearchMatch(searchResults, game.title, game.release_year || null);
                if (best?.api_id) {
                    details = await adapter.details(best.api_id, provider);
                }
            }

            if (details) {
                byProvider[provider.type] = details;
                orderedResults.push(details);
            }
        } catch (err) {
            console.warn(`[COOPLYST] Provider ${provider.type} metadata failed:`, err.message);
        }
    }

    const merged = orderedResults.length > 0 ? mergeProviderData(orderedResults) : null;
    return {
        merged,
        byProvider,
        order: providers.map((p) => p.type),
    };
}

/**
 * Test a specific provider configuration.
 */
async function testProvider(providerConfig) {
    const adapter = adapters[providerConfig.type];
    if (!adapter) return { ok: false, detail: `Unknown provider type: ${providerConfig.type}` };
    return adapter.test(providerConfig);
}

module.exports = {
    searchGames,
    testProvider,
    fetchMergedMetadata,
    adapters,
    parseProviders,
};
