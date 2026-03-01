import { useState, useEffect } from 'react';
import { Search, X, Loader2, Gamepad2 } from 'lucide-react';

export default function ProposeGameModal({ token, onClose, onProposed, t }) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [manualMode, setManualMode] = useState(false);
    const [manualTitle, setManualTitle] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    // Debounced search
    useEffect(() => {
        if (query.trim().length < 2) { setResults([]); return; }
        const timer = setTimeout(async () => {
            setSearching(true);
            try {
                const res = await fetch(`/api/games/search?q=${encodeURIComponent(query.trim())}`, {
                    headers: { 'Authorization': `Bearer ${token}` },
                });
                const data = await res.json();
                setResults(data.results || []);
                if ((data.results || []).length === 0 && !data.provider) {
                    setManualMode(true);
                }
            } catch {
                setError(t('networkError'));
            } finally {
                setSearching(false);
            }
        }, 400);
        return () => clearTimeout(timer);
    }, [query, token, t]);

    const propose = async (gameData) => {
        setSubmitting(true);
        setError('');
        try {
            const res = await fetch('/api/games', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(gameData),
            });
            if (!res.ok) {
                const data = await res.json();
                setError(data.error || t('networkError'));
                return;
            }
            const game = await res.json();
            onProposed(game);
            onClose();
        } catch {
            setError(t('networkError'));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content modal-propose" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>{t('proposeGame')}</h2>
                    <button className="modal-close" onClick={onClose}><X size={20} /></button>
                </div>

                <div className="propose-search-bar">
                    <Search size={18} />
                    <input
                        type="text"
                        placeholder={t('searchGamesPlaceholder')}
                        value={query}
                        onChange={e => { setQuery(e.target.value); setManualMode(false); }}
                        autoFocus
                    />
                </div>

                {error && <div className="modal-error">{error}</div>}

                {submitting && (
                    <div className="propose-loading"><Loader2 size={24} className="spin" /> {t('loading') || 'Loading...'}</div>
                )}

                {searching && !submitting && (
                    <div className="propose-loading"><Loader2 size={24} className="spin" /> {t('searching')}</div>
                )}

                {!searching && !submitting && results.length > 0 && (
                    <div className="propose-results">
                        {results.map((r, i) => (
                            <div key={`${r.api_id}-${i}`} className="propose-result" onClick={() => propose(r)}>
                                {r.cover_url ? (
                                    <img src={r.cover_url} alt={r.title} className="propose-result-cover" />
                                ) : (
                                    <div className="propose-result-cover propose-result-cover--placeholder">
                                        <Gamepad2 size={20} />
                                    </div>
                                )}
                                <div className="propose-result-info">
                                    <strong>{r.title}</strong>
                                    {r.release_year && <span className="propose-result-year">{r.release_year}</span>}
                                    {r.platforms && <span className="propose-result-platforms">{r.platforms}</span>}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Manual entry fallback */}
                {!submitting && (
                    <div className="propose-manual">
                        {!manualMode ? (
                            <button className="btn-link" onClick={() => setManualMode(true)}>
                                {t('manualEntry')}
                            </button>
                        ) : (
                            <div className="propose-manual-form">
                                <p className="propose-manual-label">{t('manualEntryLabel')}</p>
                                <input
                                    type="text"
                                    placeholder={t('gameTitlePlaceholder')}
                                    value={manualTitle}
                                    onChange={e => setManualTitle(e.target.value)}
                                />
                                <button
                                    className="btn btn-primary btn-sm"
                                    onClick={() => propose({ title: manualTitle })}
                                    disabled={!manualTitle.trim() || submitting}
                                >
                                    {submitting ? t('loading') : t('proposeBtn')}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
