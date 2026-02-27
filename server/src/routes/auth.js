const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { Issuer, generators } = require('openid-client');
const db = require('../db');

const router = express.Router();
const SALT_ROUNDS = 12;
const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_EXPIRY = '8h';

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Read a setting from the DB; returns the raw string value or null */
function getSetting(key) {
    const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key);
    return row?.value ?? null;
}

/** Resolve the site base URL (from DB setting, env var, or fallback) */
function resolveSiteUrl() {
    const fromDb = getSetting('site_url');
    if (fromDb) return fromDb.replace(/\/$/, '');
    return (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
}

/** Return a full-config object from settings (no secrets exposed) */
function getPublicConfig() {
    return {
        registration_enabled: getSetting('registration_enabled') !== 'false',
        local_auth_enabled: getSetting('local_auth_enabled') !== 'false',
        authentik_enabled: getSetting('authentik_enabled') === 'true',
        authentik_url: getSetting('authentik_url') || '',
        authentik_client_id: getSetting('authentik_client_id') || '',
        authentik_auto_redirect: getSetting('authentik_auto_redirect') === 'true',
        site_url: getSetting('site_url') || '',
    };
}

// In-memory state/nonce store (keyed by state string, value expires after 5 min)
const oidcStateStore = new Map();
function pruneStateStore() {
    const now = Date.now();
    for (const [k, v] of oidcStateStore) {
        if (v.expires < now) oidcStateStore.delete(k);
    }
}
setInterval(pruneStateStore, 60_000);

/**
 * Build an openid-client Client from DB settings.
 * Returns null if Authentik is not (properly) configured.
 */
async function buildOidcClient() {
    const baseUrl = getSetting('authentik_url');
    const clientId = getSetting('authentik_client_id');
    const secret = getSetting('authentik_client_secret');

    if (!baseUrl || !clientId || !secret) return null;

    const issuer = await Issuer.discover(baseUrl.replace(/\/$/, ''));
    const redirectUri = `${resolveSiteUrl()}/api/auth/oidc/callback`;

    return new issuer.Client({
        client_id: clientId,
        client_secret: secret,
        redirect_uris: [redirectUri],
        response_types: ['code'],
    });
}

// ── Routes ───────────────────────────────────────────────────────────────────

// GET /api/auth/config — public, no auth required
router.get('/config', (req, res) => {
    res.json(getPublicConfig());
});

// GET /api/auth/oidc/login — redirect to Authentik authorization endpoint
router.get('/oidc/login', async (req, res) => {
    if (getSetting('authentik_enabled') !== 'true') {
        return res.status(403).json({ error: 'SSO is not enabled' });
    }
    try {
        const client = await buildOidcClient();
        if (!client) return res.status(500).json({ error: 'SSO is not fully configured' });

        const state = generators.state();
        const nonce = generators.nonce();
        oidcStateStore.set(state, { nonce, expires: Date.now() + 5 * 60_000 });

        const url = client.authorizationUrl({
            scope: 'openid profile email',
            state,
            nonce,
        });
        res.redirect(url);
    } catch (err) {
        console.error('[COOPLYST OIDC] Login redirect error:', err.message);
        res.status(500).json({ error: 'SSO configuration error — check Authentik URL' });
    }
});

// GET /api/auth/oidc/link — start OIDC flow to link an existing account
// Requires a valid Bearer JWT in the Authorization header.
router.get('/oidc/link', async (req, res) => {
    if (getSetting('authentik_enabled') !== 'true') {
        return res.status(403).json({ error: 'SSO is not enabled' });
    }

    // Validate the user's JWT — accept from Authorization header OR ?t= query param
    const header = req.headers['authorization'] || '';
    const bearerToken = (header.startsWith('Bearer ') ? header.slice(7) : null) || req.query.t || null;
    if (!bearerToken) return res.status(401).json({ error: 'No token provided' });
    let decoded;
    try {
        decoded = jwt.verify(bearerToken, JWT_SECRET);
    } catch {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }

    try {
        const client = await buildOidcClient();
        if (!client) return res.status(500).json({ error: 'SSO is not fully configured' });

        const state = generators.state();
        const nonce = generators.nonce();
        // Store linkUserId so the callback knows to link rather than log in
        oidcStateStore.set(state, { nonce, expires: Date.now() + 5 * 60_000, linkUserId: decoded.id });

        const url = client.authorizationUrl({
            scope: 'openid profile email',
            state,
            nonce,
        });
        res.redirect(url);
    } catch (err) {
        console.error('[COOPLYST OIDC] Link redirect error:', err.message);
        res.status(500).json({ error: 'SSO configuration error — check Authentik URL' });
    }
});

// GET /api/auth/oidc/callback — Authentik sends the user back here
router.get('/oidc/callback', async (req, res) => {
    if (getSetting('authentik_enabled') !== 'true') {
        return res.status(403).json({ error: 'SSO is not enabled' });
    }
    try {
        const client = await buildOidcClient();
        if (!client) return res.status(500).json({ error: 'SSO is not fully configured' });

        const params = client.callbackParams(req);
        const stateKey = params.state;
        const stored = oidcStateStore.get(stateKey);

        if (!stored || stored.expires < Date.now()) {
            return res.status(400).json({ error: 'Invalid or expired SSO state' });
        }
        oidcStateStore.delete(stateKey);

        const redirectUri = `${resolveSiteUrl()}/api/auth/oidc/callback`;
        const tokenSet = await client.callback(redirectUri, params, {
            state: stateKey,
            nonce: stored.nonce,
        });
        const claims = tokenSet.claims();

        const sub = claims.sub;
        const email = claims.email || null;
        const username = claims.preferred_username || claims.email?.split('@')[0] || `user_${sub.slice(0, 8)}`;

        // ── Account linking mode ────────────────────────────────────────────
        if (stored.linkUserId) {
            // Check this SSO identity isn't already linked to a DIFFERENT account
            const existing = db.prepare(`SELECT id FROM users WHERE oidc_sub = ?`).get(sub);
            if (existing && existing.id !== stored.linkUserId) {
                return res.redirect(`${resolveSiteUrl()}/#sso_link_error=${encodeURIComponent('This SSO account is already linked to another user')}`);
            }
            db.prepare(`UPDATE users SET oidc_sub = ? WHERE id = ?`).run(sub, stored.linkUserId);
            return res.redirect(`${resolveSiteUrl()}/#sso_linked=1`);
        }

        // ── Normal login mode ───────────────────────────────────────────────
        // Find or create local user record linked to this SSO identity
        let user = db.prepare(`SELECT id, username, email, role FROM users WHERE oidc_sub = ?`).get(sub);

        if (user) {
            // Update email from SSO claims if changed
            if (email && user.email !== email) {
                db.prepare(`UPDATE users SET email = ? WHERE id = ?`).run(email, user.id);
                user.email = email;
            }
        }

        if (!user) {
            // Try to match by email if provided
            if (email) {
                user = db.prepare(`SELECT id, username, email, role FROM users WHERE email = ?`).get(email);
            }
            // Try to match by username as a last resort
            if (!user) {
                user = db.prepare(`SELECT id, username, email, role FROM users WHERE username = ?`).get(username);
            }
            if (user) {
                // Link this existing account to the SSO identity
                db.prepare(`UPDATE users SET oidc_sub = ? WHERE id = ?`).run(sub, user.id);
            } else {
                if (getSetting('authentik_auto_register') === 'false') {
                    return res.redirect(`${resolveSiteUrl()}/#sso_error=${encodeURIComponent('SSO registration is currently disabled by the administrator.')}`);
                }

                // Create a brand-new SSO-only account
                const id = uuidv4();
                // Ensure unique username
                let finalUsername = username;
                let attempt = 0;
                while (db.prepare(`SELECT id FROM users WHERE username = ?`).get(finalUsername)) {
                    attempt++;
                    finalUsername = `${username}_${attempt}`;
                }
                db.prepare(
                    `INSERT INTO users (id, username, email, password_hash, oidc_sub, role)
                     VALUES (?, ?, ?, NULL, ?, 'user')`
                ).run(id, finalUsername, email, sub);
                user = { id, username: finalUsername, email, role: 'user' };
            }
        }

        // Issue Cooplyst JWT
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: TOKEN_EXPIRY }
        );

        // Redirect to frontend with token in hash (never in query string to prevent server logs)
        res.redirect(`${resolveSiteUrl()}/#sso_token=${encodeURIComponent(token)}`);
    } catch (err) {
        console.error('[COOPLYST OIDC] Callback error:', err.message);
        res.redirect(`${resolveSiteUrl()}/#sso_error=${encodeURIComponent(err.message)}`);
    }
});

