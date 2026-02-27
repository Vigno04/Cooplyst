const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const db = require('../db');
const { searchGames, testProvider, fetchMergedMetadata } = require('../providers');
const { notifyGameProposed } = require('../notifications');

const router = express.Router();

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../data');
const MEDIA_DIR = path.join(DATA_DIR, 'media');
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });

// Multer: accept images/videos up to 50 MB
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ── Helpers ─────────────────────────────────────────────────────────────────

function getSetting(key) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row?.value ?? null;
}

function getVoteCounts(gameId) {
    const yes = db.prepare('SELECT COUNT(*) as c FROM votes WHERE game_id = ? AND vote = 1').get(gameId).c;
    const no = db.prepare('SELECT COUNT(*) as c FROM votes WHERE game_id = ? AND vote = 0').get(gameId).c;
    return { yes, no };
}

function getUserVote(gameId, userId) {
    const row = db.prepare('SELECT vote FROM votes WHERE game_id = ? AND user_id = ?').get(gameId, userId);
    return row ? row.vote : null;
}

function getVoters(gameId) {
    return db.prepare(
        `SELECT v.user_id, v.vote, v.voted_at, u.username
         FROM votes v JOIN users u ON u.id = v.user_id
         WHERE v.game_id = ?
         ORDER BY v.voted_at`
    ).all(gameId);
}

function getPlayers(gameId) {
    return db.prepare(
        `SELECT gp.user_id, gp.added_at, u.username, u.avatar
         FROM game_players gp JOIN users u ON u.id = gp.user_id
         WHERE gp.game_id = ?
         ORDER BY gp.added_at`
    ).all(gameId);
}

function populatePlayersFromVotes(gameId) {
    // Add all yes-voters as players (skip if already added)
    const yesVoters = db.prepare(
        `SELECT user_id FROM votes WHERE game_id = ? AND vote = 1`
    ).all(gameId);
    const insert = db.prepare(
        `INSERT OR IGNORE INTO game_players (game_id, user_id) VALUES (?, ?)`
    );
    for (const v of yesVoters) {
        insert.run(gameId, v.user_id);
    }
}

