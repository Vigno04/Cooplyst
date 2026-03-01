const db = require('../../db');
const { fetchMergedMetadata, isSet } = require('../../providers');

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

function getMedianRating(gameId) {
    const rows = db.prepare(
        `SELECT rt.score FROM ratings rt
         JOIN game_runs r ON r.id = rt.run_id
         WHERE r.game_id = ?`
    ).all(gameId);
    if (rows.length === 0) return null;
    const sorted = rows.map(r => r.score).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
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

    // attach latest downloads
    const downloads = db.prepare(`
        SELECT type, link, filename, uploaded_at 
        FROM game_downloads 
        WHERE game_id = ? 
        ORDER BY uploaded_at DESC
    `).all(game.id);

    // Group by type to get the latest of each
    const latestDownloads = {};
    for (const d of downloads) {
        if (!latestDownloads[d.type]) {
            latestDownloads[d.type] = d;
        }
    }

    const result = {
        ...hydrateGame(game),
        votes_yes: votes.yes,
        votes_no: votes.no,
        user_vote: getUserVote(game.id, userId),
        players: getPlayers(game.id),
        latest_downloads: Object.values(latestDownloads),
        median_rating: getMedianRating(game.id),
    };
    if (visibility === 'public') {
        result.voters = getVoters(game.id);
    }
    return result;
}

module.exports = {
    getSetting,
    getVoteCounts,
    getUserVote,
    getVoters,
    getPlayers,
    getMedianRating,
    populatePlayersFromVotes,
    parseJsonSafe,
    hydrateGame,
    choose,
    buildUpdateFromMerged,
    updateGameMetadata,
    refreshGameMetadata,
    enrichGame,
};
