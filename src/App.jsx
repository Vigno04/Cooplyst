import { useState, useEffect } from 'react';
import { Gamepad2, LogIn, MonitorPlay, Globe, User, Loader2, Eye, EyeOff, Bell, LogOut } from 'lucide-react';
import authentikLogo from './assets/authentik_pixellogo.png';
import cooplystLogo from './assets/cooplyst-icon.png';
import { useTranslation } from 'react-i18next';
import { languages } from './i18n';
import ProfileScreen from './screens/ProfileScreen';
import AdminScreen from './screens/AdminScreen';
import DashboardScreen from './screens/DashboardScreen';
import NotificationsScreen from './screens/NotificationsScreen';
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
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [authError, setAuthError] = useState('');
    const [authLoading, setAuthLoading] = useState(false);

    // Public config (fetched from server)
    const [configLoaded, setConfigLoaded] = useState(false);
    const [registrationEnabled, setRegistrationEnabled] = useState(true);
    const [localAuthEnabled, setLocalAuthEnabled] = useState(true);
    const [authentikEnabled, setAuthentikEnabled] = useState(false);
    const [autoRedirect, setAutoRedirect] = useState(false);

    // UI state
    const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
    const [notificationsDropdownOpen, setNotificationsDropdownOpen] = useState(false);
    const [activePage, setActivePage] = useState(null); // null | 'profile' | 'admin'
    const [ssoLinkStatus, setSsoLinkStatus] = useState(null); // { type, msg } passed to ProfileScreen

    // Notification state
    const [notificationCount, setNotificationCount] = useState(0);

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
                // Expose public config globally for other modules (e.g. upload helpers)
                try { window.COOPLYST_CONFIG = data; } catch (e) { /* ignore */ }
                setConfigLoaded(true);
            })
            .catch(() => { setConfigLoaded(true); });

    // Global fetch interceptor for 401 Unauthorized
    useEffect(() => {
        const originalFetch = window.fetch;
        window.fetch = async (...args) => {
            const response = await originalFetch(...args);
            if (response.status === 401) {
                const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
                // Ignore public / auth endpoints
                if (!url.includes('/api/auth/login') && !url.includes('/api/auth/register') && !url.includes('/api/auth/config')) {
                    window.dispatchEvent(new Event('cooplyst:unauthorized'));
                }
            }
            return response;
        };
        return () => {
            window.fetch = originalFetch;
        };
    }, []);

    // Global unauthorized handler
    useEffect(() => {
        const handleUnauthorized = () => {
            if (localStorage.getItem(TOKEN_KEY)) {
                localStorage.removeItem(TOKEN_KEY);
                setToken(null);
                setCurrentUser(null);
                setActivePage(null);
                setProfileDropdownOpen(false);
                setConfigLoaded(false);
                fetchConfig().then(() => {
                    sessionStorage.removeItem('cooplyst_sso_redirecting');
                });
                setAuthError(t('sessionExpired') || 'Session expired');
            }
        };
        window.addEventListener('cooplyst:unauthorized', handleUnauthorized);
        return () => window.removeEventListener('cooplyst:unauthorized', handleUnauthorized);
    }, [t]);

    useEffect(() => { fetchConfig(); }, []);

    // Fetch avatar when logged in
    useEffect(() => {
        if (!token) return;
        fetch('/api/users/me', { headers: { 'Authorization': `Bearer ${token}` } })
            .then(r => r.json())
            .then(data => {
                setCurrentUser(prev => ({ ...prev, ...data }));
                setUserAvatar(data.avatar || null);
                setUserAvatarPixelated(data.avatar_pixelated || 0);
                // Apply user's saved language immediately across the app
                try {
                    if (data.language) i18n.changeLanguage(data.language);
                } catch (e) { /* ignore */ }
            })
            .catch(() => { });

        // Fetch initial notification count
        fetch('/api/users/me/notifications', { headers: { 'Authorization': `Bearer ${token}` } })
            .then(r => r.json())
            .then(data => {
                if (Array.isArray(data)) {
                    setNotificationCount(data.length);
                }
            })
            .catch(() => { });

        // Listen for open_game event to update notification count automatically
        const handleOpenGame = () => {
            fetch('/api/users/me/notifications', { headers: { 'Authorization': `Bearer ${token}` } })
                .then(r => r.json())
                .then(data => setNotificationCount(Array.isArray(data) ? data.length : 0))
                .catch(() => { });
        };
        window.addEventListener('cooplyst:open_game', handleOpenGame);
        window.addEventListener('cooplyst:rating_submitted', handleOpenGame);
        return () => {
            window.removeEventListener('cooplyst:open_game', handleOpenGame);
            window.removeEventListener('cooplyst:rating_submitted', handleOpenGame);
        };
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

        const toAuthMessage = (value) => {
            const message = typeof value === 'string' ? value.trim() : '';
            return message || t('authError');
        };

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
            const data = await res.json().catch(() => ({}));
            if (!res.ok) return setAuthError(toAuthMessage(data?.error));

            localStorage.setItem(TOKEN_KEY, data.token);
            setToken(data.token);
            setCurrentUser(decodeToken(data.token));
            // Explicitly clean up all UI state on login
            setUsername(''); setEmail(''); setPassword(''); setConfirmPassword('');
            setProfileDropdownOpen(false);
            setActivePage(null);
            // language will be applied when we fetch /api/users/me below
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


                    <div className="container">
                        <header className="header">
                            <div className="logo-container">
                                <img src={cooplystLogo} alt="CoopLyst" className="logo-img" />
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
                                                        <div className="password-field">
                                                            <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
                                                            <button
                                                                type="button"
                                                                className="password-toggle-btn"
                                                                onClick={() => setShowPassword(v => !v)}
                                                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                                                            >
                                                                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {showRegister && (
                                                        <div className="input-group">
                                                            <label>{t('confirmPasswordLabel')}</label>
                                                            <div className="password-field">
                                                                <input type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="••••••••" required />
                                                                <button
                                                                    type="button"
                                                                    className="password-toggle-btn"
                                                                    onClick={() => setShowConfirmPassword(v => !v)}
                                                                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                                                                >
                                                                    {showConfirmPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                                                                </button>
                                                            </div>
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
                            <img src={cooplystLogo} alt="CoopLyst" className="dashboard-logo-img" />
                            <h1 className="dashboard-logo-text">
                                <span className="text-blue">Coop</span><span className="text-red">Lyst</span>
                            </h1>
                        </div>

                        <nav className="dashboard-nav">
                        </nav>

                        <div
                            className="dashboard-profile"
                            onClick={(e) => { e.stopPropagation(); setProfileDropdownOpen(p => !p); setNotificationsDropdownOpen(false); }}
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
                            {notificationCount > 0 && (
                                <span className="notification-badge" style={{
                                    position: 'absolute',
                                    bottom: '-4px',
                                    right: '-4px',
                                    backgroundColor: 'var(--text-red)',
                                    color: 'white',
                                    fontSize: '0.7rem',
                                    fontWeight: 'bold',
                                    padding: '2px 6px',
                                    borderRadius: '10px',
                                    border: '2px solid var(--panel-bg)',
                                }}>
                                    {notificationCount}
                                </span>
                            )}
                            {profileDropdownOpen && (
                                <div className="profile-dropdown" onClick={e => e.stopPropagation()}>
                                    <div className="profile-option" onClick={(e) => { e.stopPropagation(); setNotificationsDropdownOpen(true); setProfileDropdownOpen(false); }}>
                                        <Bell size={14} style={{ display: 'inline', marginRight: '6px' }} /> {t('navNotifications')} {notificationCount > 0 && `(${notificationCount})`}
                                    </div>
                                    <div className="profile-option" onClick={(e) => navigateTo('profile', e)}>⊞ {t('navProfile')}</div>
                                    {isAdmin && (
                                        <div className="profile-option" onClick={(e) => navigateTo('admin', e)}>⚙ {t('navAdmin')}</div>
                                    )}
                                    <div className="profile-option profile-option--logout" onClick={(e) => { e.stopPropagation(); handleLogout(); }}><LogOut size={14} style={{ display: 'inline', marginRight: '6px' }} /> {t('navLogout')}</div>
                                </div>
                            )}
                            {notificationsDropdownOpen && (
                                <NotificationsScreen token={token} onClose={() => setNotificationsDropdownOpen(false)} />
                            )}
                        </div>
                    </header>

                    <main className="dashboard-main">
                        {activePage === 'profile' && (
                            <ProfileScreen
                                currentUser={currentUser}
                                token={token}
                                ssoLinkStatus={ssoLinkStatus}
                                ssoEnabled={authentikEnabled}
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
                        {!activePage && (
                            <DashboardScreen token={token} currentUser={currentUser} />
                        )}
                    </main>

                    <footer className="dashboard-footer">
                        <p className="footer-text">{t('footer')}</p>
                    </footer>
                </div>
            )}
        </div>
    );
}

export default App;