function parseJsonSafe(value, fallback) {
    if (!value) return fallback;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function hydrateGame(game) {
    return {
        ...game,
        screenshots: parseJsonSafe(game.screenshots, []),
        videos: parseJsonSafe(game.videos, []),
        provider_payload: parseJsonSafe(game.provider_payload, {}),
    };
}

function isSet(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return true;
}

function choose(currentValue, mergedValue) {
    return isSet(currentValue) ? currentValue : (isSet(mergedValue) ? mergedValue : null);
}

function buildUpdateFromMerged(existingGame, merged, byProvider) {
    if (!merged) return null;

    const images = merged.images || {};
    const selectedCover = choose(existingGame.cover_url, images.poster);
    const selectedBackdrop = choose(existingGame.backdrop_url, images.backdrop || selectedCover);

    const existingScreenshots = parseJsonSafe(existingGame.screenshots, []);
    const existingVideos = parseJsonSafe(existingGame.videos, []);

    return {
        cover_url: selectedCover,
        thumbnail_url: choose(existingGame.thumbnail_url, images.thumbnail || selectedCover),
        logo_url: choose(existingGame.logo_url, images.logo),
        backdrop_url: selectedBackdrop,
        description: choose(existingGame.description, merged.description),
        genre: choose(existingGame.genre, merged.genre),
        release_year: choose(existingGame.release_year, merged.release_year),
        release_date: choose(existingGame.release_date, merged.release_date),
        platforms: choose(existingGame.platforms, merged.platforms),
        rating: choose(existingGame.rating, merged.rating),
        developer: choose(existingGame.developer, merged.developer),
        age_rating: choose(existingGame.age_rating, merged.age_rating),
        time_to_beat: choose(existingGame.time_to_beat, merged.time_to_beat),
        player_counts: choose(existingGame.player_counts, merged.player_counts),
        coop: choose(existingGame.coop, merged.coop),
        online_offline: choose(existingGame.online_offline, merged.online_offline),
        screenshots: JSON.stringify(existingScreenshots.length > 0 ? existingScreenshots : (merged.screenshots || [])),
        videos: JSON.stringify(existingVideos.length > 0 ? existingVideos : (merged.videos || [])),
        tags: choose(existingGame.tags, merged.tags),
        website: choose(existingGame.website, merged.website),
        provider_payload: JSON.stringify(byProvider || {}),
    };
}

function updateGameMetadata(gameId, data) {
    db.prepare(
        `UPDATE games SET
            title = ?,
            cover_url = ?,
            thumbnail_url = ?,
            logo_url = ?,
            backdrop_url = ?,
            description = ?,
            genre = ?,
            release_year = ?,
            release_date = ?,
            platforms = ?,
            rating = ?,
            developer = ?,
            age_rating = ?,
            time_to_beat = ?,
            player_counts = ?,
            coop = ?,
            online_offline = ?,
            screenshots = ?,
            videos = ?,
            tags = ?,
            website = ?,
            provider_payload = ?
         WHERE id = ?`
    ).run(
        data.title,
        data.cover_url,
        data.thumbnail_url,
        data.logo_url,
        data.backdrop_url,
        data.description,
        data.genre,
        data.release_year,
        data.release_date,
        data.platforms,
        data.rating,
        data.developer,
        data.age_rating,
        data.time_to_beat,
        data.player_counts,
        data.coop,
        data.online_offline,
        data.screenshots,
        data.videos,
        data.tags,
        data.website,
        data.provider_payload,
        gameId
    );
}

async function refreshGameMetadata(game) {
    const providersJson = getSetting('game_api_providers') || '[]';
    const { merged, byProvider } = await fetchMergedMetadata(game, providersJson);
    if (!merged) return null;

    const updatePayload = buildUpdateFromMerged(game, merged, byProvider);
    if (!updatePayload) return null;

    updatePayload.title = game.title;
    updateGameMetadata(game.id, updatePayload);

    return db.prepare('SELECT * FROM games WHERE id = ?').get(game.id);
}

function enrichGame(game, userId) {
    const votes = getVoteCounts(game.id);
    const visibility = getSetting('vote_visibility') || 'public';
    const result = {
        ...hydrateGame(game),
        votes_yes: votes.yes,
        votes_no: votes.no,
        user_vote: getUserVote(game.id, userId),
        players: getPlayers(game.id),
    };
    if (visibility === 'public') {
        result.voters = getVoters(game.id);
    }
    return result;
}

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

// ── GET /api/games/search — search external APIs ────────────────────────────
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

// ── POST /api/games/search/test — test a specific provider config ───────────
router.post('/search/test', requireAdmin, async (req, res) => {
    const { type, ...config } = req.body;
    if (!type) return res.status(400).json({ error: 'Provider type required' });

    const result = await testProvider({ type, ...config });
    res.json(result);
});

// ── GET /api/games/:id — single game detail ─────────────────────────────────
router.get('/:id', (req, res) => {
    const game = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
    if (!game) return res.status(404).json({ error: 'Game not found' });

    const enriched = enrichGame(game, req.user.id);

    // Attach runs with ratings
    const runs = db.prepare('SELECT * FROM game_runs WHERE game_id = ? ORDER BY run_number').all(game.id);
    enriched.runs = runs.map(run => {
        const ratings = db.prepare(
            `SELECT r.*, u.username FROM ratings r JOIN users u ON u.id = r.user_id WHERE r.run_id = ? ORDER BY r.rated_at`
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

// ── POST /api/games — propose a new game ────────────────────────────────────
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

// ── POST /api/games/:id/metadata/refresh — refresh from providers (admin) ──
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

// ── PATCH /api/games/:id/metadata — edit metadata/images (admin) ───────────
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

// ── POST /api/games/:id/vote — cast or change vote ──────────────────────────
router.post('/:id/vote', (req, res) => {
    const game = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
    if (!game) return res.status(404).json({ error: 'Game not found' });

    if (game.status !== 'proposed' && game.status !== 'voting') {
        return res.status(400).json({ error: 'Voting is closed for this game' });
    }

    const { vote } = req.body;
    if (vote !== 0 && vote !== 1) {
        return res.status(400).json({ error: 'Vote must be 0 (no) or 1 (yes)' });
    }

    // Upsert vote
    db.prepare(
        `INSERT INTO votes (game_id, user_id, vote) VALUES (?, ?, ?)
         ON CONFLICT(game_id, user_id) DO UPDATE SET vote = excluded.vote, voted_at = unixepoch()`
    ).run(game.id, req.user.id, vote);

    // If game was 'proposed', move to 'voting' now that the first vote is in
    if (game.status === 'proposed') {
        db.prepare(`UPDATE games SET status = 'voting', status_changed_at = unixepoch() WHERE id = ?`).run(game.id);
    }

    // Check auto-promotion to backlog
    const threshold = parseInt(getSetting('vote_threshold') || '3', 10);
    const { yes } = getVoteCounts(game.id);
    if (yes >= threshold) {
        const wasPromoted = db.prepare(`UPDATE games SET status = 'backlog', status_changed_at = unixepoch() WHERE id = ? AND status IN ('proposed', 'voting')`).run(game.id);
        if (wasPromoted.changes > 0) {
            populatePlayersFromVotes(game.id);
        }
    }

    const updated = db.prepare('SELECT * FROM games WHERE id = ?').get(game.id);
    res.json(enrichGame(updated, req.user.id));
});

// ── PATCH /api/games/:id/status — force state transition (admin) ────────────
router.patch('/:id/status', requireAdmin, (req, res) => {
    const game = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
    if (!game) return res.status(404).json({ error: 'Game not found' });

    const { status } = req.body;
    const VALID = ['proposed', 'voting', 'backlog', 'playing', 'completed'];
    if (!VALID.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID.join(', ')}` });
    }

    db.prepare(`UPDATE games SET status = ?, status_changed_at = unixepoch() WHERE id = ?`).run(status, game.id);

    // Auto-populate yes-voters when moving into backlog or playing
    if ((status === 'backlog' || status === 'playing') && (game.status === 'proposed' || game.status === 'voting')) {
        populatePlayersFromVotes(game.id);
    }

    // If moving to 'playing', auto-create a run if none exist
    if (status === 'playing') {
        const existingRuns = db.prepare('SELECT COUNT(*) as c FROM game_runs WHERE game_id = ?').get(game.id).c;
        if (existingRuns === 0) {
            db.prepare('INSERT INTO game_runs (id, game_id, run_number) VALUES (?, ?, 1)').run(uuidv4(), game.id);
        }
    }

    const updated = db.prepare('SELECT * FROM games WHERE id = ?').get(game.id);
    res.json(enrichGame(updated, req.user.id));
});

// ── DELETE /api/games/:id — delete game (admin) ─────────────────────────────
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

// ── POST /api/games/:id/players — add a player ─────────────────────────────
router.post('/:id/players', requireAdmin, (req, res) => {
    const game = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
    if (!game) return res.status(404).json({ error: 'Game not found' });

    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id is required' });

    // Verify user exists
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(user_id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    db.prepare(
        `INSERT OR IGNORE INTO game_players (game_id, user_id) VALUES (?, ?)`
    ).run(game.id, user_id);

    res.json({ ok: true, players: getPlayers(game.id) });
});

// ── DELETE /api/games/:id/players/:userId — remove a player ─────────────────
router.delete('/:id/players/:userId', requireAdmin, (req, res) => {
    const game = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
    if (!game) return res.status(404).json({ error: 'Game not found' });

    db.prepare('DELETE FROM game_players WHERE game_id = ? AND user_id = ?').run(game.id, req.params.userId);
    res.json({ ok: true, players: getPlayers(game.id) });
});

// ── POST /api/games/:id/runs — start a new run ─────────────────────────────
router.post('/:id/runs', requireAdmin, (req, res) => {
    const game = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
    if (!game) return res.status(404).json({ error: 'Game not found' });

    const lastRun = db.prepare('SELECT MAX(run_number) as max FROM game_runs WHERE game_id = ?').get(game.id);
    const runNumber = (lastRun?.max || 0) + 1;
    const runName = `Run #${runNumber}`;

    const id = uuidv4();
    db.prepare('INSERT INTO game_runs (id, game_id, run_number, name) VALUES (?, ?, ?, ?)').run(id, game.id, runNumber, runName);

    // Auto-transition to playing
    if (game.status !== 'playing') {
        db.prepare(`UPDATE games SET status = 'playing', status_changed_at = unixepoch() WHERE id = ?`).run(game.id);
    }

    const run = db.prepare('SELECT * FROM game_runs WHERE id = ?').get(id);
    res.status(201).json(run);
});

// ── PATCH /api/games/:id/runs/:runId — rename a run (admin) ───────────────
router.patch('/:id/runs/:runId', requireAdmin, (req, res) => {
    const run = db.prepare('SELECT * FROM game_runs WHERE id = ? AND game_id = ?').get(req.params.runId, req.params.id);
    if (!run) return res.status(404).json({ error: 'Run not found' });

    const { name } = req.body;
    if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'Run name is required' });
    }

    const cleaned = name.trim().slice(0, 80);
    db.prepare('UPDATE game_runs SET name = ? WHERE id = ?').run(cleaned, run.id);

    const updated = db.prepare('SELECT * FROM game_runs WHERE id = ?').get(run.id);
    res.json(updated);
});

// ── PATCH /api/games/:id/runs/:runId/complete — complete a run ──────────────
router.patch('/:id/runs/:runId/complete', requireAdmin, (req, res) => {
    const run = db.prepare('SELECT * FROM game_runs WHERE id = ? AND game_id = ?').get(req.params.runId, req.params.id);
    if (!run) return res.status(404).json({ error: 'Run not found' });

    db.prepare('UPDATE game_runs SET completed_at = unixepoch() WHERE id = ?').run(run.id);

    // If all runs are completed, transition game to completed
    const activeRuns = db.prepare('SELECT COUNT(*) as c FROM game_runs WHERE game_id = ? AND completed_at IS NULL').get(req.params.id).c;
    if (activeRuns === 0) {
        db.prepare(`UPDATE games SET status = 'completed', status_changed_at = unixepoch() WHERE id = ?`).run(req.params.id);
    }

    const updated = db.prepare('SELECT * FROM game_runs WHERE id = ?').get(run.id);
    res.json(updated);
});

// ── POST /api/games/:id/runs/:runId/rate — submit rating ────────────────────
router.post('/:id/runs/:runId/rate', (req, res) => {
    const run = db.prepare('SELECT * FROM game_runs WHERE id = ? AND game_id = ?').get(req.params.runId, req.params.id);
    if (!run) return res.status(404).json({ error: 'Run not found' });

    const { score, comment } = req.body;
    if (!score || score < 1 || score > 10) {
        return res.status(400).json({ error: 'Score must be between 1 and 10' });
    }

    db.prepare(
        `INSERT INTO ratings (run_id, user_id, score, comment) VALUES (?, ?, ?, ?)
         ON CONFLICT(run_id, user_id) DO UPDATE SET score = excluded.score, comment = excluded.comment, rated_at = unixepoch()`
    ).run(run.id, req.user.id, score, comment || null);

    res.json({ ok: true });
});

// ── DELETE /api/games/:id/runs/:runId — delete a run (admin) ────────────────
router.delete('/:id/runs/:runId', requireAdmin, (req, res) => {
    const run = db.prepare('SELECT * FROM game_runs WHERE id = ? AND game_id = ?').get(req.params.runId, req.params.id);
    if (!run) return res.status(404).json({ error: 'Run not found' });

    // Ratings cascade-delete via FK
    db.prepare('DELETE FROM game_runs WHERE id = ?').run(run.id);

    // If no runs left and game was playing, move back to backlog
    const remaining = db.prepare('SELECT COUNT(*) as c FROM game_runs WHERE game_id = ?').get(req.params.id).c;
    if (remaining === 0) {
        const game = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
        if (game && game.status === 'playing') {
            db.prepare(`UPDATE games SET status = 'backlog', status_changed_at = unixepoch() WHERE id = ?`).run(req.params.id);
        }
    }

    res.json({ ok: true });
});

// ── DELETE /api/games/:id/votes — reset all votes (admin) ───────────────────
router.delete('/:id/votes', requireAdmin, (req, res) => {
    const game = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
    if (!game) return res.status(404).json({ error: 'Game not found' });

    db.prepare('DELETE FROM votes WHERE game_id = ?').run(game.id);

    // Move back to proposed if was in voting
    if (game.status === 'voting') {
        db.prepare(`UPDATE games SET status = 'proposed', status_changed_at = unixepoch() WHERE id = ?`).run(game.id);
    }

    const updated = db.prepare('SELECT * FROM games WHERE id = ?').get(game.id);
    res.json(enrichGame(updated, req.user.id));
});

// ── DELETE /api/games/:id/runs/:runId/ratings/:userId — delete a rating (admin)
router.delete('/:id/runs/:runId/ratings/:userId', requireAdmin, (req, res) => {
    db.prepare('DELETE FROM ratings WHERE run_id = ? AND user_id = ?').run(req.params.runId, req.params.userId);
    res.json({ ok: true });
});

// ── POST /api/games/:id/media — upload media ───────────────────────────────
router.post('/:id/media', upload.single('file'), (req, res) => {
    const game = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    if (game.status !== 'playing' && game.status !== 'completed') {
        return res.status(400).json({ error: 'Media upload is only allowed for playing or completed games' });
    }

    const ext = path.extname(req.file.originalname) || '.bin';
    const filename = `${uuidv4()}${ext}`;
    const filePath = path.join(MEDIA_DIR, filename);

    fs.writeFileSync(filePath, req.file.buffer);

    const id = uuidv4();
    const runId = req.body.run_id || null;
    db.prepare(
        `INSERT INTO media (id, game_id, run_id, uploaded_by, filename, mime_type) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, game.id, runId, req.user.id, filename, req.file.mimetype);

    const media = db.prepare('SELECT * FROM media WHERE id = ?').get(id);
    res.status(201).json(media);
});

// ── DELETE /api/games/:id/media/:mediaId — delete media ─────────────────────
router.delete('/:id/media/:mediaId', (req, res) => {
    const media = db.prepare('SELECT * FROM media WHERE id = ? AND game_id = ?').get(req.params.mediaId, req.params.id);
    if (!media) return res.status(404).json({ error: 'Media not found' });

    // Only the uploader or admin can delete
    if (media.uploaded_by !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Not authorized to delete this media' });
    }

    const filePath = path.join(MEDIA_DIR, media.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    db.prepare('DELETE FROM media WHERE id = ?').run(media.id);
    res.json({ ok: true });
});

module.exports = router;
