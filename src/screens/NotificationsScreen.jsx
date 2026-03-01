import { useState, useEffect } from 'react';
import { X, CheckCircle, Bell, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function NotificationsScreen({ token, onClose }) {
    const { t } = useTranslation();
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        fetch('/api/users/me/notifications', {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => {
                setNotifications(data);
                setLoading(false);
            })
            .catch(err => {
                console.error('Failed to fetch notifications', err);
                setLoading(false);
            });
    }, [token]);

    const handleNotificationClick = (gameId) => {
        // Dispatch an event so DashboardScreen can pick it up
        window.dispatchEvent(new CustomEvent('cooplyst:open_game', { detail: { gameId } }));
        onClose();
    };

    return (
        <div className="notifications-dropdown" onClick={e => e.stopPropagation()}>
            <div className="notifications-dropdown-header">
                <h3><Bell size={16} /> {t('navNotifications')}</h3>
                <button className="notifications-dropdown-close" onClick={onClose}><X size={16} /></button>
            </div>

            {loading ? (
                <div className="notification-empty">
                    <Loader2 className="spin" size={24} />
                    <span>{t('loading') || 'Loading...'}</span>
                </div>
            ) : notifications.length === 0 ? (
                <div className="notification-empty">
                    <CheckCircle size={32} style={{ color: 'var(--text-green)' }} />
                    <span>{t('noNewNotifications')}</span>
                </div>
            ) : (
                <div className="notifications-list">
                    {notifications.map(n => (
                        <div
                            key={n.run_id}
                            className="notification-item"
                            onClick={() => handleNotificationClick(n.game_id)}
                        >
                            <h4 className="notification-item-title">{n.game_title}</h4>
                            <p className="notification-item-text">
                                {t('rateYourRun', { run: n.run_name || 'Run', game: n.game_title }).replace('{run}', n.run_name || 'Run').replace('{game}', n.game_title)}
                            </p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
