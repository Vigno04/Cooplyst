const express = require('express');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const sharp = require('sharp');
const { requireAuth } = require('../middleware/auth');
const db = require('../db');

const router = express.Router();
const SALT_ROUNDS = 12;

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../data');
const AVATARS_DIR = path.join(DATA_DIR, 'avatars');
if (!fs.existsSync(AVATARS_DIR)) fs.mkdirSync(AVATARS_DIR, { recursive: true });

// Multer: accept single image up to 5 MB, stored in memory
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// GET /api/users/me — returns current user profile
router.get('/me', requireAuth, (req, res) => {
    const user = db.prepare(
        `SELECT id, username, email, role, created_at, oidc_sub, password_hash, avatar, avatar_pixelated, language FROM users WHERE id = ?`
    ).get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const { oidc_sub, password_hash, ...rest } = user;
    res.json({ ...rest, has_sso: !!oidc_sub, has_password: !!password_hash });
});

// PATCH /api/users/me — update username, email, or password
router.patch('/me', requireAuth, (req, res) => {
    const { username, email, currentPassword, newPassword, language } = req.body;

    const user = db.prepare(
        `SELECT id, username, password_hash FROM users WHERE id = ?`
    ).get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // If changing password, verify current password first
    if (newPassword !== undefined) {
        if (!currentPassword) {
            return res.status(400).json({ error: 'Current password required to set a new password' });
        }
        if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }
        if (newPassword.length < 8) {
            return res.status(400).json({ error: 'New password must be at least 8 characters' });
        }
    }

    // If changing username, check it is not reserved and not taken
    if (username !== undefined) {
        if (username.toLowerCase() === 'admin' && user.username.toLowerCase() !== 'admin') {
            return res.status(400).json({ error: 'This username is reserved' });
        }
        const conflict = db.prepare(
            `SELECT id FROM users WHERE username = ? AND id != ?`
        ).get(username, req.user.id);
        if (conflict) return res.status(409).json({ error: 'Username already taken' });
    }

    const updates = [];
    const values = [];

    if (username !== undefined) { updates.push('username = ?'); values.push(username); }
    if (email !== undefined) { updates.push('email = ?'); values.push(email || null); }
    if (language !== undefined) { updates.push('language = ?'); values.push(language || null); }
    if (newPassword !== undefined) {
        updates.push('password_hash = ?');
        values.push(bcrypt.hashSync(newPassword, SALT_ROUNDS));
    }

    if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(req.user.id);
    try {
        db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    } catch (err) {
        if (err.message.includes('UNIQUE')) {
            return res.status(409).json({ error: 'Username or email already taken' });
        }
        throw err;
    }

    const updated = db.prepare(
        `SELECT id, username, email, role, oidc_sub, password_hash, avatar, avatar_pixelated, language FROM users WHERE id = ?`
    ).get(req.user.id);
    const { oidc_sub, password_hash, ...rest } = updated;
    res.json({ ...rest, has_sso: !!oidc_sub, has_password: !!password_hash });
});

// POST /api/users/me/avatar — upload profile picture
router.post('/me/avatar', requireAuth, upload.single('avatar'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const userId = req.user.id;
    const normalFile = `${userId}.webp`;
    const pixelFile = `${userId}_pixel.webp`;
    const normalPath = path.join(AVATARS_DIR, normalFile);
    const pixelPath = path.join(AVATARS_DIR, pixelFile);

    try {
        // Generate normal 128x128 avatar
        await sharp(req.file.buffer)
            .resize(128, 128, { fit: 'cover' })
            .webp({ quality: 80 })
            .toFile(normalPath);

        // Generate pixelated variant: downscale to 16x16, then upscale with nearest-neighbor
        await sharp(req.file.buffer)
            .resize(16, 16, { fit: 'cover' })
            .webp({ quality: 80 })
            .toBuffer()
            .then(buf => sharp(buf)
                .resize(128, 128, { kernel: sharp.kernel.nearest })
                .webp({ quality: 80 })
                .toFile(pixelPath)
            );

        db.prepare(`UPDATE users SET avatar = ? WHERE id = ?`).run(normalFile, userId);
        res.json({ avatar: normalFile, avatar_pixelated: db.prepare(`SELECT avatar_pixelated FROM users WHERE id = ?`).get(userId)?.avatar_pixelated || 0 });
    } catch (err) {
        console.error('[COOPLYST] Avatar processing error:', err.message);
        res.status(500).json({ error: 'Failed to process image' });
    }
});

// PATCH /api/users/me/avatar/pixelate — toggle pixelation preference
router.patch('/me/avatar/pixelate', requireAuth, (req, res) => {
    const { pixelated } = req.body;
    const val = pixelated ? 1 : 0;
    db.prepare(`UPDATE users SET avatar_pixelated = ? WHERE id = ?`).run(val, req.user.id);
    res.json({ avatar_pixelated: val });
});

// DELETE /api/users/me/avatar — remove profile picture
router.delete('/me/avatar', requireAuth, (req, res) => {
    const userId = req.user.id;
    const normalPath = path.join(AVATARS_DIR, `${userId}.webp`);
    const pixelPath = path.join(AVATARS_DIR, `${userId}_pixel.webp`);
    if (fs.existsSync(normalPath)) fs.unlinkSync(normalPath);
    if (fs.existsSync(pixelPath)) fs.unlinkSync(pixelPath);
    db.prepare(`UPDATE users SET avatar = NULL WHERE id = ?`).run(userId);
    res.json({ ok: true });
});

// DELETE /api/users/me/oidc — unlink SSO account
router.delete('/me/oidc', requireAuth, (req, res) => {
    const user = db.prepare(
        `SELECT id, password_hash, oidc_sub FROM users WHERE id = ?`
    ).get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.oidc_sub) return res.status(400).json({ error: 'No SSO account linked' });
    // Prevent lockout: must have a password to unlink SSO
    if (!user.password_hash) {
        return res.status(400).json({ error: 'Set a password before unlinking SSO, or you will be locked out' });
    }
    db.prepare(`UPDATE users SET oidc_sub = NULL WHERE id = ?`).run(req.user.id);
    res.json({ ok: true });
});

module.exports = router;
