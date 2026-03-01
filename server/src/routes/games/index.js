const express = require('express');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { requireAuth, requireAdmin } = require('../../middleware/auth');
const db = require('../../db');
const { searchGames, testProvider } = require('../../providers');
const { notifyGameProposed } = require('../../notifications');
const {
    getSetting,
    enrichGame,
    updateGameMetadata,
    refreshGameMetadata,
} = require('./helpers');

const registerVoteRoutes = require('./votes');
const registerRunRoutes = require('./runs');
const registerMediaRoutes = require('./media');
const registerDownloadRoutes = require('./downloads');

const router = express.Router();

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../../data');
const MEDIA_DIR = path.join(DATA_DIR, 'media');
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });

// All game routes require authentication
router.use(requireAuth);

// ── GET /api/games — list all games ─────────────────────────────────────────
router.get('/', (req, res) => {
    const { status } = req.query;
    let games;
    if (status) {
        games = db.prepare('SELECT * FROM games WHERE status = ? ORDER BY proposed_at DESC').all(status);
    } else {
        games = db.prepare('SELECT * FROM games ORDER BY proposed_at DESC').all();
    }

    const enriched = games.map(g => enrichGame(g, req.user.id));
    res.json(enriched);
});

// ── GET /api/games/search — search external APIs ─────────────────────────────
router.get('/search', async (req, res) => {
    const { q } = req.query;
    if (!q || q.trim().length < 2) {
        return res.status(400).json({ error: 'Query must be at least 2 characters' });
    }

    const providersJson = getSetting('game_api_providers') || '[]';
    try {
        const { results, provider } = await searchGames(q.trim(), providersJson);
        res.json({ results, provider });
    } catch (err) {
        console.error('[COOPLYST] Game search error:', err.message);
        res.status(500).json({ error: 'Search failed' });
    }
});

// ── POST /api/games/search/test — test a specific provider config ─────────────
router.post('/search/test', requireAdmin, async (req, res) => {
    const { type, ...config } = req.body;
    if (!type) return res.status(400).json({ error: 'Provider type required' });

    try {
        const result = await testProvider({ type, ...config });
        res.json(result);
    } catch (err) {
        console.error('[COOPLYST] Provider test error:', err.message);
        res.status(500).json({ error: 'Provider test failed' });
    }
});

// ── GET /api/games/:id — single game detail ───────────────────────────────────
router.get('/:id', (req, res) => {
    const game = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
    if (!game) return res.status(404).json({ error: 'Game not found' });

    const enriched = enrichGame(game, req.user.id);

    // Attach runs with ratings
    const runs = db.prepare('SELECT * FROM game_runs WHERE game_id = ? ORDER BY run_number').all(game.id);
    enriched.runs = runs.map(run => {
        const ratings = db.prepare(
            `SELECT r.*, u.username, u.avatar, u.avatar_pixelated FROM ratings r JOIN users u ON u.id = r.user_id WHERE r.run_id = ? ORDER BY r.rated_at`
        ).all(run.id);
        const avg = ratings.length > 0
            ? (ratings.reduce((s, r) => s + r.score, 0) / ratings.length).toFixed(1)
            : null;
        return { ...run, ratings, average_rating: avg };
    });

    // Attach media
    enriched.media = db.prepare(
        `SELECT m.*, u.username as uploaded_by_username, u.avatar as uploaded_by_avatar
         FROM media m JOIN users u ON u.id = m.uploaded_by
         WHERE m.game_id = ?
         ORDER BY m.uploaded_at DESC`
    ).all(game.id);

    // Attach proposer username
    const proposer = db.prepare('SELECT username FROM users WHERE id = ?').get(game.proposed_by);
    enriched.proposed_by_username = proposer?.username || 'Unknown';

    res.json(enriched);
});

// ── POST /api/games — propose a new game ──────────────────────────────────────
router.post('/', async (req, res) => {
    const {
        title,
        cover_url,
        thumbnail_url,
        logo_url,
        backdrop_url,
        description,
        genre,
        release_year,
        release_date,
        platforms,
        api_id,
        api_provider,
        rating,
        developer,
        age_rating,
        time_to_beat,
        player_counts,
        coop,
        online_offline,
        screenshots,
        videos,
        tags,
        website,
    } = req.body;
    if (!title || !title.trim()) {
        return res.status(400).json({ error: 'Title is required' });
    }

    const normalizedTitle = title.trim();

    const duplicateByTitle = db.prepare(
        `SELECT id FROM games WHERE LOWER(TRIM(title)) = LOWER(TRIM(?)) LIMIT 1`
    ).get(normalizedTitle);
    if (duplicateByTitle) {
        return res.status(409).json({ error: 'Game already exists' });
    }

    if (api_id && api_provider) {
        const duplicateByApi = db.prepare(
            `SELECT id FROM games WHERE api_id = ? AND api_provider = ? LIMIT 1`
        ).get(String(api_id), String(api_provider));
        if (duplicateByApi) {
            return res.status(409).json({ error: 'Game already exists' });
        }
    }

    const id = uuidv4();
    db.prepare(
        `INSERT INTO games (
            id, title, cover_url, thumbnail_url, logo_url, backdrop_url, description, genre,
            release_year, release_date, platforms, api_id, api_provider, rating, developer,
            age_rating, time_to_beat, player_counts, coop, online_offline, screenshots, videos,
            tags, website, status, proposed_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'proposed', ?)`
    ).run(
        id,
        normalizedTitle,
        cover_url || null,
        thumbnail_url || null,
        logo_url || null,
        backdrop_url || null,
        description || null,
        genre || null,
        release_year || null,
        release_date || null,
        platforms || null,
        api_id || null,
        api_provider || null,
        rating || null,
        developer || null,
        age_rating || null,
        time_to_beat || null,
        player_counts || null,
        coop || null,
        online_offline || null,
        JSON.stringify(Array.isArray(screenshots) ? screenshots : []),
        JSON.stringify(Array.isArray(videos) ? videos : []),
        tags || null,
        website || null,
        req.user.id
    );

    let game = db.prepare('SELECT * FROM games WHERE id = ?').get(id);

    try {
        const refreshed = await refreshGameMetadata(game);
        if (refreshed) game = refreshed;
    } catch (err) {
        console.warn('[COOPLYST] Initial metadata refresh failed:', err.message);
    }

    // Fire-and-forget: notify channels that a game was proposed
    const proposer = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id);
    const siteUrl = getSetting('site_url') || '';
    notifyGameProposed({
        id: game.id,
        title: game.title,
        cover_url: game.cover_url || game.thumbnail_url || null,
        proposedByUsername: proposer?.username || 'Someone',
    }, siteUrl).catch(err => console.warn('[COOPLYST] Notification error:', err.message));

    res.status(201).json(enrichGame(game, req.user.id));
});

