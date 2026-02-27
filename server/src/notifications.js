/**
 * Notification service — SMTP and Discord webhook.
 *
 * Channels per event are controlled by settings like `notify_on_propose_channels`
 * which accept: 'off' | 'smtp' | 'discord' | 'both'.
 *
 * SMTP emails are sent per-user in their preferred language.
 * Discord embeds use the game's cover image as thumbnail.
 */

const db = require('./db');
const fs = require('fs');
const path = require('path');

function getSetting(key) {
    return db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value ?? null;
}

/**
 * Returns all users that have an email address, grouped by their language preference.
 * @returns {Record<string, string[]>}  e.g. { en: ['a@x.com'], it: ['b@y.com'] }
 */
function getUsersByLanguage() {
    const rows = db.prepare(
        `SELECT email, COALESCE(NULLIF(TRIM(language),''), 'en') AS lang
         FROM users
         WHERE email IS NOT NULL AND TRIM(email) != ''`
    ).all();
    const map = {};
    for (const row of rows) {
        const lang = TRANSLATIONS[row.lang] ? row.lang : 'en';
        if (!map[lang]) map[lang] = [];
        map[lang].push(row.email.trim());
    }
    return map;
}

// ── Server-side translations ─────────────────────────────────────────────────

const TRANSLATIONS = {
    en: {
        gameProposedSubject: (title) => `🎮 New game proposed: ${title}`,
        gameProposedHeadline: 'New game proposed!',
        gameProposedBody: (proposer, title) => [
            `${proposer} has proposed a new game for the group:`,
            '',
            `» ${title}`,
            '',
            'Cast your vote to help decide if the group should play it.',
        ],
        gameProposedCta: 'Vote now',
        footer: 'ORGANIZE. VOTE. PLAY. TOGETHER.',
        testHeadline: 'SMTP test successful!',
        testBody: [
            'This is a test email from your CoopLyst instance.',
            '',
            'If you can read this, your SMTP configuration is working correctly.',
        ],
        disclaimer: 'You are receiving this because you are a member of this CoopLyst instance.',
    },
    it: {
        gameProposedSubject: (title) => `🎮 Nuovo gioco proposto: ${title}`,
        gameProposedHeadline: 'Nuovo gioco proposto!',
        gameProposedBody: (proposer, title) => [
            `${proposer} ha proposto un nuovo gioco per il gruppo:`,
            '',
            `» ${title}`,
            '',
            'Esprimi il tuo voto per decidere se il gruppo dovrebbe giocarlo.',
        ],
        gameProposedCta: 'Vota ora',
        footer: 'ORGANIZZA. VOTA. GIOCA. INSIEME.',
        testHeadline: 'Test SMTP riuscito!',
        testBody: [
            'Questa è un\'email di test dalla tua istanza CoopLyst.',
            '',
            'Se riesci a leggerla, la configurazione SMTP funziona correttamente.',
        ],
        disclaimer: 'Ricevi questa email perché sei un membro di questa istanza CoopLyst.',
    },
};

// ── Email HTML template ──────────────────────────────────────────────────────

/**
 * Build a styled HTML email matching the CoopLyst platform look.
 * Falls back gracefully in email clients that strip styles.
 */
