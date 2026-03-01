const { v4: uuidv4 } = require('uuid');
const { requireAdmin } = require('../../middleware/auth');
const db = require('../../db');
const { enrichGame, getSetting, getVoteCounts, populatePlayersFromVotes, getPlayers } = require('./helpers');

module.exports = function registerVoteRoutes(router) {
    // ── POST /api/games/:id/vote — cast or change vote ──────────────────────
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

    // ── PATCH /api/games/:id/status — force state transition (admin) ─────────
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

    // ── DELETE /api/games/:id/votes — reset all votes (admin) ────────────────
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

    // ── POST /api/games/:id/players — add a player ───────────────────────────
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

    // ── DELETE /api/games/:id/players/:userId — remove a player ──────────────
    router.delete('/:id/players/:userId', requireAdmin, (req, res) => {
        const game = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
        if (!game) return res.status(404).json({ error: 'Game not found' });

        db.prepare('DELETE FROM game_players WHERE game_id = ? AND user_id = ?').run(game.id, req.params.userId);
        res.json({ ok: true, players: getPlayers(game.id) });
    });
};