// ── POST /api/games/:id/metadata/refresh — refresh from providers (admin) ────
router.post('/:id/metadata/refresh', requireAdmin, async (req, res) => {
    const game = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
    if (!game) return res.status(404).json({ error: 'Game not found' });

    try {
        const refreshed = await refreshGameMetadata(game);
        if (!refreshed) return res.status(400).json({ error: 'No metadata available from providers' });
        return res.json(enrichGame(refreshed, req.user.id));
    } catch (err) {
        console.error('[COOPLYST] Metadata refresh error:', err.message);
        return res.status(500).json({ error: 'Metadata refresh failed' });
    }
});

// ── PATCH /api/games/:id/metadata — edit metadata/images (admin) ─────────────
router.patch('/:id/metadata', requireAdmin, (req, res) => {
    const game = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
    if (!game) return res.status(404).json({ error: 'Game not found' });

    const allowed = [
        'title', 'cover_url', 'thumbnail_url', 'logo_url', 'backdrop_url',
        'description', 'genre', 'release_year', 'release_date', 'platforms',
        'rating', 'developer', 'age_rating', 'time_to_beat', 'player_counts',
        'coop', 'online_offline', 'screenshots', 'videos', 'tags', 'website',
    ];

    const next = { ...game };
    for (const key of allowed) {
        if (req.body[key] === undefined) continue;
        if (key === 'screenshots') {
            next[key] = JSON.stringify(Array.isArray(req.body[key]) ? req.body[key] : []);
            continue;
        }
        if (key === 'videos') {
            next[key] = JSON.stringify(Array.isArray(req.body[key]) ? req.body[key] : []);
            continue;
        }
        next[key] = req.body[key];
    }

    if (typeof next.title === 'string' && next.title.trim().length > 0) {
        const duplicateByTitle = db.prepare(
            `SELECT id FROM games WHERE id != ? AND LOWER(TRIM(title)) = LOWER(TRIM(?)) LIMIT 1`
        ).get(game.id, next.title.trim());
        if (duplicateByTitle) {
            return res.status(409).json({ error: 'Another game with this title already exists' });
        }
    }

    const providerPayload = req.body.provider_payload ?? game.provider_payload ?? '{}';

    updateGameMetadata(game.id, {
        title: next.title,
        cover_url: next.cover_url,
        thumbnail_url: next.thumbnail_url,
        logo_url: next.logo_url,
        backdrop_url: next.backdrop_url,
        description: next.description,
        genre: next.genre,
        release_year: next.release_year,
        release_date: next.release_date,
        platforms: next.platforms,
        rating: next.rating,
        developer: next.developer,
        age_rating: next.age_rating,
        time_to_beat: next.time_to_beat,
        player_counts: next.player_counts,
        coop: next.coop,
        online_offline: next.online_offline,
        screenshots: next.screenshots,
        videos: next.videos,
        tags: next.tags,
        website: next.website,
        provider_payload: typeof providerPayload === 'string' ? providerPayload : JSON.stringify(providerPayload),
    });

    const updated = db.prepare('SELECT * FROM games WHERE id = ?').get(game.id);
    return res.json(enrichGame(updated, req.user.id));
});

// ── DELETE /api/games/:id — delete game (admin) ───────────────────────────────
router.delete('/:id', requireAdmin, (req, res) => {
    const game = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
    if (!game) return res.status(404).json({ error: 'Game not found' });

    // Delete associated media files
    const mediaRows = db.prepare('SELECT filename FROM media WHERE game_id = ?').all(game.id);
    for (const m of mediaRows) {
        const filePath = path.join(MEDIA_DIR, m.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    db.prepare('DELETE FROM games WHERE id = ?').run(game.id);
    res.json({ ok: true });
});

// ── Sub-route registrations ───────────────────────────────────────────────────
registerVoteRoutes(router);
registerRunRoutes(router);
registerMediaRoutes(router);
registerDownloadRoutes(router);

module.exports = router;
