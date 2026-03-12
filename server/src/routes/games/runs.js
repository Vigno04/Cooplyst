const { v4: uuidv4 } = require('uuid');
const { requireAdmin } = require('../../middleware/auth');
const db = require('../../db');

function formatDateOnly(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getTodayDateString() {
    return formatDateOnly(new Date());
}

function normalizeRunDate(value, fieldName, { allowNull = false } = {}) {
    if (value === undefined) return undefined;
    if (value === null || value === '') {
        if (allowNull) return null;
        throw new Error(`${fieldName} is required`);
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
            return trimmed;
        }

        const parsed = new Date(trimmed);
        if (!Number.isNaN(parsed.getTime())) {
            return formatDateOnly(parsed);
        }
    }

    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
        return formatDateOnly(new Date(numeric * 1000));
    }

    throw new Error(`${fieldName} must be a valid date`);
}

function syncGameStatusForRuns(gameId) {
    const game = db.prepare('SELECT status FROM games WHERE id = ?').get(gameId);
    if (!game) return;

    const runCount = db.prepare('SELECT COUNT(*) as c FROM game_runs WHERE game_id = ?').get(gameId).c;
    if (runCount === 0) {
        if (game.status === 'playing' || game.status === 'completed') {
            db.prepare(`UPDATE games SET status = 'backlog', status_changed_at = unixepoch() WHERE id = ?`).run(gameId);
        }
        return;
    }

    const activeRuns = db.prepare('SELECT COUNT(*) as c FROM game_runs WHERE game_id = ? AND completed_at IS NULL').get(gameId).c;
    if (activeRuns > 0) {
        if (game.status !== 'playing') {
            db.prepare(`UPDATE games SET status = 'playing', status_changed_at = unixepoch() WHERE id = ?`).run(gameId);
        }
        return;
    }

    if (game.status !== 'completed') {
        db.prepare(`UPDATE games SET status = 'completed', status_changed_at = unixepoch() WHERE id = ?`).run(gameId);
    }
}

