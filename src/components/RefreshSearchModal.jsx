import { useState, useEffect } from 'react';
import { Search, X, Loader2, Gamepad2, Eye } from 'lucide-react';
import GameDetailModal from './GameDetailModal';

export default function RefreshSearchModal({ token, initialQuery, onClose, onSelect, t }) {
    const [query, setQuery] = useState(initialQuery || '');
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [error, setError] = useState('');
    const [previewGame, setPreviewGame] = useState(null);

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
            } catch {
                setError(t('networkError'));
            } finally {
                setSearching(false);
            }
        }, 400);
        return () => clearTimeout(timer);
    }, [query, token, t]);

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1000 }}>
            <div className="modal-content modal-propose" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>{t('searchGamesPlaceholder') || 'Search Game'}</h2>
                    <div className="modal-header-actions">
                        <button className="modal-close" onClick={onClose}><X size={20} /></button>
                    </div>
                </div>

                <div className="propose-search-bar">
                    <Search size={18} />
                    <input
                        type="text"
                        placeholder={t('searchGamesPlaceholder')}
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        autoFocus
                    />
                </div>

                {error && (
                    <div className="modal-error">
                        {error}
                    </div>
                )}

                {searching && (
                    <div className="propose-loading"><Loader2 size={24} className="spin" /> {t('searching')}</div>
                )}

                {!searching && results.length > 0 && (
                    <div className="propose-results">
                        {results.map((r, i) => (
                            <div
                                key={`${r.api_id}-${i}`}
                                className={`propose-result ${r.local_status ? (r.local_status === 'completed' ? 'propose-result--completed' : 'propose-result--active') : ''}`}
                                onClick={() => onSelect(r)}
                            >
                                {r.cover_url ? (
                                    <img src={r.cover_url} alt={r.title} className="propose-result-cover" />
                                ) : (
                                    <div className="propose-result-cover propose-result-cover--placeholder">
                                        <Gamepad2 size={20} />
                                    </div>
                                )}
                                <div className="propose-result-info">
                                    <strong>
                                        {r.title}
                                        {r.local_status && (
                                            <span className="propose-result-status-badge">
                                                {t(r.local_status) || r.local_status}
                                            </span>
                                        )}
                                    </strong>
                                    {r.release_year && <span className="propose-result-year">{r.release_year}</span>}
                                    {r.platforms && <span className="propose-result-platforms">{r.platforms}</span>}
                                </div>
                                <button
                                    className="btn-icon propose-preview-btn"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setPreviewGame(r);
                                    }}
                                    title={t('previewGame') || 'Preview'}
                                    aria-label="Preview"
                                >
                                    <Eye size={20} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {!searching && query.trim().length >= 2 && results.length === 0 && (
                    <div className="propose-loading">No results found.</div>
                )}
            </div>

            {previewGame && (
                <GameDetailModal 
                    game={{...previewGame, status: 'proposed'}} 
                    isPreview={true} 
                    onClose={() => setPreviewGame(null)} 
                    onPropose={(game) => { onSelect(game); setPreviewGame(null); }}
                    t={t} 
                />
            )}
        </div>
    );
}
