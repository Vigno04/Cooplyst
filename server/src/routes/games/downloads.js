const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const db = require('../../db');
const { enrichGame, getSetting } = require('./helpers');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../../data');
const MEDIA_DIR = path.join(DATA_DIR, 'media');
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });

const downloadsUpload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, MEDIA_DIR),
        filename: (_req, file, cb) => cb(null, `torrent-${Date.now()}-${uuidv4()}.torrent`),
    }),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit for torrents
});

module.exports = function registerDownloadRoutes(router) {
    // ── GET /api/games/:id/downloads — history of downloads ──────────────────
    router.get('/:id/downloads', (req, res) => {
        const downloads = db.prepare(`
            SELECT d.*, u.username as uploaded_by_username, u.avatar as uploaded_by_avatar
            FROM game_downloads d 
            JOIN users u ON u.id = d.uploaded_by
            WHERE game_id = ? 
            ORDER BY d.uploaded_at DESC
        `).all(req.params.id);
        res.json(downloads);
    });

    // ── POST /api/games/:id/downloads — Add torrent/magnet ───────────────────
    router.post('/:id/downloads', (req, res, next) => {
        downloadsUpload.single('file')(req, res, (err) => {
            if (err) return res.status(400).json({ error: 'File upload failed' });
            next();
        });
    }, (req, res) => {
        const game = db.prepare('SELECT id FROM games WHERE id = ?').get(req.params.id);
        if (!game) return res.status(404).json({ error: 'Game not found' });

        const allowAll = getSetting('allow_all_users_add_downloads') === 'true';
        if (!allowAll && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Only admins can add downloads' });
        }

        const { type, link } = req.body;
        if (type !== 'magnet' && type !== 'torrent') {
            return res.status(400).json({ error: 'Type must be magnet or torrent' });
        }

        const id = uuidv4();
        if (type === 'magnet') {
            if (!link || !link.startsWith('magnet:?')) {
                return res.status(400).json({ error: 'Invalid magnet link' });
            }
            db.prepare(`INSERT INTO game_downloads (id, game_id, type, link, uploaded_by) VALUES (?, ?, ?, ?, ?)`).run(id, game.id, type, link, req.user.id);
        } else {
            if (!req.file) return res.status(400).json({ error: 'Torrent file is missing' });
            db.prepare(`INSERT INTO game_downloads (id, game_id, type, filename, mime_type, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)`).run(id, game.id, type, req.file.filename, req.file.mimetype, req.user.id);
        }

        const gameUp = db.prepare('SELECT * FROM games WHERE id = ?').get(game.id);
        res.json(enrichGame(gameUp, req.user.id));
    });

    // ── DELETE /api/games/:id/downloads/:downloadId — Delete a download ───────
    router.delete('/:id/downloads/:downloadId', (req, res) => {
        const game = db.prepare('SELECT id FROM games WHERE id = ?').get(req.params.id);
        if (!game) return res.status(404).json({ error: 'Game not found' });

        const download = db.prepare('SELECT * FROM game_downloads WHERE id = ? AND game_id = ?').get(req.params.downloadId, game.id);
        if (!download) return res.status(404).json({ error: 'Download not found' });

        if (req.user.role !== 'admin' && req.user.id !== download.uploaded_by) {
            return res.status(403).json({ error: 'Not authorized to delete this download' });
        }

        if (download.type === 'torrent' && download.filename) {
            const filePath = path.join(MEDIA_DIR, download.filename);
            if (fs.existsSync(filePath)) {
                try {
                    fs.unlinkSync(filePath);
                } catch (err) {
                    console.error('[COOPLYST] Failed to delete torrent file:', err.message);
                }
            }
        }

        db.prepare('DELETE FROM game_downloads WHERE id = ?').run(download.id);

        const gameUp = db.prepare('SELECT * FROM games WHERE id = ?').get(game.id);
        res.json(enrichGame(gameUp, req.user.id));
    });
};