module.exports = function registerRunRoutes(router) {
    // ── POST /api/games/:id/runs — start a new run ───────────────────────────
    router.post('/:id/runs', requireAdmin, (req, res) => {
        const game = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
        if (!game) return res.status(404).json({ error: 'Game not found' });

        const lastRun = db.prepare('SELECT MAX(run_number) as max FROM game_runs WHERE game_id = ?').get(game.id);
        const runNumber = (lastRun?.max || 0) + 1;
        const runName = `Run #${runNumber}`;

        const id = uuidv4();
        db.prepare('INSERT INTO game_runs (id, game_id, run_number, name, started_at) VALUES (?, ?, ?, ?, ?)').run(id, game.id, runNumber, runName, getTodayDateString());

        // Auto-populate run_players from all yes-voters for this game
        const yesVoters = db.prepare('SELECT user_id FROM votes WHERE game_id = ? AND vote = 1').all(game.id);
        const insertPlayer = db.prepare('INSERT OR IGNORE INTO run_players (run_id, user_id) VALUES (?, ?)');
        for (const v of yesVoters) {
            insertPlayer.run(id, v.user_id);
        }

        syncGameStatusForRuns(game.id);

        const run = db.prepare('SELECT * FROM game_runs WHERE id = ?').get(id);
        res.status(201).json(run);
    });

    // ── PATCH /api/games/:id/runs/:runId — edit run details (admin) ─────────
    router.patch('/:id/runs/:runId', requireAdmin, (req, res) => {
        const run = db.prepare('SELECT * FROM game_runs WHERE id = ? AND game_id = ?').get(req.params.runId, req.params.id);
        if (!run) return res.status(404).json({ error: 'Run not found' });

        let startedAt;
        let completedAt;
        try {
            startedAt = normalizeRunDate(req.body.started_at, 'started_at');
            completedAt = normalizeRunDate(req.body.completed_at, 'completed_at', { allowNull: true });
        } catch (err) {
            return res.status(400).json({ error: err.message });
        }

        let cleanedName = run.name;
        if (req.body.name !== undefined) {
            if (typeof req.body.name !== 'string' || !req.body.name.trim()) {
                return res.status(400).json({ error: 'Run name is required' });
            }
            cleanedName = req.body.name.trim().slice(0, 80);
        }

        const nextStartedAt = startedAt === undefined ? run.started_at : startedAt;
        const nextCompletedAt = completedAt === undefined ? run.completed_at : completedAt;
        if (nextCompletedAt !== null && nextCompletedAt < nextStartedAt) {
            return res.status(400).json({ error: 'completed_at must be after started_at' });
        }

        db.prepare('UPDATE game_runs SET name = ?, started_at = ?, completed_at = ? WHERE id = ?').run(
            cleanedName,
            nextStartedAt,
            nextCompletedAt,
            run.id
        );

        syncGameStatusForRuns(req.params.id);

        const updated = db.prepare('SELECT * FROM game_runs WHERE id = ?').get(run.id);
        res.json(updated);
    });

    // ── PATCH /api/games/:id/runs/:runId/complete — complete a run ───────────
    router.patch('/:id/runs/:runId/complete', requireAdmin, (req, res) => {
        const run = db.prepare('SELECT * FROM game_runs WHERE id = ? AND game_id = ?').get(req.params.runId, req.params.id);
        if (!run) return res.status(404).json({ error: 'Run not found' });

        db.prepare('UPDATE game_runs SET completed_at = ? WHERE id = ?').run(getTodayDateString(), run.id);
        syncGameStatusForRuns(req.params.id);

        const updated = db.prepare('SELECT * FROM game_runs WHERE id = ?').get(run.id);
        res.json(updated);
    });

    // ── POST /api/games/:id/runs/:runId/rate — submit rating ─────────────────
    router.post('/:id/runs/:runId/rate', (req, res) => {
        const run = db.prepare('SELECT * FROM game_runs WHERE id = ? AND game_id = ?').get(req.params.runId, req.params.id);
        if (!run) return res.status(404).json({ error: 'Run not found' });

        const isPlayer = db.prepare('SELECT 1 FROM run_players WHERE run_id = ? AND user_id = ?').get(run.id, req.user.id);
        if (!isPlayer) {
            return res.status(403).json({ error: 'Only players of this run can rate it' });
        }

        const { score, comment } = req.body;
        const numericScore = parseFloat(score);
        if (isNaN(numericScore) || numericScore < 1 || numericScore > 10) {
            return res.status(400).json({ error: 'Score must be a number between 1 and 10' });
        }

        db.prepare(
            `INSERT INTO ratings (run_id, user_id, score, comment) VALUES (?, ?, ?, ?)
             ON CONFLICT(run_id, user_id) DO UPDATE SET score = excluded.score, comment = excluded.comment, rated_at = unixepoch()`
        ).run(run.id, req.user.id, numericScore, comment || null);

        res.json({ ok: true });
    });

    // ── DELETE /api/games/:id/runs/:runId — delete a run (admin) ────────────
    router.delete('/:id/runs/:runId', requireAdmin, (req, res) => {
        const run = db.prepare('SELECT * FROM game_runs WHERE id = ? AND game_id = ?').get(req.params.runId, req.params.id);
        if (!run) return res.status(404).json({ error: 'Run not found' });

        // Ratings cascade-delete via FK
        db.prepare('DELETE FROM game_runs WHERE id = ?').run(run.id);

        syncGameStatusForRuns(req.params.id);

        res.json({ ok: true });
    });

    // ── DELETE /api/games/:id/runs/:runId/ratings/:userId — delete a rating (admin)
    router.delete('/:id/runs/:runId/ratings/:userId', requireAdmin, (req, res) => {
        db.prepare('DELETE FROM ratings WHERE run_id = ? AND user_id = ?').run(req.params.runId, req.params.userId);
        res.json({ ok: true });
    });

    // ── POST /api/games/:id/runs/:runId/players — add a player to a run (admin)
    router.post('/:id/runs/:runId/players', requireAdmin, (req, res) => {
        const run = db.prepare('SELECT * FROM game_runs WHERE id = ? AND game_id = ?').get(req.params.runId, req.params.id);
        if (!run) return res.status(404).json({ error: 'Run not found' });

        const { user_id } = req.body;
        if (!user_id) return res.status(400).json({ error: 'user_id is required' });

        const user = db.prepare('SELECT id FROM users WHERE id = ?').get(user_id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        db.prepare('INSERT OR IGNORE INTO run_players (run_id, user_id) VALUES (?, ?)').run(run.id, user_id);

        const players = db.prepare(
            `SELECT rp.user_id, rp.added_at, u.username, u.avatar, u.avatar_pixelated
             FROM run_players rp JOIN users u ON u.id = rp.user_id
             WHERE rp.run_id = ? ORDER BY rp.added_at`
        ).all(run.id);
        res.json({ ok: true, players });
    });

    // ── DELETE /api/games/:id/runs/:runId/players/:userId — remove a player from a run (admin)
    router.delete('/:id/runs/:runId/players/:userId', requireAdmin, (req, res) => {
        const run = db.prepare('SELECT * FROM game_runs WHERE id = ? AND game_id = ?').get(req.params.runId, req.params.id);
        if (!run) return res.status(404).json({ error: 'Run not found' });

        db.prepare('DELETE FROM run_players WHERE run_id = ? AND user_id = ?').run(run.id, req.params.userId);

        const players = db.prepare(
            `SELECT rp.user_id, rp.added_at, u.username, u.avatar, u.avatar_pixelated
             FROM run_players rp JOIN users u ON u.id = rp.user_id
             WHERE rp.run_id = ? ORDER BY rp.added_at`
        ).all(run.id);
        res.json({ ok: true, players });
    });
};
