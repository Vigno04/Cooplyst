const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// ── Crash logging ────────────────────────────────────────────────────────
process.on('uncaughtException', (err) => {
    console.error('[CRITICAL] Uncaught Exception:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
    // Optional: process.exit(1) if you want to force crash, but logging is key
});

const db = require('./db');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../data');
const AVATARS_DIR = path.join(DATA_DIR, 'avatars');
const MEDIA_DIR = path.join(DATA_DIR, 'media');
if (!fs.existsSync(AVATARS_DIR)) fs.mkdirSync(AVATARS_DIR, { recursive: true });
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });

// ── First-boot: create admin account if no admin-role user exists ──────────
function bootstrapAdmin() {
    const existing = db.prepare(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`).get();
    if (existing) return;

    // Generate a cryptographically random 32-char hex token
    const rawToken = crypto.randomBytes(16).toString('hex'); // 32 hex chars
    const password_hash = bcrypt.hashSync(rawToken, 12);
    const id = uuidv4();

    db.prepare(
        `INSERT INTO users (id, username, email, password_hash, role)
         VALUES (?, 'admin', NULL, ?, 'admin')`
    ).run(id, password_hash);

    // Print token ONCE to stdout — never stored in plaintext
    console.log('\n' + '='.repeat(60));
    console.log('  [COOPLYST] First boot detected. Admin account created.');
    console.log('  Username : admin');
    console.log(`  Token    : ${rawToken}`);
    console.log('  → Log in and change your password immediately.');
    console.log('  → This token will NOT be shown again.');
    console.log('='.repeat(60) + '\n');
}

bootstrapAdmin();

// ── Express setup ──────────────────────────────────────────────────────────
const app = express();

// Minimal request logging to track what precedes a crash
app.use((req, res, next) => {
    console.log(`[REQ] ${req.method} ${req.originalUrl || req.url}`);
    next();
});

// Running behind nginx/reverse proxy in docker-compose
app.set('trust proxy', 1);

// Security headers
app.use(helmet());

// Parse JSON bodies (limit prevents large payload attacks)
app.use(express.json({ limit: '10kb' }));

// Rate limiting on all API routes (100 requests per 15 minutes per IP)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' }
});

// Stricter limiter for auth endpoints (10 attempts per 15 min per IP)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts, please try again later' }
});

app.use('/api', limiter);

// ── Static avatar files ────────────────────────────────────────────────────
app.use('/api/avatars', express.static(AVATARS_DIR));
app.use('/api/media', express.static(MEDIA_DIR));
// Serve frontend assets (logo/favicon) so emails can reference them by absolute URL
app.use('/assets', express.static(path.join(__dirname, '../assets')));

// ── Routes ─────────────────────────────────────────────────────────────────
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');
const gameRoutes = require('./routes/games');

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/games', gameRoutes);

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// 404 catch-all
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Global error handler
app.use((err, req, res, _next) => {
    console.error('[COOPLYST ERROR]', err);
    res.status(500).json({ error: 'Internal server error' });
});

// ── Start ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`[COOPLYST] Backend listening on port ${PORT}`);
});
