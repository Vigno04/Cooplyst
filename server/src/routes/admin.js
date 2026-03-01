const express = require('express');
const fs = require('fs');
const path = require('path');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const db = require('../db');
const { Issuer, generators } = require('openid-client');
const { testSmtp, testDiscord } = require('../notifications');

const router = express.Router();

function getSetting(key) {
    return db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key)?.value ?? null;
}

const SERVER_PACKAGE_JSON_PATH = path.join(__dirname, '../../package.json');
const CLIENT_PACKAGE_JSON_PATH = path.join(__dirname, '../../../package.json');

function readPackageVersion(filePath, fallback = 'unknown') {
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        return parsed?.version || fallback;
    } catch {
        return fallback;
    }
}

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
    'vote_threshold',
    'vote_visibility',
    'game_api_providers',
    'notify_on_propose_channels',
    'smtp_enabled',
    'smtp_host',
    'smtp_port',
    'smtp_secure',
    'smtp_user',
    'smtp_pass',
    'smtp_from',
    'smtp_to',
    'discord_enabled',
    'discord_webhook_url',
    'discord_language',
    'upload_timeout_ms',
    'allow_all_users_add_downloads',
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

// GET /api/admin/info
router.get('/info', (req, res) => {
    const uptimeSeconds = Math.floor(process.uptime());
    const startedAtIso = new Date(Date.now() - uptimeSeconds * 1000).toISOString();

    const usersTotal = db.prepare(`SELECT COUNT(*) as count FROM users`).get()?.count || 0;
    const usersAdmins = db.prepare(`SELECT COUNT(*) as count FROM users WHERE role = 'admin'`).get()?.count || 0;
    const usersWithSso = db.prepare(`SELECT COUNT(*) as count FROM users WHERE oidc_sub IS NOT NULL`).get()?.count || 0;
    const usersWithEmail = db.prepare(`SELECT COUNT(*) as count FROM users WHERE email IS NOT NULL AND TRIM(email) != ''`).get()?.count || 0;

    const gamesTotal = db.prepare(`SELECT COUNT(*) as count FROM games`).get()?.count || 0;
    const gamesProposed = db.prepare(`SELECT COUNT(*) as count FROM games WHERE status = 'proposed'`).get()?.count || 0;
    const gamesVoting = db.prepare(`SELECT COUNT(*) as count FROM games WHERE status = 'voting'`).get()?.count || 0;
    const gamesBacklog = db.prepare(`SELECT COUNT(*) as count FROM games WHERE status = 'backlog'`).get()?.count || 0;
    const gamesPlaying = db.prepare(`SELECT COUNT(*) as count FROM games WHERE status = 'playing'`).get()?.count || 0;
    const gamesCompleted = db.prepare(`SELECT COUNT(*) as count FROM games WHERE status = 'completed'`).get()?.count || 0;

    const runsTotal = db.prepare(`SELECT COUNT(*) as count FROM game_runs`).get()?.count || 0;
    const ratingsTotal = db.prepare(`SELECT COUNT(*) as count FROM ratings`).get()?.count || 0;
    const mediaTotal = db.prepare(`SELECT COUNT(*) as count FROM media`).get()?.count || 0;

    res.json({
        app: {
            version: readPackageVersion(SERVER_PACKAGE_JSON_PATH),
            node_version: process.version,
            environment: process.env.NODE_ENV || 'development',
            platform: process.platform,
            arch: process.arch,
            uptime_seconds: uptimeSeconds,
            started_at: startedAtIso,
            generated_at: new Date().toISOString(),
        },
        counts: {
            users_total: usersTotal,
            users_admins: usersAdmins,
            users_with_sso: usersWithSso,
            users_with_email: usersWithEmail,
            games_total: gamesTotal,
            games_proposed: gamesProposed,
            games_voting: gamesVoting,
            games_backlog: gamesBacklog,
            games_playing: gamesPlaying,
            games_completed: gamesCompleted,
            runs_total: runsTotal,
            ratings_total: ratingsTotal,
            media_total: mediaTotal,
        },
    });
});

// GET /api/admin/test-sso — verify OIDC discovery & client credentials
router.get('/test-sso', async (req, res) => {
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

// ── Notification test endpoints ─────────────────────────────────────────────

// POST /api/admin/test-smtp
router.post('/test-smtp', async (req, res) => {
    try {
        const result = await testSmtp();
        res.json(result);
    } catch (err) {
        res.json({ ok: false, detail: err.message });
    }
});

// POST /api/admin/test-discord
router.post('/test-discord', async (req, res) => {
    try {
        const result = await testDiscord();
        res.json(result);
    } catch (err) {
        res.json({ ok: false, detail: err.message });
    }
});

module.exports = router;
