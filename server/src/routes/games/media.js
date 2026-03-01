const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const db = require('../../db');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../../data');
const MEDIA_DIR = path.join(DATA_DIR, 'media');
const UPLOAD_TMP_DIR = path.join(DATA_DIR, 'tmp_uploads');
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_TMP_DIR)) fs.mkdirSync(UPLOAD_TMP_DIR, { recursive: true });

const DEFAULT_MEDIA_MAX_MB = 250;
const parsedMediaMaxMb = Number(process.env.MEDIA_UPLOAD_MAX_MB);
const MEDIA_MAX_MB = Number.isFinite(parsedMediaMaxMb) && parsedMediaMaxMb > 0
    ? parsedMediaMaxMb
    : DEFAULT_MEDIA_MAX_MB;
const MEDIA_MAX_BYTES = Math.floor(MEDIA_MAX_MB * 1024 * 1024);

const upload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, UPLOAD_TMP_DIR),
        filename: (_req, file, cb) => {
            const ext = path.extname(file.originalname || '').toLowerCase() || '.bin';
            cb(null, `media-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
        },
    }),
    limits: { fileSize: MEDIA_MAX_BYTES },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype?.startsWith('image/') || file.mimetype?.startsWith('video/')) return cb(null, true);
        cb(new Error('INVALID_FILE_TYPE'));
    },
});

const mediaUploadMiddleware = (req, res, next) => {
    upload.single('file')(req, res, (err) => {
        if (!err) return next();
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ error: `File is too large. Maximum allowed is ${MEDIA_MAX_MB} MB` });
        }
        if (err.message === 'INVALID_FILE_TYPE') {
            return res.status(400).json({ error: 'Only image and video files are allowed' });
        }
        return res.status(400).json({ error: 'Invalid upload payload' });
    });
};

module.exports = function registerMediaRoutes(router) {
    // ── POST /api/games/:id/media — upload media ─────────────────────────────
    router.post('/:id/media', mediaUploadMiddleware, (req, res) => {
        const game = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
        if (!game) return res.status(404).json({ error: 'Game not found' });
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        if (game.status !== 'playing' && game.status !== 'completed') {
            return res.status(400).json({ error: 'Media upload is only allowed for playing or completed games' });
        }

        const { chunkIndex, totalChunks, uploadId } = req.body;

        if (chunkIndex !== undefined && totalChunks !== undefined && uploadId) {
            // Chunked upload logic
            const cIndex = parseInt(chunkIndex, 10);
            const tChunks = parseInt(totalChunks, 10);

            const ext = path.extname(req.file.originalname) || '.bin';
            const finalFilename = `${uploadId}${ext}`;
            const finalFilePath = path.join(MEDIA_DIR, finalFilename);
            const tempFilePath = path.join(UPLOAD_TMP_DIR, `${uploadId}.tmp`);

            // Append current chunk to the temp file
            try {
                const chunkData = fs.readFileSync(req.file.path);
                fs.appendFileSync(tempFilePath, chunkData);
                fs.unlinkSync(req.file.path);
            } catch (err) {
                console.error('Chunk append error', err);
                return res.status(500).json({ error: 'Failed to process chunk' });
            }

            if (cIndex === tChunks - 1) {
                // Last chunk, rename temp file to final destination and insert into DB
                try {
                    fs.renameSync(tempFilePath, finalFilePath);
                } catch (err) {
                    if (err.code === 'EXDEV') {
                        fs.copyFileSync(tempFilePath, finalFilePath);
                        fs.unlinkSync(tempFilePath);
                    } else {
                        return res.status(500).json({ error: 'Failed to finalize chunked upload' });
                    }
                }

                const id = uuidv4();
                const runId = req.body.run_id || null;
                db.prepare(
                    `INSERT INTO media (id, game_id, run_id, uploaded_by, filename, mime_type) VALUES (?, ?, ?, ?, ?, ?)`
                ).run(id, game.id, runId, req.user.id, finalFilename, req.file.mimetype);

                const media = db.prepare('SELECT * FROM media WHERE id = ?').get(id);
                return res.status(201).json(media);
            } else {
                // Not the last chunk, acknowledge receipt
                return res.json({ ok: true, chunkIndex: cIndex });
            }
        } else {
            // Normal (non-chunked) upload logic
            const ext = path.extname(req.file.originalname) || '.bin';
            const filename = `${uuidv4()}${ext}`;
            const filePath = path.join(MEDIA_DIR, filename);

            try {
                fs.renameSync(req.file.path, filePath);
            } catch (err) {
                if (err.code === 'EXDEV') {
                    fs.copyFileSync(req.file.path, filePath);
                    fs.unlinkSync(req.file.path);
                } else {
                    throw err;
                }
            }

            const id = uuidv4();
            const runId = req.body.run_id || null;
            db.prepare(
                `INSERT INTO media (id, game_id, run_id, uploaded_by, filename, mime_type) VALUES (?, ?, ?, ?, ?, ?)`
            ).run(id, game.id, runId, req.user.id, filename, req.file.mimetype);

            const media = db.prepare('SELECT * FROM media WHERE id = ?').get(id);
            res.status(201).json(media);
        }
    });

    // ── DELETE /api/games/:id/media/:mediaId — delete media ──────────────────
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
};
