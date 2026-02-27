import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, AlertCircle, CheckCircle, Save, X, ShieldCheck, ChevronDown, BookOpen, FlaskConical, Loader2, Gamepad2, ArrowUp, ArrowDown, Plus, Trash2, Bell, Mail, MessageSquare, Eye, EyeOff } from 'lucide-react';

export default function AdminScreen({ token, onClose }) {
    const { t } = useTranslation();
    const [savedSettings, setSavedSettings] = useState(null);
    const [pending, setPending] = useState(null);
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(false);

    // Tab state
    const [activeTab, setActiveTab] = useState('general'); // 'general' | 'games' | 'notifications' | 'info' | 'users'
    const [providerTestResults, setProviderTestResults] = useState({});
    const [providerTesting, setProviderTesting] = useState({});

    // Notification test state
    const [smtpTesting, setSmtpTesting] = useState(false);
    const [smtpTestResult, setSmtpTestResult] = useState(null);
    const [discordTesting, setDiscordTesting] = useState(false);
    const [discordTestResult, setDiscordTestResult] = useState(null);
    const [smtpOpen, setSmtpOpen] = useState(false);
    const [discordOpen, setDiscordOpen] = useState(false);
    const [showSsoClientSecret, setShowSsoClientSecret] = useState(false);
    const [showSmtpPassword, setShowSmtpPassword] = useState(false);
    const [showProviderSecret, setShowProviderSecret] = useState({});

    // Accordion state
    const [ssoOpen, setSsoOpen] = useState(false);
    const [tutorialOpen, setTutorialOpen] = useState(false);
    const [ssoTestResult, setSsoTestResult] = useState(null);  // null | { ok, steps }
    const [ssoTesting, setSsoTesting] = useState(false);

    // Users state
    const [users, setUsers] = useState(null);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [errorUsers, setErrorUsers] = useState(null);

    // Info tab state
    const [adminInfo, setAdminInfo] = useState(null);
    const [loadingInfo, setLoadingInfo] = useState(false);
    const [errorInfo, setErrorInfo] = useState(null);

    useEffect(() => {
        fetch('/api/admin/settings', {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(r => r.json())
            .then(data => { setSavedSettings(data); setPending(data); })
            .catch(() => setStatus({ type: 'error', msg: t('networkError') }));
    }, [token, t]);

    useEffect(() => {
        if (activeTab === 'users' && !users) {
            setLoadingUsers(true);
            setErrorUsers(null);
            fetch('/api/admin/users', { headers: { 'Authorization': `Bearer ${token}` } })
                .then(r => r.json())
                .then(data => setUsers(data))
                .catch(() => setErrorUsers(t('networkError')))
                .finally(() => setLoadingUsers(false));
        }
    }, [activeTab, token, t, users]);

    useEffect(() => {
        if (activeTab === 'info' && !adminInfo) {
            setLoadingInfo(true);
            setErrorInfo(null);
            fetch('/api/admin/info', { headers: { 'Authorization': `Bearer ${token}` } })
                .then(r => r.json())
                .then(data => setAdminInfo(data))
                .catch(() => setErrorInfo(t('networkError')))
                .finally(() => setLoadingInfo(false));
        }
    }, [activeTab, token, t, adminInfo]);

    const toggle = (key) => {
        setPending(prev => ({
            ...prev,
            [key]: prev[key] === 'true' ? 'false' : 'true'
        }));
        setStatus(null);
    };

    const setText = (key, value) => {
        setPending(prev => ({ ...prev, [key]: value }));
        setStatus(null);
    };

    const isDirty = pending && savedSettings &&
        JSON.stringify(pending) !== JSON.stringify(savedSettings);

    const formatDateTime = (isoString) => {
        if (!isoString) return '—';
        const d = new Date(isoString);
        if (Number.isNaN(d.getTime())) return '—';
        return d.toLocaleString();
    };

    const formatUptime = (seconds) => {
        if (!Number.isFinite(seconds)) return '—';
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        const parts = [];
        if (days) parts.push(`${days}d`);
        if (hours || days) parts.push(`${hours}h`);
        if (minutes || hours || days) parts.push(`${minutes}m`);
        parts.push(`${secs}s`);
        return parts.join(' ');
    };

    // Shared save logic — returns true on success
    const doSave = async () => {
        setLoading(true);
        setStatus(null);
        try {
            const res = await fetch('/api/admin/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(pending),
            });
            const data = await res.json();
            if (!res.ok) { setStatus({ type: 'error', msg: data.error }); return false; }
            setSavedSettings(data);
            setPending(data);
            setStatus({ type: 'success', msg: t('adminSettingsSaved') });
            return true;
        } catch {
            setStatus({ type: 'error', msg: t('networkError') });
            return false;
        } finally {
            setLoading(false);
        }
    };

    const handleTestSso = async () => {
        // Validate required fields before attempting
        if (!pending?.authentik_url?.trim() || !pending?.authentik_client_id?.trim() || !pending?.authentik_client_secret?.trim()) {
            setSsoTestResult({
                ok: false, steps: {
                    config: { ok: false, detail: t('adminTestMissingFields') },
                    discovery: { ok: false, detail: '' },
                    client: { ok: false, detail: '' },
                }
            });
            return;
        }
        // Auto-save unsaved changes first
        if (isDirty) {
            const saved = await doSave();
            if (!saved) return;
        }
        setSsoTesting(true);
        setSsoTestResult(null);
        try {
            const res = await fetch('/api/admin/test-sso', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            setSsoTestResult(data);
        } catch {
            setSsoTestResult({
                ok: false, steps: {
                    config: { ok: false, detail: t('networkError') },
                    discovery: { ok: false, detail: '' },
                    client: { ok: false, detail: '' },
                }
            });
        } finally {
            setSsoTesting(false);
        }
    };

    const handleSave = async () => {
        if (!isDirty) return;
        await doSave();
    };

    const handleTestSmtp = async () => {
        if (isDirty) {
            const saved = await doSave();
            if (!saved) return;
        }
        setSmtpTesting(true);
        setSmtpTestResult(null);
        try {
            const res = await fetch('/api/admin/test-smtp', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
            });
            const data = await res.json();
            setSmtpTestResult(data);
        } catch {
            setSmtpTestResult({ ok: false, detail: t('networkError') });
        } finally {
            setSmtpTesting(false);
        }
    };

    const handleTestDiscord = async () => {
        if (isDirty) {
            const saved = await doSave();
            if (!saved) return;
        }
        setDiscordTesting(true);
        setDiscordTestResult(null);
        try {
            const res = await fetch('/api/admin/test-discord', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
            });
            const data = await res.json();
            setDiscordTestResult(data);
        } catch {
            setDiscordTestResult({ ok: false, detail: t('networkError') });
        } finally {
            setDiscordTesting(false);
        }
    };

    const handleToggleRole = async (userId, currentRole) => {
        const newRole = currentRole === 'admin' ? 'user' : 'admin';
        try {
            const res = await fetch(`/api/admin/users/${userId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ role: newRole })
            });
            const data = await res.json();
            if (res.ok) {
                setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
            } else {
                setStatus({ type: 'error', msg: data.error });
            }
        } catch {
            setStatus({ type: 'error', msg: t('networkError') });
        }
    };

    const handleDeleteUser = async (userId) => {
        if (!window.confirm(t('adminUserDeleteConfirm'))) return;
        try {
            const res = await fetch(`/api/admin/users/${userId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok) {
                setUsers(users.filter(u => u.id !== userId));
            } else {
                setStatus({ type: 'error', msg: data.error });
            }
        } catch {
            setStatus({ type: 'error', msg: t('networkError') });
        }
    };

    const ssoEnabled = pending?.authentik_enabled === 'true';

    // ── Provider helpers ────────────────────────────────────────────────────
    const getProviders = () => {
        try { return JSON.parse(pending?.game_api_providers || '[]'); }
        catch { return []; }
    };
    const setProviders = (list) => setText('game_api_providers', JSON.stringify(list));

    const addProvider = () => {
        const list = getProviders();
        list.push({ type: 'rawg', api_key: '', enabled: true, priority: list.length + 1 });
        setProviders(list);
    };
    const removeProvider = (idx) => {
        const list = getProviders().filter((_, i) => i !== idx);
        list.forEach((p, i) => p.priority = i + 1);
        setProviders(list);
    };
    const updateProvider = (idx, key, val) => {
        const list = getProviders();
        list[idx] = { ...list[idx], [key]: val };
        setProviders(list);
    };
    const moveProvider = (idx, dir) => {
        const list = getProviders();
        const newIdx = idx + dir;
        if (newIdx < 0 || newIdx >= list.length) return;
        [list[idx], list[newIdx]] = [list[newIdx], list[idx]];
        list.forEach((p, i) => p.priority = i + 1);
        setProviders(list);
    };
    const handleTestProvider = async (idx) => {
        const p = getProviders()[idx];
        // Validate required fields
        const missing = (p.type === 'rawg' && !p.api_key?.trim()) ||
            (p.type === 'igdb' && (!p.client_id?.trim() || !p.client_secret?.trim()));
        if (missing) {
            setProviderTestResults(prev => ({ ...prev, [idx]: { ok: false, detail: t('adminTestMissingFields') } }));
            return;
        }
        // Auto-save unsaved changes first
        if (isDirty) {
            const saved = await doSave();
            if (!saved) return;
        }
        setProviderTesting(prev => ({ ...prev, [idx]: true }));
        try {
            const res = await fetch('/api/games/search/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(p),
            });
            const data = await res.json();
            setProviderTestResults(prev => ({ ...prev, [idx]: data }));
        } catch {
            setProviderTestResults(prev => ({ ...prev, [idx]: { ok: false, detail: t('networkError') } }));
        } finally {
            setProviderTesting(prev => ({ ...prev, [idx]: false }));
        }
    };

    return (
        <div className="dashboard-wip" onClick={onClose}>
            <div className="screen-box" onClick={e => e.stopPropagation()}>
                <div className="screen-box-header">
                    <div className="screen-box-title text-red">
                        <Settings size={18} /> {t('navAdmin')}
                    </div>
                    <button className="screen-close-btn" onClick={onClose} aria-label="Close">
                        <X size={18} />
                    </button>
                </div>

                {status && (
                    <div className={`screen-alert ${status.type}`}>
                        {status.type === 'error' ? <AlertCircle size={14} /> : <CheckCircle size={14} />}
                        {status.msg}
                    </div>
                )}

                {pending ? (
                    <>
                        <div className="admin-tabs">
                            <button
                                className={`admin-tab-btn ${activeTab === 'general' ? 'active' : ''}`}
                                onClick={() => setActiveTab('general')}
                            >
                                {t('adminTabGeneral')}
                            </button>
                            <button
                                className={`admin-tab-btn ${activeTab === 'info' ? 'active' : ''}`}
                                onClick={() => setActiveTab('info')}
                            >
                                {t('adminTabInfo')}
                            </button>
                            <button
                                className={`admin-tab-btn ${activeTab === 'games' ? 'active' : ''}`}
                                onClick={() => setActiveTab('games')}
                            >
                                {t('adminTabGames')}
                            </button>
                            <button
                                className={`admin-tab-btn ${activeTab === 'notifications' ? 'active' : ''}`}
                                onClick={() => setActiveTab('notifications')}
                            >
                                {t('adminTabNotifications')}
                            </button>
                            <button
                                className={`admin-tab-btn ${activeTab === 'users' ? 'active' : ''}`}
                                onClick={() => setActiveTab('users')}
                            >
                                {t('adminTabUsers')}
                            </button>
                        </div>

                        {activeTab === 'general' && (
                            <>
                                <div className="admin-settings-list">

                                    {/* ── Registration ─────────────────────────────── */}
                                    <div className="admin-setting-row">
                                        <div className="admin-setting-info">
                                            <div className="admin-setting-label">{t('adminRegLabel')}</div>
                                            <div className="admin-setting-desc">{t('adminRegDesc')}</div>
                                        </div>
                                        <button
                                            className={`toggle-btn ${pending.registration_enabled === 'true' ? 'on' : 'off'}`}
                                            onClick={() => toggle('registration_enabled')}
                                            aria-label={t('adminRegLabel')}
                                        >
                                            {pending.registration_enabled === 'true' ? t('toggleOn') : t('toggleOff')}
                                        </button>
                                    </div>

                                    {/* ── Site URL ───────────────────────────────── */}
                                    <div className="admin-setting-row admin-setting-row--text">
                                        <div className="admin-setting-info">
                                            <label className="admin-setting-label" htmlFor="site-url">
                                                {t('adminSiteUrl')}
                                            </label>
                                            <div className="admin-setting-desc">{t('adminSiteUrlDesc')}</div>
                                        </div>
                                        <input
                                            id="site-url"
                                            type="url"
                                            className="admin-text-input"
                                            value={pending.site_url || ''}
                                            placeholder={t('adminSiteUrlPlaceholder')}
                                            onChange={e => setText('site_url', e.target.value)}
                                        />
                                    </div>

                                    {/* ── SSO / Authentik accordion ─────────────────── */}
                                    <div className="admin-accordion">
                                        <button
                                            className="admin-accordion-header"
                                            onClick={() => setSsoOpen(o => !o)}
                                            aria-expanded={ssoOpen}
                                        >
                                            <span className="admin-accordion-title">
                                                <ShieldCheck size={14} />
                                                {t('adminSsoSection')}
                                                {ssoEnabled && <span className="admin-accordion-badge">{t('toggleOn')}</span>}
                                            </span>
                                            <ChevronDown size={14} className={`admin-accordion-arrow ${ssoOpen ? 'open' : ''}`} />
                                        </button>

                                        {ssoOpen && (
                                            <div className="admin-accordion-body">

                                                {/* Enable Authentik SSO */}
                                                <div className="admin-setting-row">
                                                    <div className="admin-setting-info">
                                                        <div className="admin-setting-label">{t('adminSsoEnabled')}</div>
                                                        <div className="admin-setting-desc">{t('adminSsoEnabledDesc')}</div>
                                                    </div>
                                                    <button
                                                        className={`toggle-btn ${ssoEnabled ? 'on' : 'off'}`}
                                                        onClick={() => toggle('authentik_enabled')}
                                                        aria-label={t('adminSsoEnabled')}
                                                    >
                                                        {ssoEnabled ? t('toggleOn') : t('toggleOff')}
                                                    </button>
                                                </div>

                                                {ssoEnabled && (
                                                    <>
                                                        {/* Authentik Base URL */}
                                                        <div className="admin-setting-row admin-setting-row--text">
                                                            <div className="admin-setting-info">
                                                                <label className="admin-setting-label" htmlFor="sso-url">
                                                                    {t('adminSsoUrl')}
                                                                </label>
                                                            </div>
                                                            <input
                                                                id="sso-url"
                                                                type="url"
                                                                className="admin-text-input"
                                                                value={pending.authentik_url || ''}
                                                                placeholder={t('adminSsoUrlPlaceholder')}
                                                                onChange={e => setText('authentik_url', e.target.value)}
                                                            />
                                                        </div>

                                                        {/* Computed Callback URL */}
                                                        {pending.site_url && (
                                                            <div className="admin-setting-row admin-setting-row--text admin-callback-row">
                                                                <div className="admin-setting-info">
                                                                    <div className="admin-setting-label">{t('adminCallbackUrl')}</div>
                                                                    <div className="admin-setting-desc">{t('adminCallbackUrlDesc')}</div>
                                                                </div>
                                                                <div className="admin-callback-url">
                                                                    <code className="admin-tutorial-code admin-callback-code">
                                                                        {pending.site_url.replace(/\/$/, '')}/api/auth/oidc/callback
                                                                    </code>
                                                                    <button
                                                                        type="button"
                                                                        className="btn-copy"
                                                                        onClick={() => {
                                                                            navigator.clipboard.writeText(
                                                                                `${pending.site_url.replace(/\/$/, '')}/api/auth/oidc/callback`
                                                                            );
                                                                        }}
                                                                        title={t('adminCopyBtn')}
                                                                    >
                                                                        📋
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )}
                                                        {/* Client ID */}
                                                        <div className="admin-setting-row admin-setting-row--text">
                                                            <div className="admin-setting-info">
                                                                <label className="admin-setting-label" htmlFor="sso-client-id">
                                                                    {t('adminSsoClientId')}
                                                                </label>
                                                            </div>
                                                            <input
                                                                id="sso-client-id"
                                                                type="text"
                                                                className="admin-text-input"
                                                                value={pending.authentik_client_id || ''}
                                                                placeholder="abc123..."
                                                                onChange={e => setText('authentik_client_id', e.target.value)}
                                                            />
                                                        </div>

                                                        {/* Client Secret */}
                                                        <div className="admin-setting-row admin-setting-row--text">
                                                            <div className="admin-setting-info">
                                                                <label className="admin-setting-label" htmlFor="sso-client-secret">
                                                                    {t('adminSsoClientSecret')}
                                                                </label>
                                                            </div>
                                                            <div className="password-field">
                                                                <input
                                                                    id="sso-client-secret"
                                                                    type={showSsoClientSecret ? 'text' : 'password'}
                                                                    className="admin-text-input"
                                                                    value={pending.authentik_client_secret || ''}
                                                                    placeholder="••••••••••••"
                                                                    onChange={e => setText('authentik_client_secret', e.target.value)}
                                                                />
                                                                <button
                                                                    type="button"
                                                                    className="password-toggle-btn"
                                                                    onClick={() => setShowSsoClientSecret(v => !v)}
                                                                    aria-label={showSsoClientSecret ? 'Hide password' : 'Show password'}
                                                                >
                                                                    {showSsoClientSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Test Connection */}
                                                        <div className="admin-setting-row admin-setting-row--text">
                                                            <div className="admin-setting-info">
                                                                <div className="admin-setting-label">{t('adminSsoTest')}</div>
                                                                <div className="admin-setting-desc">{t('adminSsoTestDesc')}</div>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                className="btn btn-secondary btn-test-sso"
                                                                onClick={handleTestSso}
                                                                disabled={ssoTesting}
                                                            >
                                                                {ssoTesting
                                                                    ? <Loader2 size={14} className="spin" />
                                                                    : <FlaskConical size={14} />}
                                                                {ssoTesting ? t('adminSsoTesting') : t('adminSsoTestBtn')}
                                                            </button>
                                                        </div>

                                                        {/* Test results */}
                                                        {ssoTestResult && (
                                                            <div className={`sso-test-results ${ssoTestResult.ok ? 'ok' : 'fail'}`}>
                                                                {Object.entries(ssoTestResult.steps).map(([key, step]) => (
                                                                    <div key={key} className="sso-test-step">
                                                                        <span className={`sso-test-icon ${step.ok ? 'ok' : 'fail'}`}>
                                                                            {step.ok ? <CheckCircle size={13} /> : <AlertCircle size={13} />}
                                                                        </span>
                                                                        <span className="sso-test-step-name">{t(`adminSsoStep_${key}`)}</span>
                                                                        {step.detail && <span className="sso-test-detail">{step.detail}</span>}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {/* Allow Local Auth */}
                                                        <div className="admin-setting-row">
                                                            <div className="admin-setting-info">
                                                                <div className="admin-setting-label">{t('adminLocalAuth')}</div>
                                                                <div className="admin-setting-desc">{t('adminLocalAuthDesc')}</div>
                                                            </div>
                                                            <button
                                                                className={`toggle-btn ${pending.local_auth_enabled === 'true' ? 'on' : 'off'}`}
                                                                onClick={() => toggle('local_auth_enabled')}
                                                                aria-label={t('adminLocalAuth')}
                                                            >
                                                                {pending.local_auth_enabled === 'true' ? t('toggleOn') : t('toggleOff')}
                                                            </button>
                                                        </div>

                                                        {/* Auto-redirect to SSO */}
                                                        <div className="admin-setting-row">
                                                            <div className="admin-setting-info">
                                                                <div className="admin-setting-label">{t('adminAutoRedirect')}</div>
                                                                <div className="admin-setting-desc">{t('adminAutoRedirectDesc')}</div>
                                                            </div>
                                                            <button
                                                                className={`toggle-btn ${pending.authentik_auto_redirect === 'true' ? 'on' : 'off'}`}
                                                                onClick={() => toggle('authentik_auto_redirect')}
                                                                aria-label={t('adminAutoRedirect')}
                                                            >
                                                                {pending.authentik_auto_redirect === 'true' ? t('toggleOn') : t('toggleOff')}
                                                            </button>
                                                        </div>

                                                        {/* Auto-Register Users */}
                                                        <div className="admin-setting-row">
                                                            <div className="admin-setting-info">
                                                                <div className="admin-setting-label">{t('adminSsoAutoRegister')}</div>
                                                                <div className="admin-setting-desc">{t('adminSsoAutoRegisterDesc')}</div>
                                                            </div>
                                                            <button
                                                                className={`toggle-btn ${(pending.authentik_auto_register ?? 'true') === 'true' ? 'on' : 'off'}`}
                                                                onClick={() => {
                                                                    const isCurrentlyOn = (pending.authentik_auto_register ?? 'true') === 'true';
                                                                    setText('authentik_auto_register', isCurrentlyOn ? 'false' : 'true');
                                                                }}
                                                                aria-label={t('adminSsoAutoRegister')}
                                                            >
                                                                {(pending.authentik_auto_register ?? 'true') === 'true' ? t('toggleOn') : t('toggleOff')}
                                                            </button>
                                                        </div>
                                                    </>
                                                )}

                                                {/* ── Tutorial nested accordion ───── */}
                                                <div className="admin-accordion admin-accordion--nested">
                                                    <button
                                                        className="admin-accordion-header admin-accordion-header--tutorial"
                                                        onClick={() => setTutorialOpen(o => !o)}
                                                        aria-expanded={tutorialOpen}
                                                    >
                                                        <span className="admin-accordion-title">
                                                            <BookOpen size={13} />
                                                            {t('adminSsoTutorialTitle')}
                                                        </span>
                                                        <ChevronDown size={13} className={`admin-accordion-arrow ${tutorialOpen ? 'open' : ''}`} />
                                                    </button>

                                                    {tutorialOpen && (
                                                        <div className="admin-tutorial-body">
                                                            <ol className="admin-tutorial-steps">
                                                                <li>
                                                                    <strong>{t('adminSsoStep1Title')}</strong>
                                                                    <p>{t('adminSsoStep1Desc')}</p>
                                                                </li>
                                                                <li>
                                                                    <strong>{t('adminSsoStep2Title')}</strong>
                                                                    <p>{t('adminSsoStep2Desc')}</p>
                                                                </li>
                                                                <li>
                                                                    <strong>{t('adminSsoStep3Title')}</strong>
                                                                    <p>{t('adminSsoStep3Desc')}</p>
                                                                </li>
                                                                <li>
                                                                    <strong>{t('adminSsoStep4Title')}</strong>
                                                                    <p>{t('adminSsoStep4Desc')}</p>
                                                                    <code className="admin-tutorial-code">/api/auth/oidc/callback</code>
                                                                </li>
                                                                <li>
                                                                    <strong>{t('adminSsoStep5Title')}</strong>
                                                                    <p>{t('adminSsoStep5Desc')}</p>
                                                                </li>
                                                            </ol>
                                                        </div>
                                                    )}
                                                </div>

                                            </div>
                                        )}
                                    </div>
                                </div>

                                <button
                                    className="btn btn-primary"
                                    onClick={handleSave}
                                    disabled={loading || !isDirty}
                                >
                                    <Save size={16} />
                                    {loading ? t('saving') : t('adminSaveBtn')}
                                </button>
                            </>
                        )}

                        {activeTab === 'games' && (
                            <>
                                <div className="admin-settings-list">
                                    {/* Vote Threshold */}
                                    <div className="admin-setting-row admin-setting-row--text">
                                        <div className="admin-setting-info">
                                            <label className="admin-setting-label" htmlFor="vote-threshold">
                                                {t('adminVoteThreshold')}
                                            </label>
                                            <div className="admin-setting-desc">{t('adminVoteThresholdDesc')}</div>
                                        </div>
                                        <input
                                            id="vote-threshold"
                                            type="number"
                                            min="1"
                                            max="100"
                                            className="admin-text-input admin-number-input"
                                            value={pending.vote_threshold || '3'}
                                            onChange={e => setText('vote_threshold', e.target.value)}
                                        />
                                    </div>

                                    {/* Vote Visibility */}
                                    <div className="admin-setting-row">
                                        <div className="admin-setting-info">
                                            <div className="admin-setting-label">{t('adminVoteVisibility')}</div>
                                            <div className="admin-setting-desc">{t('adminVoteVisibilityDesc')}</div>
                                        </div>
                                        <button
                                            className={`toggle-btn ${pending.vote_visibility === 'public' ? 'on' : 'off'}`}
                                            onClick={() => setText('vote_visibility', pending.vote_visibility === 'public' ? 'anonymous' : 'public')}
                                        >
                                            {pending.vote_visibility === 'public' ? t('votePublic') : t('voteAnonymous')}
                                        </button>
                                    </div>

                                    {/* Game API Providers */}
                                    <div className="admin-providers-section">
                                        <div className="admin-setting-label" style={{ marginBottom: '0.5rem' }}>
                                            <Gamepad2 size={14} /> {t('adminApiProviders')}
                                        </div>
                                        <div className="admin-setting-desc" style={{ marginBottom: '0.75rem' }}>
                                            {t('adminApiProvidersDesc')}
                                        </div>

                                        {getProviders().map((p, idx) => (
                                            <div key={idx} className="provider-card">
                                                <div className="provider-card-header">
                                                    <select
                                                        className="provider-type-select"
                                                        value={p.type}
                                                        onChange={e => {
                                                            const newType = e.target.value;
                                                            const newP = { type: newType, enabled: p.enabled, priority: p.priority };
                                                            if (newType === 'rawg') newP.api_key = '';
                                                            else if (newType === 'igdb') { newP.client_id = ''; newP.client_secret = ''; }
                                                            const list = getProviders();
                                                            list[idx] = newP;
                                                            setProviders(list);
                                                        }}
                                                    >
                                                        <option value="rawg">RAWG</option>
                                                        <option value="igdb">IGDB</option>
                                                    </select>
                                                    <div className="provider-card-actions">
                                                        <button className="btn-icon" onClick={() => moveProvider(idx, -1)} disabled={idx === 0}>
                                                            <ArrowUp size={14} />
                                                        </button>
                                                        <button className="btn-icon" onClick={() => moveProvider(idx, 1)} disabled={idx === getProviders().length - 1}>
                                                            <ArrowDown size={14} />
                                                        </button>
                                                        <button
                                                            className={`toggle-btn toggle-btn--sm ${p.enabled ? 'on' : 'off'}`}
                                                            onClick={() => updateProvider(idx, 'enabled', !p.enabled)}
                                                        >
                                                            {p.enabled ? t('toggleOn') : t('toggleOff')}
                                                        </button>
                                                        <button className="btn-icon btn-icon--danger" onClick={() => removeProvider(idx)}>
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </div>

                                                {p.type === 'rawg' && (
                                                    <>
                                                        <input
                                                            type="text"
                                                            className="admin-text-input"
                                                            placeholder="RAWG API Key"
                                                            value={p.api_key || ''}
                                                            onChange={e => updateProvider(idx, 'api_key', e.target.value)}
                                                        />
                                                        <div className="provider-link-row">
                                                            <a
                                                                href="https://rawg.io/apidocs"
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="provider-get-key-link"
                                                            >
                                                                🔗 Get RAWG API Key
                                                            </a>
                                                        </div>
                                                    </>
                                                )}
                                                {p.type === 'igdb' && (
                                                    <>
                                                        <input
                                                            type="text"
                                                            className="admin-text-input"
                                                            placeholder="Twitch Client ID"
                                                            value={p.client_id || ''}
                                                            onChange={e => updateProvider(idx, 'client_id', e.target.value)}
                                                        />
                                                        <div className="password-field" style={{ marginTop: '0.35rem' }}>
                                                            <input
                                                                type={showProviderSecret[idx] ? 'text' : 'password'}
                                                                className="admin-text-input"
                                                                placeholder="Twitch Client Secret"
                                                                value={p.client_secret || ''}
                                                                onChange={e => updateProvider(idx, 'client_secret', e.target.value)}
                                                            />
                                                            <button
                                                                type="button"
                                                                className="password-toggle-btn"
                                                                onClick={() => setShowProviderSecret(prev => ({ ...prev, [idx]: !prev[idx] }))}
                                                                aria-label={showProviderSecret[idx] ? 'Hide password' : 'Show password'}
                                                            >
                                                                {showProviderSecret[idx] ? <EyeOff size={14} /> : <Eye size={14} />}
                                                            </button>
                                                        </div>
                                                        <div className="provider-link-row">
                                                            <a
                                                                href="https://api-docs.igdb.com/"
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="provider-get-key-link"
                                                            >
                                                                🔗 Get IGDB API Credentials
                                                            </a>
                                                        </div>
                                                    </>
                                                )}

                                                <button
                                                    className="btn btn-sm btn-outline"
                                                    onClick={() => handleTestProvider(idx)}
                                                    disabled={providerTesting[idx]}
                                                    style={{ marginTop: '0.4rem' }}
                                                >
                                                    {providerTesting[idx]
                                                        ? <><Loader2 size={13} className="spin" /> {t('adminSsoTesting')}</>
                                                        : <><FlaskConical size={13} /> {t('adminSsoTestBtn')}</>}
                                                </button>
                                                {providerTestResults[idx] && (
                                                    <div className={`provider-test-result ${providerTestResults[idx].ok ? 'ok' : 'fail'}`}>
                                                        {providerTestResults[idx].ok
                                                            ? <><CheckCircle size={13} /> {providerTestResults[idx].detail}</>
                                                            : <><AlertCircle size={13} /> {providerTestResults[idx].detail}</>}
                                                    </div>
                                                )}
                                            </div>
                                        ))}

                                        <button className="btn btn-sm btn-outline" onClick={addProvider} style={{ marginTop: '0.5rem' }}>
                                            <Plus size={14} /> {t('adminAddProvider')}
                                        </button>
                                    </div>
                                </div>

                                <button
                                    className="btn btn-primary"
                                    onClick={handleSave}
                                    disabled={loading || !isDirty}
                                >
                                    <Save size={16} />
                                    {loading ? t('saving') : t('adminSaveBtn')}
                                </button>
                            </>
                        )}

                        {activeTab === 'info' && (
                            <div className="admin-tab-content">
                                {loadingInfo && <p className="dashboard-wip-text">{t('loading')}</p>}
                                {!loadingInfo && errorInfo && <p className="dashboard-wip-text">{errorInfo}</p>}
                                {!loadingInfo && !errorInfo && adminInfo && (
                                    <div className="admin-info-grid">
                                        <div className="admin-info-card">
                                            <div className="admin-section-divider">{t('adminInfoSectionApp')}</div>
                                            <div className="admin-info-row"><span>{t('adminInfoVersion')}</span><strong>{adminInfo.app?.version || '—'}</strong></div>
                                            <div className="admin-info-row"><span>{t('adminInfoNodeVersion')}</span><strong>{adminInfo.app?.node_version || '—'}</strong></div>
                                            <div className="admin-info-row"><span>{t('adminInfoEnvironment')}</span><strong>{adminInfo.app?.environment || '—'}</strong></div>
                                            <div className="admin-info-row"><span>{t('adminInfoPlatform')}</span><strong>{`${adminInfo.app?.platform || '—'} / ${adminInfo.app?.arch || '—'}`}</strong></div>
                                            <div className="admin-info-row"><span>{t('adminInfoUptime')}</span><strong>{formatUptime(adminInfo.app?.uptime_seconds)}</strong></div>
                                            <div className="admin-info-row"><span>{t('adminInfoStartedAt')}</span><strong>{formatDateTime(adminInfo.app?.started_at)}</strong></div>
                                            <div className="admin-info-row"><span>{t('adminInfoGeneratedAt')}</span><strong>{formatDateTime(adminInfo.app?.generated_at)}</strong></div>
                                        </div>

                                        <div className="admin-info-card">
                                            <div className="admin-section-divider">{t('adminInfoSectionUsers')}</div>
                                            <div className="admin-info-row"><span>{t('adminInfoUsersTotal')}</span><strong>{adminInfo.counts?.users_total ?? 0}</strong></div>
                                            <div className="admin-info-row"><span>{t('adminInfoUsersAdmins')}</span><strong>{adminInfo.counts?.users_admins ?? 0}</strong></div>
                                            <div className="admin-info-row"><span>{t('adminInfoUsersSso')}</span><strong>{adminInfo.counts?.users_with_sso ?? 0}</strong></div>
                                            <div className="admin-info-row"><span>{t('adminInfoUsersEmail')}</span><strong>{adminInfo.counts?.users_with_email ?? 0}</strong></div>
                                        </div>

                                        <div className="admin-info-card">
                                            <div className="admin-section-divider">{t('adminInfoSectionGames')}</div>
                                            <div className="admin-info-row"><span>{t('adminInfoGamesTotal')}</span><strong>{adminInfo.counts?.games_total ?? 0}</strong></div>
                                            <div className="admin-info-row"><span>{t('adminInfoGamesProposed')}</span><strong>{adminInfo.counts?.games_proposed ?? 0}</strong></div>
                                            <div className="admin-info-row"><span>{t('adminInfoGamesVoting')}</span><strong>{adminInfo.counts?.games_voting ?? 0}</strong></div>
                                            <div className="admin-info-row"><span>{t('adminInfoGamesBacklog')}</span><strong>{adminInfo.counts?.games_backlog ?? 0}</strong></div>
                                            <div className="admin-info-row"><span>{t('adminInfoGamesPlaying')}</span><strong>{adminInfo.counts?.games_playing ?? 0}</strong></div>
                                            <div className="admin-info-row"><span>{t('adminInfoGamesCompleted')}</span><strong>{adminInfo.counts?.games_completed ?? 0}</strong></div>
                                        </div>

                                        <div className="admin-info-card">
                                            <div className="admin-section-divider">{t('adminInfoSectionActivity')}</div>
                                            <div className="admin-info-row"><span>{t('adminInfoRunsTotal')}</span><strong>{adminInfo.counts?.runs_total ?? 0}</strong></div>
                                            <div className="admin-info-row"><span>{t('adminInfoRatingsTotal')}</span><strong>{adminInfo.counts?.ratings_total ?? 0}</strong></div>
                                            <div className="admin-info-row"><span>{t('adminInfoMediaTotal')}</span><strong>{adminInfo.counts?.media_total ?? 0}</strong></div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'notifications' && (
                            <>
                                <div className="admin-settings-list">

                                    {/* ── Channel picker ──────────────────────────────── */}
                                    <div className="admin-setting-row admin-setting-row--text">
                                        <div className="admin-setting-info">
                                            <div className="admin-setting-label"><Bell size={13} /> {t('adminNotifyOnPropose')}</div>
                                            <div className="admin-setting-desc">{t('adminNotifyOnProposeDesc')}</div>
                                        </div>
                                        <div className="admin-channel-picker">
                                            {['off', 'smtp', 'discord', 'both'].map(opt => (
                                                <button
                                                    key={opt}
                                                    className={`admin-channel-btn ${(pending.notify_on_propose_channels || 'off') === opt ? 'active' : ''}`}
                                                    onClick={() => setText('notify_on_propose_channels', opt)}
                                                >
                                                    {t(`notifChannel_${opt}`)}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* ── SMTP accordion ──────────────────────────────── */}
                                    <div className="admin-accordion">
                                        <button
                                            className="admin-accordion-header"
                                            onClick={() => setSmtpOpen(o => !o)}
                                            aria-expanded={smtpOpen}
                                        >
                                            <span className="admin-accordion-title">
                                                <Mail size={14} />
                                                {t('adminSmtpSection')}
                                                {(pending.notify_on_propose_channels === 'smtp' || pending.notify_on_propose_channels === 'both') && <span className="admin-accordion-badge">{t('toggleOn')}</span>}
                                            </span>
                                            <ChevronDown size={14} className={`admin-accordion-arrow ${smtpOpen ? 'open' : ''}`} />
                                        </button>

                                        {smtpOpen && (
                                            <div className="admin-accordion-body">
                                                <div className="admin-setting-row admin-setting-row--text">
                                                    <div className="admin-setting-info">
                                                        <label className="admin-setting-label" htmlFor="smtp-host">{t('adminSmtpHost')}</label>
                                                    </div>
                                                    <input id="smtp-host" type="text" className="admin-text-input"
                                                        value={pending.smtp_host || ''}
                                                        placeholder="smtp.example.com"
                                                        onChange={e => setText('smtp_host', e.target.value)} />
                                                </div>

                                                <div className="admin-setting-row admin-setting-row--text">
                                                    <div className="admin-setting-info">
                                                        <label className="admin-setting-label" htmlFor="smtp-port">{t('adminSmtpPort')}</label>
                                                    </div>
                                                    <input id="smtp-port" type="number" className="admin-text-input admin-number-input"
                                                        value={pending.smtp_port || '587'}
                                                        onChange={e => setText('smtp_port', e.target.value)} />
                                                </div>

                                                <div className="admin-setting-row">
                                                    <div className="admin-setting-info">
                                                        <div className="admin-setting-label">{t('adminSmtpSecure')}</div>
                                                        <div className="admin-setting-desc">{t('adminSmtpSecureDesc')}</div>
                                                    </div>
                                                    <button
                                                        className={`toggle-btn ${pending.smtp_secure === 'true' ? 'on' : 'off'}`}
                                                        onClick={() => toggle('smtp_secure')}
                                                    >
                                                        {pending.smtp_secure === 'true' ? t('toggleOn') : t('toggleOff')}
                                                    </button>
                                                </div>

                                                <div className="admin-setting-row admin-setting-row--text">
                                                    <div className="admin-setting-info">
                                                        <label className="admin-setting-label" htmlFor="smtp-user">{t('adminSmtpUser')}</label>
                                                    </div>
                                                    <input id="smtp-user" type="text" className="admin-text-input"
                                                        value={pending.smtp_user || ''}
                                                        placeholder="user@example.com"
                                                        onChange={e => setText('smtp_user', e.target.value)} />
                                                </div>

                                                <div className="admin-setting-row admin-setting-row--text">
                                                    <div className="admin-setting-info">
                                                        <label className="admin-setting-label" htmlFor="smtp-pass">{t('adminSmtpPass')}</label>
                                                    </div>
                                                    <div className="password-field">
                                                        <input id="smtp-pass" type={showSmtpPassword ? 'text' : 'password'} className="admin-text-input"
                                                            value={pending.smtp_pass || ''}
                                                            placeholder="••••••••••••"
                                                            onChange={e => setText('smtp_pass', e.target.value)} />
                                                        <button
                                                            type="button"
                                                            className="password-toggle-btn"
                                                            onClick={() => setShowSmtpPassword(v => !v)}
                                                            aria-label={showSmtpPassword ? 'Hide password' : 'Show password'}
                                                        >
                                                            {showSmtpPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="admin-setting-row admin-setting-row--text">
                                                    <div className="admin-setting-info">
                                                        <label className="admin-setting-label" htmlFor="smtp-from">{t('adminSmtpFrom')}</label>
                                                        <div className="admin-setting-desc">{t('adminSmtpFromDesc')}</div>
                                                    </div>
                                                    <input id="smtp-from" type="email" className="admin-text-input"
                                                        value={pending.smtp_from || ''}
                                                        placeholder="noreply@example.com"
                                                        onChange={e => setText('smtp_from', e.target.value)} />
                                                </div>

                                                <div className="admin-setting-row admin-setting-row--text">
                                                    <div className="admin-setting-info">
                                                        <label className="admin-setting-label" htmlFor="smtp-to">{t('adminSmtpTo')}</label>
                                                        <div className="admin-setting-desc">{t('adminSmtpToDesc')}</div>
                                                    </div>
                                                    <input id="smtp-to" type="text" className="admin-text-input"
                                                        value={pending.smtp_to || ''}
                                                        placeholder="admin@example.com, other@example.com"
                                                        onChange={e => setText('smtp_to', e.target.value)} />
                                                </div>

                                                <div className="admin-setting-row admin-setting-row--text">
                                                    <div className="admin-setting-info">
                                                        <div className="admin-setting-label">{t('adminSmtpTest')}</div>
                                                        <div className="admin-setting-desc">{t('adminSmtpTestDesc')}</div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        className="btn btn-secondary btn-test-sso"
                                                        onClick={handleTestSmtp}
                                                        disabled={smtpTesting}
                                                    >
                                                        {smtpTesting ? <Loader2 size={14} className="spin" /> : <FlaskConical size={14} />}
                                                        {smtpTesting ? t('adminSsoTesting') : t('adminSsoTestBtn')}
                                                    </button>
                                                </div>
                                                {smtpTestResult && (
                                                    <div className={`provider-test-result ${smtpTestResult.ok ? 'ok' : 'fail'}`}>
                                                        {smtpTestResult.ok
                                                            ? <><CheckCircle size={13} /> {smtpTestResult.detail}</>  
                                                            : <><AlertCircle size={13} /> {smtpTestResult.detail}</>}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* ── Discord accordion ──────────────────────────── */}
                                    <div className="admin-accordion">
                                        <button
                                            className="admin-accordion-header"
                                            onClick={() => setDiscordOpen(o => !o)}
                                            aria-expanded={discordOpen}
                                        >
                                            <span className="admin-accordion-title">
                                                <MessageSquare size={14} />
                                                {t('adminDiscordSection')}
                                                {(pending.notify_on_propose_channels === 'discord' || pending.notify_on_propose_channels === 'both') && <span className="admin-accordion-badge">{t('toggleOn')}</span>}
                                            </span>
                                            <ChevronDown size={14} className={`admin-accordion-arrow ${discordOpen ? 'open' : ''}`} />
                                        </button>

                                        {discordOpen && (
                                            <div className="admin-accordion-body">
                                                <div className="admin-setting-row admin-setting-row--text">
                                                    <div className="admin-setting-info">
                                                        <label className="admin-setting-label" htmlFor="discord-webhook">{t('adminDiscordWebhook')}</label>
                                                        <div className="admin-setting-desc">{t('adminDiscordWebhookDesc')}</div>
                                                    </div>
                                                    <input id="discord-webhook" type="url" className="admin-text-input"
                                                        value={pending.discord_webhook_url || ''}
                                                        placeholder="https://discord.com/api/webhooks/..."
                                                        onChange={e => setText('discord_webhook_url', e.target.value)} />
                                                </div>

                                                <div className="admin-setting-row admin-setting-row--text">
                                                    <div className="admin-setting-info">
                                                        <label className="admin-setting-label" htmlFor="discord-lang">{t('adminDiscordLanguage')}</label>
                                                        <div className="admin-setting-desc">{t('adminDiscordLanguageDesc')}</div>
                                                    </div>
                                                    <select
                                                        id="discord-lang"
                                                        className="provider-type-select"
                                                        value={pending.discord_language || 'en'}
                                                        onChange={e => setText('discord_language', e.target.value)}
                                                    >
                                                        <option value="en">English</option>
                                                        <option value="it">Italiano</option>
                                                    </select>
                                                </div>

                                                <div className="admin-setting-row admin-setting-row--text">
                                                    <div className="admin-setting-info">
                                                        <div className="admin-setting-label">{t('adminDiscordTest')}</div>
                                                        <div className="admin-setting-desc">{t('adminDiscordTestDesc')}</div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        className="btn btn-secondary btn-test-sso"
                                                        onClick={handleTestDiscord}
                                                        disabled={discordTesting}
                                                    >
                                                        {discordTesting ? <Loader2 size={14} className="spin" /> : <FlaskConical size={14} />}
                                                        {discordTesting ? t('adminSsoTesting') : t('adminSsoTestBtn')}
                                                    </button>
                                                </div>
                                                {discordTestResult && (
                                                    <div className={`provider-test-result ${discordTestResult.ok ? 'ok' : 'fail'}`}>
                                                        {discordTestResult.ok
                                                            ? <><CheckCircle size={13} /> {discordTestResult.detail}</>
                                                            : <><AlertCircle size={13} /> {discordTestResult.detail}</>}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                </div>

                                <button
                                    className="btn btn-primary"
                                    onClick={handleSave}
                                    disabled={loading || !isDirty}
                                >
                                    <Save size={16} />
                                    {loading ? t('saving') : t('adminSaveBtn')}
                                </button>
                            </>
                        )}

                        {activeTab === 'users' && (
                            <div className="admin-tab-content admin-tab-content--users">
                                {loadingUsers && <p className="dashboard-wip-text">{t('loading')}</p>}
                                {errorUsers && <p className="text-red">{errorUsers}</p>}
                                {users && (
                                    <div className="admin-users-table-wrapper">
                                        <table className="admin-users-table">
                                            <thead>
                                                <tr>
                                                    <th>{t('adminUserColUsername')}</th>
                                                    <th>{t('adminUserColEmail')}</th>
                                                    <th>{t('adminUserColRole')}</th>
                                                    <th>{t('adminUserColJoined')}</th>
                                                    <th>{t('adminUserColSso')}</th>
                                                    <th>{t('adminUserColLocal')}</th>
                                                    <th>{t('adminUserColActions')}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {users.map(u => (
                                                    <tr key={u.id}>
                                                        <td>{u.username}</td>
                                                        <td>{u.email || '-'}</td>
                                                        <td>
                                                            <span className={`admin-user-badge role-${u.role}`}>
                                                                {u.role.toUpperCase()}
                                                            </span>
                                                        </td>
                                                        <td>{new Date(u.joined * 1000).toLocaleDateString()}</td>
                                                        <td>
                                                            {u.has_sso ? (
                                                                <CheckCircle size={14} className="text-primary" />
                                                            ) : (
                                                                <AlertCircle size={14} className="text-subtle" />
                                                            )}
                                                        </td>
                                                        <td>
                                                            {u.has_password ? (
                                                                <CheckCircle size={14} className="text-primary" />
                                                            ) : (
                                                                <AlertCircle size={14} className="text-subtle" />
                                                            )}
                                                        </td>
                                                        <td className="admin-user-actions">
                                                            <button
                                                                className="btn-link"
                                                                onClick={() => handleToggleRole(u.id, u.role)}
                                                            >
                                                                {u.role === 'admin' ? t('adminUserActionRemoveAdmin') : t('adminUserActionMakeAdmin')}
                                                            </button>
                                                            <button
                                                                className="btn-link text-red"
                                                                onClick={() => handleDeleteUser(u.id)}
                                                            >
                                                                {t('adminUserActionDelete')}
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                ) : (
                    <p className="dashboard-wip-text">{t('loading')}</p>
                )}
            </div>
        </div>
    );
}