function buildEmailHtml({ preheader, headline, bodyLines, ctaUrl, ctaLabel, footerNote, disclaimer, coverImageUrl, logoImageUrl }) {
    const esc = (s) => String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const ctaBlock = ctaUrl ? `
        <tr>
          <td align="center" style="padding:28px 40px 8px;">
            <a href="${esc(ctaUrl)}"
               style="display:inline-block;background:#4a90e2;color:#ffffff;
                      font-family:'Courier New',Courier,monospace;font-size:11px;
                      font-weight:bold;letter-spacing:2px;text-transform:uppercase;
                      text-decoration:none;padding:14px 32px;border:2px solid #6aaef5;
                      border-radius:2px;">
              ${esc(ctaLabel || 'GO')}
            </a>
          </td>
        </tr>` : '';

    const bodyHtml = bodyLines
        .map(line => line === ''
            ? `<tr><td style="height:6px;"></td></tr>`
            : `<tr><td style="padding:2px 40px;font-family:'Courier New',Courier,monospace;font-size:12px;color:#b0c4de;line-height:1.8;">${esc(line)}</td></tr>`)
        .join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>${esc(headline)}</title>
</head>
<body style="margin:0;padding:0;background-color:#0b0f19;">
  <div style="display:none;max-height:0;overflow:hidden;color:#0b0f19;font-size:1px;">
    ${esc(preheader || headline)}
  </div>

  <!-- Outer wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background-color:#0b0f19;background-image:linear-gradient(180deg,#050b14 0%,#152240 60%,#1e3a67 100%);">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <!-- Card -->
        <table width="600" cellpadding="0" cellspacing="0" border="0"
               style="max-width:600px;background-color:#0d1528;border:2px solid #4a90e2;border-radius:4px;">

                    <!-- Header bar -->
                    <tr>
                        <td style="background:linear-gradient(90deg,#0d1b3e 0%,#1a2f5e 100%);
                                             border-bottom:2px solid #4a90e2;padding:22px 40px;text-align:center;">
                            ${logoImageUrl ? `<img src="${esc(logoImageUrl)}" alt="CoopLyst" width="120" style="display:block;margin:0 auto 8px;border-radius:4px;" />` : ''}
                            <span style="font-family:'Courier New',Courier,monospace;font-size:22px;
                                                     font-weight:bold;letter-spacing:3px;text-shadow:2px 2px 0 #000;">
                                <span style="color:#4a90e2;">Coop</span><span style="color:#e24a4a;">Lyst</span>
                            </span>
                        </td>
                    </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:24px 40px 8px;">
              <div style="border-top:1px solid rgba(74,144,226,0.12);"></div>
            </td>
          </tr>

          <!-- Headline -->
          <tr>
            <td style="padding:8px 40px 16px;text-align:center;">
              <span style="font-family:'Courier New',Courier,monospace;font-size:14px;
                           font-weight:bold;letter-spacing:2px;color:#f8e71c;
                           text-transform:uppercase;">
                ${esc(headline)}
              </span>
            </td>
          </tr>

          <!-- Cover image -->
          ${coverImageUrl ? `
          <tr>
            <td align="center" style="padding:0 40px 20px;">
              <img src="${coverImageUrl}" alt="Cover" width="300"
                   style="display:block;max-width:300px;height:auto;border:2px solid #4a90e2;
                          border-radius:2px;" />
            </td>
          </tr>` : ''}

          <!-- Body lines -->
          ${bodyHtml}

          <!-- CTA button -->
          ${ctaBlock}

          <!-- Spacer -->
          <tr><td style="height:32px;"></td></tr>

          <!-- Footer -->
          <tr>
            <td style="border-top:1px solid rgba(74,144,226,0.25);padding:18px 40px;text-align:center;
                       font-family:'Courier New',Courier,monospace;font-size:10px;
                       color:#3a5272;letter-spacing:1px;text-transform:uppercase;">
              ${esc(footerNote || 'ORGANIZE. VOTE. PLAY. TOGETHER.')}
              <br/><br/>
              <span style="color:#253347;">
                ${esc(disclaimer || 'You are receiving this because you are a member of this CoopLyst instance.')}
              </span>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function getAssetDataUri(filename) {
    try {
        const assetPath = path.join(__dirname, '../assets', filename);
        if (!fs.existsSync(assetPath)) return null;
        const buf = fs.readFileSync(assetPath);
        const ext = path.extname(filename).slice(1) || 'png';
        return `data:image/${ext};base64,${buf.toString('base64')}`;
    } catch {
        return null;
    }
}

function getAssetPath(filename) {
    try {
        const assetPath = path.join(__dirname, '../assets', filename);
        return fs.existsSync(assetPath) ? assetPath : null;
    } catch {
        return null;
    }
}

// ── SMTP low-level send ──────────────────────────────────────────────────────

/**
 * @param {{ to: string[], subject: string, html: string, text: string, attachments?: any[] }} opts
 * `to` is explicit — callers decide the recipient list.
 */
async function sendSmtpEmail({ to, subject, html, text, attachments }) {
    let nodemailer;
    try {
        nodemailer = require('nodemailer');
    } catch {
        console.warn('[COOPLYST] nodemailer not installed, skipping SMTP notification');
        return { ok: false, detail: 'nodemailer not installed' };
    }

    const host = getSetting('smtp_host');
    const port = parseInt(getSetting('smtp_port') || '587', 10);
    const secure = getSetting('smtp_secure') === 'true';
    const user = getSetting('smtp_user');
    const pass = getSetting('smtp_pass');
    const from = getSetting('smtp_from') || user;

    if (!host) {
        return { ok: false, detail: 'SMTP host is not configured' };
    }
    if (!to || to.length === 0) {
        return { ok: false, detail: 'No recipient addresses provided' };
    }

    const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: user && pass ? { user, pass } : undefined,
    });

    try {
        await transporter.sendMail({ from, to, subject, html, text, attachments: attachments || [] });
        return { ok: true, detail: `Email sent to ${to.length} recipient(s)` };
    } catch (err) {
        return { ok: false, detail: err.message };
    }
}

