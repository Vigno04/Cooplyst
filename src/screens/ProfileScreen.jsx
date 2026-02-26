import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Save, Lock, User, Mail, AlertCircle, CheckCircle, X, ShieldCheck, ShieldOff, Loader2, Upload, Trash2 } from 'lucide-react';

export default function ProfileScreen({ currentUser, token, onUserUpdated, onClose, ssoLinkStatus }) {
    const { t } = useTranslation();
    const [username, setUsername] = useState(currentUser.username);
    const [email, setEmail] = useState(currentUser.email || '');
    const [currentPassword, setCurrentPw] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPw] = useState('');
    const [status, setStatus] = useState(ssoLinkStatus || null); // { type: 'success'|'error', msg }
    const [loading, setLoading] = useState(false);

    // SSO linking state
    const [hasSso, setHasSso] = useState(null);       // null = loading
    const [hasPassword, setHasPassword] = useState(true);
    const [ssoLoading, setSsoLoading] = useState(false);

    // Avatar state
    const [avatar, setAvatar] = useState(null);
    const [avatarPixelated, setAvatarPixelated] = useState(0);
    const [avatarUploading, setAvatarUploading] = useState(false);
    const fileInputRef = useRef(null);

    // Fetch current SSO status from server (not in JWT)
    useEffect(() => {
        fetch('/api/users/me', { headers: { 'Authorization': `Bearer ${token}` } })
            .then(r => r.json())
            .then(data => {
                setHasSso(!!data.has_sso);
                setHasPassword(!!data.has_password);
                setAvatar(data.avatar || null);
                setAvatarPixelated(data.avatar_pixelated || 0);
            })
            .catch(() => setHasSso(false));
    }, [token]);

    // Show incoming SSO link status from redirect
    useEffect(() => {
        if (ssoLinkStatus) {
            setStatus(ssoLinkStatus);
            if (ssoLinkStatus.type === 'success') setHasSso(true);
        }
    }, [ssoLinkStatus]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setStatus(null);

        if (newPassword && newPassword !== confirmPassword) {
            return setStatus({ type: 'error', msg: t('profilePasswordMismatch') });
        }

        const body = {};
        if (username !== currentUser.username) body.username = username;
        if (email !== (currentUser.email || '')) body.email = email;
        if (newPassword) { body.currentPassword = currentPassword; body.newPassword = newPassword; }

        if (Object.keys(body).length === 0) {
            return setStatus({ type: 'error', msg: t('profileNoChanges') });
        }

        setLoading(true);
        try {
            const res = await fetch('/api/users/me', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) return setStatus({ type: 'error', msg: data.error });
            setStatus({ type: 'success', msg: t('profileSaved') });
            setCurrentPw(''); setNewPassword(''); setConfirmPw('');
            if (data.has_password !== undefined) setHasPassword(data.has_password);
            onUserUpdated(data);
        } catch {
            setStatus({ type: 'error', msg: t('networkError') });
        } finally {
            setLoading(false);
        }
    };

    const handleLinkSso = () => {
        // Redirect browser to /api/auth/oidc/link — server reads the Authorization header.
        // Since we can't set headers on a browser redirect, we pass the token as a query param
        // on a small trampoline endpoint. Instead, we open a fetch-redirected link in a same-tab navigation,
        // using a lightweight token-in-URL approach that the server reads from the query string.
        window.location.href = `/api/auth/oidc/link?t=${encodeURIComponent(token)}`;
    };

    const handleUnlinkSso = async () => {
        if (!window.confirm(t('profileSsoUnlinkConfirm'))) return;
        setSsoLoading(true);
        setStatus(null);
        try {
            const res = await fetch('/api/users/me/oidc', {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` },
            });
            const data = await res.json();
            if (!res.ok) return setStatus({ type: 'error', msg: data.error });
            setHasSso(false);
            setStatus({ type: 'success', msg: t('profileSsoUnlinked') });
        } catch {
            setStatus({ type: 'error', msg: t('networkError') });
        } finally {
            setSsoLoading(false);
        }
    };

    const handleAvatarUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setAvatarUploading(true);
        const formData = new FormData();
        formData.append('avatar', file);
        try {
            const res = await fetch('/api/users/me/avatar', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData,
            });
            const data = await res.json();
            if (res.ok) {
                setAvatar(data.avatar);
                setAvatarPixelated(data.avatar_pixelated);
                onUserUpdated({ avatar: data.avatar, avatar_pixelated: data.avatar_pixelated });
            } else {
                setStatus({ type: 'error', msg: data.error });
            }
        } catch {
            setStatus({ type: 'error', msg: t('networkError') });
        } finally {
            setAvatarUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleTogglePixelate = async () => {
        const newVal = avatarPixelated ? 0 : 1;
        try {
            const res = await fetch('/api/users/me/avatar/pixelate', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ pixelated: !!newVal }),
            });
            if (res.ok) {
                setAvatarPixelated(newVal);
                onUserUpdated({ avatar_pixelated: newVal });
            }
        } catch {
            setStatus({ type: 'error', msg: t('networkError') });
        }
    };

    const handleRemoveAvatar = async () => {
        try {
            const res = await fetch('/api/users/me/avatar', {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (res.ok) {
                setAvatar(null);
                onUserUpdated({ avatar: null });
            }
        } catch {
            setStatus({ type: 'error', msg: t('networkError') });
        }
    };

    const avatarUrl = avatar
        ? `/api/avatars/${avatarPixelated ? avatar.replace('.webp', '_pixel.webp') : avatar}?${Date.now()}`
        : null;

    return (
        <div className="dashboard-wip" onClick={onClose}>
            <div className="screen-box" onClick={e => e.stopPropagation()}>
                <div className="screen-box-header">
                    <div className="screen-box-title text-blue">
                        <User size={18} /> {t('navProfile')}
                    </div>
                    <button className="screen-close-btn" onClick={onClose} aria-label="Close">
                        <X size={18} />
                    </button>
                </div>

                {status && (
                    <div className={`screen-alert ${status.type}`}>
                        {status.type === 'error'
                            ? <AlertCircle size={14} />
                            : <CheckCircle size={14} />}
                        {status.msg}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="screen-form">
                    {/* ── Avatar section ──────────────────────────────── */}
                    <div className="screen-divider">{t('profileAvatar')}</div>
                    <div className="profile-avatar-section">
                        <div className="profile-avatar-preview">
                            {avatarUrl ? (
                                <img src={avatarUrl} alt="Avatar" className="profile-avatar-img" />
                            ) : (
                                <User size={48} className="profile-avatar-placeholder" />
                            )}
                        </div>
                        <div className="profile-avatar-actions">
                            <input
                                type="file"
                                accept="image/*"
                                ref={fileInputRef}
                                onChange={handleAvatarUpload}
                                style={{ display: 'none' }}
                            />
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={avatarUploading}
                            >
                                <Upload size={14} />
                                {avatarUploading ? t('loading') : t('profileAvatarUpload')}
                            </button>
                            {avatar && (
                                <>
                                    <button
                                        type="button"
                                        className={`btn btn-secondary btn-sm ${avatarPixelated ? 'btn-active' : ''}`}
                                        onClick={handleTogglePixelate}
                                    >
                                        {t('profileAvatarPixelate')}
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-secondary btn-sm text-red"
                                        onClick={handleRemoveAvatar}
                                    >
                                        <Trash2 size={14} />
                                        {t('profileAvatarRemove')}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="screen-divider">{t('usernameLabel')}</div>
                    <div className="input-group">
                        <label><User size={12} /> {t('usernameLabel')}</label>
                        <input value={username} onChange={e => setUsername(e.target.value)} type="text" required />
                    </div>
                    <div className="input-group">
                        <label><Mail size={12} /> {t('emailLabel')}</label>
                        <input value={email} onChange={e => setEmail(e.target.value)} type="email" />
                    </div>

                    <div className="screen-divider">{t('profileChangePassword')}</div>

                    <div className="input-group">
                        <label><Lock size={12} /> {t('currentPasswordLabel')}</label>
                        <input value={currentPassword} onChange={e => setCurrentPw(e.target.value)} type="password" placeholder="••••••••" />
                    </div>
                    <div className="input-group">
                        <label><Lock size={12} /> {t('newPasswordLabel')}</label>
                        <input value={newPassword} onChange={e => setNewPassword(e.target.value)} type="password" placeholder="••••••••" />
                    </div>
                    <div className="input-group">
                        <label><Lock size={12} /> {t('confirmPasswordLabel')}</label>
                        <input value={confirmPassword} onChange={e => setConfirmPw(e.target.value)} type="password" placeholder="••••••••" />
                    </div>

                    <button type="submit" className="btn btn-primary" disabled={loading}>
                        <Save size={16} />
                        {loading ? t('saving') : t('profileSaveBtn')}
                    </button>
                </form>

                {/* ── SSO linking section ──────────────────────────────────── */}
                <div className="screen-divider">{t('profileSsoSection')}</div>
                <div className="profile-sso-row">
                    <div className="profile-sso-status">
                        {hasSso === null
                            ? <Loader2 size={14} className="spin" />
                            : hasSso
                                ? <><CheckCircle size={14} className="sso-icon-ok" /> {t('profileSsoLinked')}</>
                                : <><ShieldOff size={14} className="sso-icon-none" /> {t('profileSsoNotLinked')}</>
                        }
                    </div>
                    {hasSso === false && (
                        <button
                            type="button"
                            className="btn btn-secondary profile-sso-btn"
                            onClick={handleLinkSso}
                            disabled={ssoLoading}
                        >
                            <ShieldCheck size={14} />
                            {t('profileSsoLinkBtn')}
                        </button>
                    )}
                    {hasSso === true && (
                        <button
                            type="button"
                            className="btn profile-sso-btn profile-sso-unlink"
                            onClick={handleUnlinkSso}
                            disabled={ssoLoading || !hasPassword}
                            title={!hasPassword ? t('profileSsoUnlinkDisabled') : ''}
                        >
                            {ssoLoading ? <Loader2 size={14} className="spin" /> : <ShieldOff size={14} />}
                            {t('profileSsoUnlinkBtn')}
                        </button>
                    )}
                </div>
                {hasSso === true && !hasPassword && (
                    <p className="profile-sso-warn">{t('profileSsoUnlinkDisabled')}</p>
                )}
            </div>
        </div>
    );
}
