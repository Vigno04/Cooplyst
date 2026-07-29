import React, { useState } from 'react';
import { LogIn, MonitorPlay, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import authentikLogo from '../assets/authentik_pixellogo.png';
import cooplystLogo from '../assets/cooplyst-icon.png';

export default function LoginScreen({
    showRegister,
    setShowRegister,
    username,
    setUsername,
    email,
    setEmail,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    authError,
    setAuthError,
    authLoading,
    handleAuth,
    handleSsoLogin,
    configLoaded,
    autoRedirect,
    authentikEnabled,
    localAuthEnabled,
    registrationEnabled
}) {
    const { t } = useTranslation();
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    return (
        <div className="container">
            <header className="header">
                <div className="logo-container" style={{ cursor: 'pointer' }} onClick={() => window.location.href = '/'}>
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
    );
}