// ── Discord ─────────────────────────────────────────────────────────────────

async function sendDiscordWebhook({ content, embeds }) {
    const webhookUrl = getSetting('discord_webhook_url');
    if (!webhookUrl) {
        return { ok: false, detail: 'Discord webhook URL not configured' };
    }

    try {
        const body = {};
        if (content) body.content = content;
        if (embeds) body.embeds = embeds;

        const res = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const text = await res.text().catch(() => '');
            return { ok: false, detail: `Discord returned HTTP ${res.status}: ${text.slice(0, 200)}` };
        }
        return { ok: true, detail: 'Discord message sent' };
    } catch (err) {
        return { ok: false, detail: err.message };
    }
}

// ── High-level events ────────────────────────────────────────────────────────

/**
 * Send a "game proposed" notification via configured channels.
 *
 * Channel selection comes from the `notify_on_propose_channels` setting:
 *   'off' | 'smtp' | 'discord' | 'both'
 *
 * SMTP emails are sent per language group (each user gets their preferred language).
 * Discord embed includes the game's cover image as a thumbnail.
 *
 * @param {{ title: string, id: string, cover_url?: string|null, proposedByUsername: string }} game
 * @param {string} siteUrl  public base URL (no trailing slash)
 */
async function notifyGameProposed(game, siteUrl) {
    const channels = getSetting('notify_on_propose_channels') || 'off';
    if (channels === 'off') return;

    const useSMTP = channels === 'smtp' || channels === 'both';
    const useDiscord = channels === 'discord' || channels === 'both';

    const base = siteUrl ? siteUrl.replace(/\/$/, '') : '';
    const gameUrl = base ? `${base}/#/game/${game.id}` : null;
    // Only use absolute http(s) URLs in Discord (relative paths won't work)
    const coverImageUrl = (game.cover_url && /^https?:\/\//.test(game.cover_url))
        ? game.cover_url
        : null;

    const results = {};

    // ── SMTP — send per-language group ───────────────────────────────────────
    if (useSMTP) {
        const byLang = getUsersByLanguage();
        const totalUsers = Object.values(byLang).reduce((n, arr) => n + arr.length, 0);

        if (totalUsers === 0) {
            console.warn('[COOPLYST] SMTP notification skipped — no users have email addresses');
            results.smtp = { ok: false, detail: 'No user emails found' };
        } else {
            const smtpResults = [];
            for (const [lang, emails] of Object.entries(byLang)) {
                const tr = TRANSLATIONS[lang] || TRANSLATIONS.en;
                const subject = tr.gameProposedSubject(game.title);
                const bodyLines = tr.gameProposedBody(game.proposedByUsername, game.title);
                const embeddedLogo = getAssetDataUri('cooplyst-icon.png');
                const logoPath = getAssetPath('cooplyst-icon.png');
                const logoCid = 'cooplyst-logo@cooplyst';
                const html = buildEmailHtml({
                    preheader: bodyLines[0],
                    headline: tr.gameProposedHeadline,
                    bodyLines,
                    ctaUrl: gameUrl,
                    ctaLabel: tr.gameProposedCta,
                    footerNote: tr.footer,
                    disclaimer: tr.disclaimer,
                    coverImageUrl,
                    logoImageUrl: logoPath ? `cid:${logoCid}` : (embeddedLogo || (base ? `${base}/email-assets/cooplyst-icon.png` : null)),
                });
                const text = `${bodyLines.filter(Boolean).join(' ')}${gameUrl ? `\n\n${tr.gameProposedCta}: ${gameUrl}` : ''}`;
                const attachments = logoPath ? [{ filename: 'cooplyst-icon.png', path: logoPath, cid: logoCid }] : [];
                const r = await sendSmtpEmail({ to: emails, subject, html, text, attachments });
                if (!r.ok) console.warn(`[COOPLYST] SMTP notification failed (${lang}):`, r.detail);
                smtpResults.push(r);
            }
            results.smtp = smtpResults.every(r => r.ok)
                ? { ok: true,  detail: `Email sent to ${totalUsers} recipient(s)` }
                : { ok: false, detail: smtpResults.find(r => !r.ok)?.detail || 'Partial failure' };
        }
    }

    // ── Discord ───────────────────────────────────────────────────────────────
    if (useDiscord) {
        const discordLang = getSetting('discord_language') || 'en';
        const dtr = TRANSLATIONS[discordLang] || TRANSLATIONS.en;
        const embed = {
            title: dtr.gameProposedSubject(game.title),
            description: dtr.gameProposedBody(game.proposedByUsername, game.title)
                .filter(Boolean).slice(0, 2).join(' '),
            color: 0x4a90e2,
            fields: gameUrl
                ? [{ name: dtr.gameProposedCta, value: `[→ ${dtr.gameProposedCta}](${gameUrl})`, inline: false }]
                : [],
            timestamp: new Date().toISOString(),
        };
        if (coverImageUrl) embed.thumbnail = { url: coverImageUrl };
        results.discord = await sendDiscordWebhook({ embeds: [embed] });
        if (!results.discord.ok) {
            console.warn('[COOPLYST] Discord notification failed:', results.discord.detail);
        }
    }

    return results;
}

// ── Test helpers ─────────────────────────────────────────────────────────────

async function testSmtp() {
    const host = getSetting('smtp_host');
    if (!host) return { ok: false, detail: 'SMTP host is not configured' };

    const toRaw = getSetting('smtp_to') || '';
    const to = toRaw.split(',').map(s => s.trim()).filter(Boolean);
    if (to.length === 0) return { ok: false, detail: 'No test recipient configured in the Notifications settings' };

    const tr = TRANSLATIONS.en;
    const site = getSetting('site_url') || '';
    const base = site ? site.replace(/\/$/, '') : '';
    const embeddedLogo = getAssetDataUri('cooplyst-icon.png');
    const logoPath = getAssetPath('cooplyst-icon.png');
    const logoCid = 'cooplyst-logo@cooplyst';
    const html = buildEmailHtml({
        preheader: 'CoopLyst SMTP test — everything is working!',
        headline: tr.testHeadline,
        bodyLines: tr.testBody,
        ctaUrl: null,
        ctaLabel: null,
        footerNote: tr.footer,
        disclaimer: tr.disclaimer,
        logoImageUrl: logoPath ? `cid:${logoCid}` : (embeddedLogo || (base ? `${base}/email-assets/cooplyst-icon.png` : null)),
    });

    return sendSmtpEmail({
        to,
        subject: '✅ CoopLyst — SMTP test',
        html,
        text: 'This is a test email from CoopLyst. SMTP is working correctly!',
        attachments: logoPath ? [{ filename: 'cooplyst-icon.png', path: logoPath, cid: logoCid }] : [],
    });
}

async function testDiscord() {
    const webhookUrl = getSetting('discord_webhook_url');
    if (!webhookUrl) return { ok: false, detail: 'Discord webhook URL is not configured' };

    return sendDiscordWebhook({
        embeds: [{
            title: '✅ CoopLyst — Discord test',
            description: 'Discord webhook is working correctly!',
            color: 0x22c55e,
            timestamp: new Date().toISOString(),
        }],
    });
}

module.exports = {
    notifyGameProposed,
    testSmtp,
    testDiscord,
};
