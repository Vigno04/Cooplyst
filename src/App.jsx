import { useState, useEffect } from 'react';
import { Gamepad2, LogIn, MonitorPlay, Globe, User, ChevronDown, Loader2 } from 'lucide-react';
import authentikLogo from './assets/authentik_pixellogo.png';
import { useTranslation } from 'react-i18next';
import { languages } from './i18n';
import ProfileScreen from './screens/ProfileScreen';
import AdminScreen from './screens/AdminScreen';
import './index.css';

// Decode JWT payload without verification (verification happens server-side)
function decodeToken(token) {
    try {
        return JSON.parse(atob(token.split('.')[1]));
    } catch {
        return null;
    }
}

const TOKEN_KEY = 'cooplyst_token';

function App() {
    const { t, i18n } = useTranslation();

    // Auth state
    const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
    const [currentUser, setCurrentUser] = useState(() => {
        const stored = localStorage.getItem(TOKEN_KEY);
        return stored ? decodeToken(stored) : null;
    });

    // Login/register form state
    const [showRegister, setShowRegister] = useState(false);
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [authError, setAuthError] = useState('');
    const [authLoading, setAuthLoading] = useState(false);

    // Public config (fetched from server)
    const [configLoaded, setConfigLoaded] = useState(false);
    const [registrationEnabled, setRegistrationEnabled] = useState(true);
    const [localAuthEnabled, setLocalAuthEnabled] = useState(true);
    const [authentikEnabled, setAuthentikEnabled] = useState(false);
    const [autoRedirect, setAutoRedirect] = useState(false);

    // UI state
    const [langDropdownOpen, setLangDropdownOpen] = useState(false);
    const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
    const [activePage, setActivePage] = useState(null); // null | 'profile' | 'admin'
    const [ssoLinkStatus, setSsoLinkStatus] = useState(null); // { type, msg } passed to ProfileScreen

    // Avatar state
    const [userAvatar, setUserAvatar] = useState(null);
    const [userAvatarPixelated, setUserAvatarPixelated] = useState(0);

    // ── Fetch public config ──────────────────────────────────────────────────
    const fetchConfig = () =>
        fetch('/api/auth/config')
            .then(r => r.json())
            .then(data => {
                setRegistrationEnabled(data.registration_enabled !== false);
                setLocalAuthEnabled(data.local_auth_enabled !== false);
                setAuthentikEnabled(!!data.authentik_enabled);
                setAutoRedirect(!!data.authentik_auto_redirect);
                setConfigLoaded(true);
            })
            .catch(() => { setConfigLoaded(true); });

    useEffect(() => { fetchConfig(); }, []);

    // Fetch avatar when logged in
    useEffect(() => {
        if (!token) return;
        fetch('/api/users/me', { headers: { 'Authorization': `Bearer ${token}` } })
            .then(r => r.json())
            .then(data => {
                setUserAvatar(data.avatar || null);
                setUserAvatarPixelated(data.avatar_pixelated || 0);
            })
            .catch(() => { });
    }, [token]);

    // ── Handle SSO token / error returned in URL hash ────────────────────────
    useEffect(() => {
        const hash = window.location.hash;
        if (hash.includes('sso_token=')) {
            const params = new URLSearchParams(hash.slice(1));
            const ssoToken = params.get('sso_token');
            if (ssoToken) {
                // Clear redirect lock so a future logout → auto-redirect works again
                sessionStorage.removeItem('cooplyst_sso_redirecting');
                localStorage.setItem(TOKEN_KEY, ssoToken);
                setToken(ssoToken);
                setCurrentUser(decodeToken(ssoToken));
                window.history.replaceState(null, '', window.location.pathname);
            }
        } else if (hash.includes('sso_error=')) {
            const params = new URLSearchParams(hash.slice(1));
            const errMsg = params.get('sso_error');
            // Clear the redirect lock so we show the SSO button fallback instead of looping
            sessionStorage.removeItem('cooplyst_sso_redirecting');
            setAuthError(errMsg ? `${t('ssoError')}: ${errMsg}` : t('ssoError'));
            window.history.replaceState(null, '', window.location.pathname);
        } else if (hash.includes('sso_linked=')) {
            setSsoLinkStatus({ type: 'success', msg: t('profileSsoLinkedSuccess') });
            setActivePage('profile');
            window.history.replaceState(null, '', window.location.pathname);
        } else if (hash.includes('sso_link_error=')) {
            const params = new URLSearchParams(hash.slice(1));
            const errMsg = params.get('sso_link_error');
            setSsoLinkStatus({ type: 'error', msg: errMsg || t('ssoError') });
            setActivePage('profile');
            window.history.replaceState(null, '', window.location.pathname);
        }
    }, [t]);

    // ── Auto-redirect to SSO if configured ──────────────────────────────────
    // Use sessionStorage so the lock survives the Authentik round-trip navigation.
    // This prevents an infinite redirect loop if Authentik returns an error.
    useEffect(() => {
        if (!configLoaded || token) return;
        if (autoRedirect && authentikEnabled && !sessionStorage.getItem('cooplyst_sso_redirecting')) {
            sessionStorage.setItem('cooplyst_sso_redirecting', '1');
            window.location.href = '/api/auth/oidc/login';
        }
    }, [autoRedirect, authentikEnabled, token, configLoaded]);

    // ── Close profile dropdown on outside click ──────────────────────────────
    useEffect(() => {
        if (!profileDropdownOpen) return;
        const close = () => setProfileDropdownOpen(false);
        document.addEventListener('click', close);
        return () => document.removeEventListener('click', close);
    }, [profileDropdownOpen]);

    const isLoggedIn = !!token && !!currentUser;
    const isAdmin = currentUser?.role === 'admin';

    // ── Auth handlers ────────────────────────────────────────────────────────

    const handleSsoLogin = () => {
        window.location.href = '/api/auth/oidc/login';
    };

    const handleAuth = async (e) => {
        e.preventDefault();
        setAuthError('');

        if (showRegister && password !== confirmPassword) {
            return setAuthError(t('passwordMismatch'));
        }

        const endpoint = showRegister ? '/api/auth/register' : '/api/auth/login';
        const body = showRegister
            ? { username, email, password }
            : { username, password };

        setAuthLoading(true);
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) return setAuthError(data.error || t('authError'));

            localStorage.setItem(TOKEN_KEY, data.token);
            setToken(data.token);
            setCurrentUser(decodeToken(data.token));
            // Explicitly clean up all UI state on login
            setUsername(''); setEmail(''); setPassword(''); setConfirmPassword('');
            setProfileDropdownOpen(false);
            setActivePage(null);
            setLangDropdownOpen(false);
        } catch {
            setAuthError(t('networkError'));
        } finally {
            setAuthLoading(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setCurrentUser(null);
        setActivePage(null);
        setProfileDropdownOpen(false);
        // Reset configLoaded BEFORE fetching so the auto-redirect effect is gated
        // until the fresh config arrives (prevents firing with stale autoRedirect value)
        setConfigLoaded(false);
        fetchConfig().then(() => {
            // Only clear the redirect lock after we have the up-to-date config,
            // so auto-redirect reflects the current saved setting
            sessionStorage.removeItem('cooplyst_sso_redirecting');
        });
    };

    const navigateTo = (page, e) => {
        e?.stopPropagation();
        setActivePage(page);
        setProfileDropdownOpen(false);
    };

    // ── Render ───────────────────────────────────────────────────────────────

    return (
        <div className="crtscreen">
            <div className="scanlines"></div>

            {/* ── LOGIN / REGISTER ─────────────────────────────────────────── */}
            {!isLoggedIn ? (
                <>
                    {/* Language Switcher */}
                    <div className="lang-switcher-container" onClick={() => setLangDropdownOpen(!langDropdownOpen)}>
                        <Globe size={16} className="lang-icon" />
                        <div className="lang-selected">{t('langLabel')}</div>
                        <ChevronDown size={14} className={`lang-arrow ${langDropdownOpen ? 'open' : ''}`} />
                        {langDropdownOpen && (
                            <div className="lang-dropdown">
                                {languages.map(({ code, translation }) => (
                                    <div
                                        key={code}
                                        className={`lang-option ${i18n.language === code ? 'active' : ''}`}
                                        onClick={() => i18n.changeLanguage(code)}
                                    >
                                        {translation.langLabel}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="container">
                        <header className="header">
                            <div className="logo-container">
                                <Gamepad2 className="logo-icon blue" size={40} />
                                <Gamepad2 className="logo-icon red" size={40} />
                                <h1 className="logo-text">
                                    <span className="text-blue">Coop</span><span className="text-red">Lyst</span>
                                </h1>
                            </div>
                        </header>

                        <main className="main-content">
                            <div className="login-box panel">

                                {/* ── Config not yet loaded: spinner ──────── */}
                                {!configLoaded && (
                                    <div className="sso-redirect-screen">
                                        <Loader2 size={32} className="spin sso-redirect-spinner" />
                                    </div>
                                )}

                                {/* ── Auto-redirect in progress or already attempted ── */}
                                {configLoaded && autoRedirect && authentikEnabled && (
                                    <div className="sso-redirect-screen">
                                        {!sessionStorage.getItem('cooplyst_sso_redirecting') ? (
                                            // Redirect hasn't fired yet (effect hasn't run)
                                            <Loader2 size={32} className="spin sso-redirect-spinner" />
                                        ) : (
                                            // Redirect was attempted — show fallback
                                            <>
                                                <p className="sso-redirect-msg">{t('ssoRedirectingMsg')}</p>
                                                {authError && (
                                                    <div className="auth-error sso-redirect-error">{authError}</div>
                                                )}
                                                <button
                                                    type="button"
                                                    className="btn btn-sso"
                                                    onClick={handleSsoLogin}
                                                >
                                                    <img src={authentikLogo} alt="Authentik" className="sso-logo" />
                                                    {t('ssoRedirectFallbackBtn')}
                                                </button>
                                            </>
                                        )}
                                    </div>
                                )}

                                {/* ── Normal login screen (no auto-redirect) ── */}
                                {configLoaded && !(autoRedirect && authentikEnabled) && (
                                    <>
                                        {/* SSO Button */}
                                        {authentikEnabled && (
                                            <>
                                                <button
                                                    type="button"
                                                    className="btn btn-sso"
                                                    onClick={handleSsoLogin}
                                                >
                                                    <img src={authentikLogo} alt="Authentik" className="sso-logo" />
                                                    {t('btnSsoLogin')}
                                                </button>
                                                {localAuthEnabled && (
                                                    <div className="sso-divider">{t('ssoLoginOr')}</div>
                                                )}
                                            </>
                                        )}

                                        {/* Local auth form */}
                                        {localAuthEnabled && (
                                            <>
                                                <h2 className="panel-title">{showRegister ? t('registerTitle') : t('loginTitle')}</h2>
                                                <form onSubmit={handleAuth} className="login-form">
                                                    <div className="input-group">
                                                        <label>{t('usernameLabel')}</label>
                                                        <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder={t('usernamePlaceholder')} required />
                                                    </div>

                                                    {showRegister && (
                                                        <div className="input-group">
                                                            <label>{t('emailLabel')}</label>
                                                            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t('emailPlaceholder')} />
                                                        </div>
                                                    )}

                                                    <div className="input-group">
                                                        <label>{t('passwordLabel')}</label>
                                                        <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
                                                    </div>

                                                    {showRegister && (
                                                        <div className="input-group">
                                                            <label>{t('confirmPasswordLabel')}</label>
                                                            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="••••••••" required />
                                                        </div>
                                                    )}

                                                    {authError && <div className="auth-error">{authError}</div>}

                                                    <button type="submit" className="btn btn-primary" disabled={authLoading}>
                                                        {showRegister ? <LogIn size={20} /> : <MonitorPlay size={20} />}
                                                        {authLoading ? t('loading') : showRegister ? t('btnRegister') : t('btnStartGame')}
                                                    </button>
                                                </form>
                                                <div className="login-footer">
                                                    {!showRegister && registrationEnabled && (
                                                        <p>{t('noAccount')}<a href="#" onClick={e => { e.preventDefault(); setShowRegister(true); setAuthError(''); }}>{t('linkRegister')}</a></p>
                                                    )}
                                                    {showRegister && (
                                                        <p>{t('haveAccount')}<a href="#" onClick={e => { e.preventDefault(); setShowRegister(false); setAuthError(''); }}>{t('linkLogin')}</a></p>
                                                    )}
                                                    {!registrationEnabled && !showRegister && (
                                                        <p className="auth-error" style={{ marginTop: '0.5rem' }}>{t('registrationDisabled')}</p>
                                                    )}
                                                </div>
                                            </>
                                        )}

                                        {/* SSO-only mode: show error if any */}
                                        {!localAuthEnabled && !authentikEnabled && (
                                            <p className="auth-error" style={{ textAlign: 'center', marginTop: '0.5rem' }}>{t('ssoOnlyNoProvider')}</p>
                                        )}

                                        {!localAuthEnabled && authError && (
                                            <div className="auth-error" style={{ marginTop: '0.75rem' }}>{authError}</div>
                                        )}
                                    </>
                                )}

                            </div>
                        </main>

                        <footer className="footer"><p>{t('footer')}</p></footer>
                    </div>
                </>
            ) : (
                /* ── DASHBOARD ─────────────────────────────────────────────── */
                <div className="dashboard-layout">
                    <header className="dashboard-header">
                        <div className="dashboard-logo-container">
                            <Gamepad2 className="logo-icon blue" size={32} />
                            <Gamepad2 className="logo-icon red" size={32} />
                            <h1 className="dashboard-logo-text">
                                <span className="text-blue">Coop</span><span className="text-red">Lyst</span>
                            </h1>
                        </div>

                        <nav className="dashboard-nav">
                            <a href="#" className="nav-link">Lorem</a>
                            <a href="#" className="nav-link">Ipsum</a>
                            <a href="#" className="nav-link">Dolor</a>
                            <a href="#" className="nav-link">Sit</a>
                            <a href="#" className="nav-link">Amet</a>
                        </nav>

                        <div
                            className="dashboard-profile"
                            onClick={(e) => { e.stopPropagation(); setProfileDropdownOpen(p => !p); }}
                            title={currentUser.username}
                        >
                            {userAvatar ? (
                                <img
                                    src={`/api/avatars/${userAvatarPixelated ? userAvatar.replace('.webp', '_pixel.webp') : userAvatar}?${Date.now()}`}
                                    alt="Avatar"
                                    className="dashboard-profile-avatar"
                                />
                            ) : (
                                <User className="dashboard-profile-icon" size={20} />
                            )}
                            {profileDropdownOpen && (
                                <div className="profile-dropdown" onClick={e => e.stopPropagation()}>
                                    <div className="profile-option" onClick={(e) => navigateTo('profile', e)}>⊞ {t('navProfile')}</div>
                                    {isAdmin && (
                                        <div className="profile-option" onClick={(e) => navigateTo('admin', e)}>⚙ {t('navAdmin')}</div>
                                    )}
                                    <div className="profile-option profile-option--logout" onClick={(e) => { e.stopPropagation(); handleLogout(); }}>⏻ {t('navLogout')}</div>
                                </div>
                            )}
                        </div>
                    </header>

                    <main className="dashboard-main">
                        {activePage === 'profile' && (
                            <ProfileScreen
                                currentUser={currentUser}
                                token={token}
                                ssoLinkStatus={ssoLinkStatus}
                                onClose={() => { setActivePage(null); setSsoLinkStatus(null); }}
                                onUserUpdated={(updated) => {
                                    setCurrentUser(prev => ({ ...prev, ...updated }));
                                    if (updated.avatar !== undefined) setUserAvatar(updated.avatar);
                                    if (updated.avatar_pixelated !== undefined) setUserAvatarPixelated(updated.avatar_pixelated);
                                }}
                            />
                        )}
                        {activePage === 'admin' && isAdmin && (
                            <AdminScreen token={token} onClose={() => setActivePage(null)} />
                        )}
                    </main>

                    <footer className="dashboard-footer">
                        <a href="#" className="footer-link">Lorem</a>
                        <a href="#" className="footer-link">Ipsum</a>
                        <a href="#" className="footer-link">Dolor</a>
                        <a href="#" className="footer-link">Sit</a>
                        <a href="#" className="footer-link">Amet</a>
                    </footer>
                </div>
            )}
        </div>
    );
}

export default App;
