const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const db = require('../db');
const { Issuer, generators } = require('openid-client');

const router = express.Router();

// All admin routes require a valid JWT AND admin role
router.use(requireAuth, requireAdmin);

const ALLOWED_SETTINGS = [
    'registration_enabled',
    'site_url',
    'authentik_enabled',
    'authentik_url',
    'authentik_client_id',
    'authentik_client_secret',
    'local_auth_enabled',
    'authentik_auto_redirect',
    'authentik_auto_register',
];

// GET /api/admin/settings
router.get('/settings', (req, res) => {
    const rows = db.prepare(`SELECT key, value FROM settings`).all();
    const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
    res.json(settings);
});

// PATCH /api/admin/settings
router.patch('/settings', (req, res) => {
    const updates = Object.entries(req.body).filter(([k]) => ALLOWED_SETTINGS.includes(k));

    if (updates.length === 0) {
        return res.status(400).json({ error: 'No valid settings provided' });
    }

    const upsert = db.prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    );

    const doAll = db.transaction((pairs) => {
        for (const [k, v] of pairs) upsert.run(k, String(v));
    });
    doAll(updates);

    const rows = db.prepare(`SELECT key, value FROM settings`).all();
    res.json(Object.fromEntries(rows.map(r => [r.key, r.value])));
});

// GET /api/admin/test-sso — verify OIDC discovery & client credentials
router.get('/test-sso', async (req, res) => {
    function getSetting(key) {
        return db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key)?.value ?? null;
    }

    const steps = {
        config: { ok: false, detail: '' },
        discovery: { ok: false, detail: '' },
        client: { ok: false, detail: '' },
    };

    const baseUrl = getSetting('authentik_url');
    const clientId = getSetting('authentik_client_id');
    const clientSecret = getSetting('authentik_client_secret');
    const siteUrl = (getSetting('site_url') || '').replace(/\/$/, '');

    // Step 1 — check all fields are present
    if (!baseUrl || !clientId || !clientSecret) {
        steps.config.detail = 'One or more fields are missing (Base URL, Client ID, Client Secret)';
        return res.status(400).json({ ok: false, steps });
    }
    steps.config.ok = true;
    steps.config.detail = `Base URL: ${baseUrl}`;

    // Step 2 — OIDC discovery
    let issuer;
    try {
        issuer = await Issuer.discover(baseUrl.replace(/\/$/, ''));
        steps.discovery.ok = true;
        steps.discovery.detail = `Issuer discovered: ${issuer.issuer}`;
    } catch (err) {
        steps.discovery.detail = `Discovery failed — check that the Base URL is correct and reachable. Error: ${err.message}`;
        return res.status(400).json({ ok: false, steps });
    }

    // Step 3 — build client & generate a test authorization URL (no HTTP call needed)
    try {
        const redirectUri = `${siteUrl}/api/auth/oidc/callback`;
        const client = new issuer.Client({
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uris: [redirectUri],
            response_types: ['code'],
        });
        // authorizationUrl() will throw if the issuer is missing required metadata
        client.authorizationUrl({
            scope: 'openid profile email',
            state: generators.state(),
            nonce: generators.nonce(),
        });
        steps.client.ok = true;
        steps.client.detail = `Client configuration valid. Redirect URI: ${redirectUri}`;
    } catch (err) {
        steps.client.detail = `Client configuration error: ${err.message}`;
        return res.status(400).json({ ok: false, steps });
    }

    return res.json({ ok: true, steps });
});

// ── User Management ─────────────────────────────────────────────────────────

// GET /api/admin/users
router.get('/users', (req, res) => {
    const users = db.prepare(
        `SELECT id, username, email, role, created_at, oidc_sub, 
         CASE WHEN password_hash IS NOT NULL THEN 1 ELSE 0 END as has_password,
         avatar, avatar_pixelated
         FROM users ORDER BY created_at DESC`
    ).all();

    // Format for frontend
    const formatted = users.map(u => ({
        id: u.id,
        username: u.username,
        email: u.email,
        role: u.role,
        joined: u.created_at,
        has_sso: !!u.oidc_sub,
        has_password: !!u.has_password,
        avatar: u.avatar,
        avatar_pixelated: u.avatar_pixelated
    }));

    res.json(formatted);
});

// PATCH /api/admin/users/:id
router.patch('/users/:id', (req, res) => {
    const targetUserId = req.params.id;
    const { role } = req.body;

    if (!['admin', 'user'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
    }

    // Prevent self-demotion
    if (targetUserId === req.user.id && role !== 'admin') {
        return res.status(403).json({ error: 'You cannot demote yourself' });
    }

    const user = db.prepare(`SELECT id FROM users WHERE id = ?`).get(targetUserId);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    db.prepare(`UPDATE users SET role = ? WHERE id = ?`).run(role, targetUserId);
    res.json({ ok: true });
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', (req, res) => {
    const targetUserId = req.params.id;

    // Prevent self-deletion
    if (targetUserId === req.user.id) {
        return res.status(403).json({ error: 'You cannot delete yourself' });
    }

    const user = db.prepare(`SELECT id FROM users WHERE id = ?`).get(targetUserId);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    db.prepare(`DELETE FROM users WHERE id = ?`).run(targetUserId);
    res.json({ ok: true });
});

module.exports = router;
