import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, AlertCircle, CheckCircle, Save, X, ShieldCheck, ChevronDown, BookOpen, FlaskConical, Loader2 } from 'lucide-react';

export default function AdminScreen({ token, onClose }) {
    const { t } = useTranslation();
    const [savedSettings, setSavedSettings] = useState(null);
    const [pending, setPending] = useState(null);
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(false);

    // Tab state
    const [activeTab, setActiveTab] = useState('general'); // 'general' | 'info' | 'users'

    // Accordion state
    const [ssoOpen, setSsoOpen] = useState(false);
    const [tutorialOpen, setTutorialOpen] = useState(false);
    const [ssoTestResult, setSsoTestResult] = useState(null);  // null | { ok, steps }
    const [ssoTesting, setSsoTesting] = useState(false);

    // Users state
    const [users, setUsers] = useState(null);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [errorUsers, setErrorUsers] = useState(null);

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

    const handleTestSso = async () => {
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
        setLoading(true);
        setStatus(null);
        try {
            const res = await fetch('/api/admin/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(pending),
            });
            const data = await res.json();
            if (!res.ok) return setStatus({ type: 'error', msg: data.error });
            setSavedSettings(data);
            setPending(data);
            setStatus({ type: 'success', msg: t('adminSettingsSaved') });
        } catch {
            setStatus({ type: 'error', msg: t('networkError') });
        } finally {
            setLoading(false);
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
                                                            <input
                                                                id="sso-client-secret"
                                                                type="password"
                                                                className="admin-text-input"
                                                                value={pending.authentik_client_secret || ''}
                                                                placeholder="••••••••••••"
                                                                onChange={e => setText('authentik_client_secret', e.target.value)}
                                                            />
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

                        {activeTab === 'info' && (
                            <div className="admin-tab-content">
                                <p className="dashboard-wip-text">{t('adminInfoPlaceholder')}</p>
                            </div>
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
                                                        <td>{new Date(u.joined).toLocaleDateString()}</td>
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
