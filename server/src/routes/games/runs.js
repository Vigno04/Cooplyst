const { v4: uuidv4 } = require('uuid');
const { requireAdmin } = require('../../middleware/auth');
const db = require('../../db');

module.exports = function registerRunRoutes(router) {
    // ── POST /api/games/:id/runs — start a new run ───────────────────────────
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

    // ── PATCH /api/games/:id/runs/:runId — rename a run (admin) ─────────────
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

    // ── PATCH /api/games/:id/runs/:runId/complete — complete a run ───────────
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

    // ── POST /api/games/:id/runs/:runId/rate — submit rating ─────────────────
    router.post('/:id/runs/:runId/rate', (req, res) => {
        const run = db.prepare('SELECT * FROM game_runs WHERE id = ? AND game_id = ?').get(req.params.runId, req.params.id);
        if (!run) return res.status(404).json({ error: 'Run not found' });

        const isPlayer = db.prepare('SELECT 1 FROM game_players WHERE game_id = ? AND user_id = ?').get(req.params.id, req.user.id);
        if (!isPlayer) {
            return res.status(403).json({ error: 'Only players of this game can rate it' });
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

    // ── DELETE /api/games/:id/runs/:runId/ratings/:userId — delete a rating (admin)
    router.delete('/:id/runs/:runId/ratings/:userId', requireAdmin, (req, res) => {
        db.prepare('DELETE FROM ratings WHERE run_id = ? AND user_id = ?').run(req.params.runId, req.params.userId);
        res.json({ ok: true });
    });
};