// POST /api/auth/login
router.post('/login', (req, res) => {
    if (getSetting('local_auth_enabled') === 'false') {
        return res.status(403).json({ error: 'Local authentication is disabled. Please use SSO.' });
    }

    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = db.prepare(
        `SELECT id, username, email, password_hash, role FROM users WHERE username = ?`
    ).get(username);

    if (!user || !user.password_hash) {
        // Constant-time response to prevent username enumeration
        bcrypt.compare(password, '$2b$12$invalidhashpadding000000000000000000000000000000000000');
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: TOKEN_EXPIRY }
    );

    res.json({
        token,
        user: { id: user.id, username: user.username, email: user.email, role: user.role }
    });
});

// POST /api/auth/register
router.post('/register', (req, res) => {
    if (getSetting('local_auth_enabled') === 'false') {
        return res.status(403).json({ error: 'Local authentication is disabled. Please use SSO.' });
    }

    // Check if registration is enabled
    const regSetting = db.prepare(`SELECT value FROM settings WHERE key = 'registration_enabled'`).get();
    if (regSetting?.value !== 'true') {
        return res.status(403).json({ error: 'Registration is currently disabled by the administrator' });
    }

    const { username, email, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }
    if (username.toLowerCase() === 'admin') {
        return res.status(400).json({ error: 'This username is reserved' });
    }
    if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existing = db.prepare(`SELECT id FROM users WHERE username = ?`).get(username);
    if (existing) return res.status(409).json({ error: 'Username already taken' });

    const id = uuidv4();
    const password_hash = bcrypt.hashSync(password, SALT_ROUNDS);

    try {
        db.prepare(
            `INSERT INTO users (id, username, email, password_hash, role) VALUES (?, ?, ?, ?, 'user')`
        ).run(id, username, email || null, password_hash);
    } catch (err) {
        if (err.message.includes('UNIQUE')) {
            return res.status(409).json({ error: 'Username or email already taken' });
        }
        throw err;
    }

    const token = jwt.sign({ id, username, role: 'user' }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
    res.status(201).json({
        token,
        user: { id, username, email: email || null, role: 'user' }
    });
});

module.exports = router;
