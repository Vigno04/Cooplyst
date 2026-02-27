import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, ThumbsUp, ThumbsDown, Gamepad2, Trophy, Clock, Play, CheckCircle, ChevronRight, X, Star, Upload, Trash2, Loader2, Image as ImageIcon, AlertCircle, Users, UserPlus, UserMinus, RotateCcw, ExternalLink, Tag, MoreVertical, RefreshCcw, Edit3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// ── Sub-components ──────────────────────────────────────────────────────────

function StatusBadge({ status, t }) {
    const map = {
        proposed: { cls: 'badge-proposed', label: t('statusProposed') },
        voting: { cls: 'badge-voting', label: t('statusVoting') },
        backlog: { cls: 'badge-backlog', label: t('statusBacklog') },
        playing: { cls: 'badge-playing', label: t('statusPlaying') },
        completed: { cls: 'badge-completed', label: t('statusCompleted') },
    };
    const info = map[status] || map.proposed;
    return <span className={`game-badge ${info.cls}`}>{info.label}</span>;
}

function GameCard({ game, onClick, t }) {
    return (
        <div className="game-card" onClick={() => onClick(game)}>
            {game.cover_url ? (
                <img src={game.cover_url} alt={game.title} className="game-card-cover" loading="lazy" />
            ) : (
                <div className="game-card-cover game-card-cover--placeholder">
                    <Gamepad2 size={40} />
                </div>
            )}
            <div className="game-card-body">
                <h3 className="game-card-title">{game.title}</h3>
                {game.genre && <p className="game-card-genre">{game.genre}</p>}
                <div className="game-card-footer">
                    <StatusBadge status={game.status} t={t} />
                    <span className="game-card-votes">
                        <ThumbsUp size={13} /> {game.votes_yes}
                        <ThumbsDown size={13} style={{ marginLeft: 6 }} /> {game.votes_no}
                    </span>
                </div>
            </div>
        </div>
    );
}

// ── ProposeGameModal ────────────────────────────────────────────────────────

function ProposeGameModal({ token, onClose, onProposed, t }) {
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

                {searching && (
                    <div className="propose-loading"><Loader2 size={24} className="spin" /> {t('searching')}</div>
                )}

                {!searching && results.length > 0 && (
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
            </div>
        </div>
    );
}

function AdminMetadataEditor({ open, game, token, onClose, onSaved, t }) {
    const [tab, setTab] = useState('metadata');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [form, setForm] = useState(null);

    useEffect(() => {
        if (!open || !game) return;
        setTab('metadata');
        setError('');
        setForm({
            title: game.title || '',
            description: game.description || '',
            developer: game.developer || '',
            genre: game.genre || '',
            platforms: game.platforms || '',
            tags: game.tags || '',
            release_year: game.release_year ?? '',
            release_date: game.release_date || '',
            age_rating: game.age_rating || '',
            time_to_beat: game.time_to_beat || '',
            player_counts: game.player_counts || '',
            coop: game.coop || '',
            online_offline: game.online_offline || '',
            website: game.website || '',
            cover_url: game.cover_url || '',
            thumbnail_url: game.thumbnail_url || '',
            logo_url: game.logo_url || '',
            backdrop_url: game.backdrop_url || '',
        });
    }, [open, game]);

    if (!open || !form || !game) return null;

    const providerPayload = game.provider_payload || {};
    const imageFieldMap = {
        poster: 'cover_url',
        thumbnail: 'thumbnail_url',
        logo: 'logo_url',
        backdrop: 'backdrop_url',
    };

    const imageChoices = (type) => {
        const options = [];
        for (const [providerName, providerData] of Object.entries(providerPayload)) {
            const imageUrl = providerData?.images?.[type];
            if (!imageUrl) continue;
            options.push({ provider: providerName, url: imageUrl, type });
        }
        return options;
    };

    const save = async () => {
        setSaving(true);
        setError('');
        try {
            const payload = {
                ...form,
                release_year: form.release_year === '' ? null : Number(form.release_year),
            };
            const res = await fetch(`/api/games/${game.id}/metadata`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || t('networkError'));
                return;
            }
            onSaved(data);
            onClose();
        } catch {
            setError(t('networkError'));
        } finally {
            setSaving(false);
        }
    };

    const types = ['poster', 'thumbnail', 'logo', 'backdrop'];

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content modal-admin-editor" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>{t('adminEditMetadata')}</h2>
                    <button className="modal-close" onClick={onClose}><X size={20} /></button>
                </div>

                <div className="admin-editor-tabs">
                    <button className={`board-tab ${tab === 'metadata' ? 'active' : ''}`} onClick={() => setTab('metadata')}>
                        {t('adminMetadataTab')}
                    </button>
                    <button className={`board-tab ${tab === 'images' ? 'active' : ''}`} onClick={() => setTab('images')}>
                        {t('adminImagesTab')}
                    </button>
                </div>

                {error && <div className="modal-error">{error}</div>}

                {tab === 'metadata' && (
                    <div className="admin-editor-form">
                        {[
                            ['title', 'adminFieldTitle'],
                            ['description', 'adminFieldDescription'],
                            ['developer', 'adminFieldDeveloper'],
                            ['genre', 'adminFieldGenre'],
                            ['platforms', 'adminFieldPlatforms'],
                            ['tags', 'adminFieldTags'],
                            ['release_year', 'adminFieldReleaseYear'],
                            ['release_date', 'adminFieldReleaseDate'],
                            ['age_rating', 'adminFieldAgeRating'],
                            ['time_to_beat', 'adminFieldTimeToBeat'],
                            ['player_counts', 'adminFieldPlayerCounts'],
                            ['coop', 'adminFieldCoop'],
                            ['online_offline', 'adminFieldOnlineOffline'],
                            ['website', 'adminFieldWebsite'],
                        ].map(([key, label]) => (
                            <label key={key} className="admin-editor-field">
                                <span>{t(label)}</span>
                                {key === 'description' ? (
                                    <textarea
                                        value={form[key] ?? ''}
                                        onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                                        rows={4}
                                    />
                                ) : (
                                    <input
                                        type={key === 'release_year' ? 'number' : 'text'}
                                        value={form[key] ?? ''}
                                        onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                                    />
                                )}
                            </label>
                        ))}
                    </div>
                )}

                {tab === 'images' && (
                    <div className="admin-editor-images">
                        {types.map((type) => {
                            const field = imageFieldMap[type];
                            const selected = form[field] || '';
                            const options = imageChoices(type);
                            return (
                                <div key={type} className="admin-image-type-block">
                                    <h4>{t(`imageType_${type}`)}</h4>
                                    <div className="admin-image-options">
                                        {options.length === 0 && <p className="players-empty">{t('adminNoImageForType')}</p>}
                                        {options.map((opt) => (
                                            <button
                                                key={`${type}-${opt.provider}-${opt.url}`}
                                                className={`admin-image-choice ${selected === opt.url ? 'active' : ''}`}
                                                onClick={() => setForm((prev) => ({ ...prev, [field]: opt.url }))}
                                            >
                                                <img src={opt.url} alt="" />
                                                <span>{opt.provider.toUpperCase()}</span>
                                            </button>
                                        ))}
                                    </div>
                                    <input
                                        type="text"
                                        className="admin-text-input"
                                        value={form[field] || ''}
                                        onChange={(e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))}
                                        placeholder={t('adminImageUrlPlaceholder')}
                                    />
                                </div>
                            );
                        })}
                    </div>
                )}

                <div className="admin-editor-actions">
                    <button className="btn btn-outline" onClick={onClose}>{t('adminCancel')}</button>
                    <button className="btn btn-primary" onClick={save} disabled={saving}>
                        {saving ? t('saving') : t('adminSaveBtn')}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── GameDetailModal ─────────────────────────────────────────────────────────

function GameDetailModal({ game: initialGame, token, currentUser, onClose, onGameUpdated, t }) {
    const [game, setGame] = useState(initialGame);
    const [loading, setLoading] = useState(true);
    const [voteLoading, setVoteLoading] = useState(false);
    const [ratingScore, setRatingScore] = useState(0);
    const [ratingComment, setRatingComment] = useState('');
    const [dragging, setDragging] = useState(false);
    const dragCounter = { current: 0 };
    const [lightboxMedia, setLightboxMedia] = useState(null);
    const [lightboxZoom, setLightboxZoom] = useState(1);
    const [lightboxPan, setLightboxPan] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState({ x: 0, y: 0 });
    const [allUsers, setAllUsers] = useState([]);
    const [adminMenuOpen, setAdminMenuOpen] = useState(false);
    const [adminEditorOpen, setAdminEditorOpen] = useState(false);
    const [editingRunId, setEditingRunId] = useState(null);
    const [editingRunName, setEditingRunName] = useState('');

    const isAdmin = currentUser?.role === 'admin';

    const fetchDetail = useCallback(async () => {
        try {
            const res = await fetch(`/api/games/${game.id}`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setGame(data);
            }
        } catch { /* ignore */ }
        finally { setLoading(false); }
    }, [game.id, token]);

    useEffect(() => { fetchDetail(); }, [fetchDetail]);

    // Fetch all users for the player picker (admin only)
    useEffect(() => {
        if (!isAdmin) return;
        (async () => {
            try {
                const res = await fetch('/api/admin/users', {
                    headers: { 'Authorization': `Bearer ${token}` },
                });
                if (res.ok) setAllUsers(await res.json());
            } catch { /* ignore */ }
        })();
    }, [isAdmin, token]);

    useEffect(() => {
        if (!adminMenuOpen) return;
        const close = () => setAdminMenuOpen(false);
        document.addEventListener('click', close);
        return () => document.removeEventListener('click', close);
    }, [adminMenuOpen]);

    const castVote = async (vote) => {
        setVoteLoading(true);
        try {
            const res = await fetch(`/api/games/${game.id}/vote`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ vote }),
            });
            if (res.ok) {
                const updated = await res.json();
                setGame(prev => ({ ...prev, ...updated }));
                onGameUpdated(updated);
            }
        } catch { /* ignore */ }
        finally { setVoteLoading(false); }
    };

    const changeStatus = async (status) => {
        try {
            const res = await fetch(`/api/games/${game.id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ status }),
            });
            if (res.ok) {
                const updated = await res.json();
                setGame(prev => ({ ...prev, ...updated }));
                onGameUpdated(updated);
            }
        } catch { /* ignore */ }
    };

    const startRun = async () => {
        try {
            const res = await fetch(`/api/games/${game.id}/runs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            });
            if (res.ok) fetchDetail();
        } catch { /* ignore */ }
    };

    const completeRun = async (runId) => {
        try {
            const res = await fetch(`/api/games/${game.id}/runs/${runId}/complete`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (res.ok) fetchDetail();
        } catch { /* ignore */ }
    };

    const saveRunName = async (runId) => {
        const name = editingRunName.trim();
        if (!name) return;
        try {
            const res = await fetch(`/api/games/${game.id}/runs/${runId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ name }),
            });
            if (res.ok) {
                const updatedRun = await res.json();
                setGame(prev => ({
                    ...prev,
                    runs: (prev.runs || []).map(r => r.id === updatedRun.id ? { ...r, name: updatedRun.name } : r),
                }));
                setEditingRunId(null);
                setEditingRunName('');
            }
        } catch { /* ignore */ }
    };

    const submitRating = async (runId) => {
        if (!ratingScore) return;
        try {
            await fetch(`/api/games/${game.id}/runs/${runId}/rate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ score: ratingScore, comment: ratingComment }),
            });
            setRatingScore(0);
            setRatingComment('');
            fetchDetail();
        } catch { /* ignore */ }
    };

    const uploadMedia = async (file) => {
        const formData = new FormData();
        formData.append('file', file);
        try {
            await fetch(`/api/games/${game.id}/media`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData,
            });
            fetchDetail();
        } catch { /* ignore */ }
    };

    const handleDragEnter = (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current++;
        if (e.dataTransfer.items?.length) setDragging(true);
    };
    const handleDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current--;
        if (dragCounter.current === 0) setDragging(false);
    };
    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };
    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(false);
        dragCounter.current = 0;
        const files = [...(e.dataTransfer.files || [])];
        files.forEach(f => {
            if (f.type.startsWith('image/') || f.type.startsWith('video/')) {
                uploadMedia(f);
            }
        });
    };

    const deleteMedia = async (mediaId) => {
        try {
            await fetch(`/api/games/${game.id}/media/${mediaId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` },
            });
            fetchDetail();
        } catch { /* ignore */ }
    };

    const deleteRun = async (runId) => {
        if (!window.confirm(t('deleteRunConfirm'))) return;
        try {
            await fetch(`/api/games/${game.id}/runs/${runId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` },
            });
            fetchDetail();
        } catch { /* ignore */ }
    };

    const resetVotes = async () => {
        if (!window.confirm(t('resetVotesConfirm'))) return;
        try {
            const res = await fetch(`/api/games/${game.id}/votes`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (res.ok) {
                const updated = await res.json();
                setGame(prev => ({ ...prev, ...updated }));
                onGameUpdated(updated);
            }
        } catch { /* ignore */ }
    };

    const deleteRating = async (runId, userId) => {
        try {
            await fetch(`/api/games/${game.id}/runs/${runId}/ratings/${userId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` },
            });
            fetchDetail();
        } catch { /* ignore */ }
    };

    const deleteGame = async () => {
        if (!window.confirm(t('deleteGameConfirm'))) return;
        try {
            await fetch(`/api/games/${game.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` },
            });
            onGameUpdated(null);
            onClose();
        } catch { /* ignore */ }
    };

    const refreshMetadata = async () => {
        try {
            const res = await fetch(`/api/games/${game.id}/metadata/refresh`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (res.ok) {
                const updated = await res.json();
                setGame(updated);
                onGameUpdated(updated);
            }
        } catch { /* ignore */ }
    };

    const canVote = game.status === 'proposed' || game.status === 'voting';
    const canUploadMedia = game.status === 'playing' || game.status === 'completed';
    const statuses = ['proposed', 'voting', 'backlog', 'playing', 'completed'];

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content modal-detail" onClick={e => e.stopPropagation()}>
                <button className="modal-close" onClick={onClose}><X size={20} /></button>
                {isAdmin && (
                    <div className="detail-admin-menu-wrap">
                        <button
                            className="detail-admin-menu-trigger"
                            onClick={(e) => { e.stopPropagation(); setAdminMenuOpen((prev) => !prev); }}
                        >
                            <MoreVertical size={18} />
                        </button>
                        {adminMenuOpen && (
                            <div className="detail-admin-menu" onClick={(e) => e.stopPropagation()}>
                                <button onClick={() => { setAdminEditorOpen(true); setAdminMenuOpen(false); }}>
                                    <Edit3 size={14} /> {t('adminMenuEditMetadata')}
                                </button>
                                <button onClick={() => { refreshMetadata(); setAdminMenuOpen(false); }}>
                                    <RefreshCcw size={14} /> {t('adminMenuRefreshMetadata')}
                                </button>
                                <div className="detail-admin-menu-divider" />
                                {statuses.map(s => (
                                    <button key={s} disabled={game.status === s} onClick={() => { changeStatus(s); setAdminMenuOpen(false); }}>
                                        {t(`status_${s}`)}
                                    </button>
                                ))}
                                <div className="detail-admin-menu-divider" />
                                <button className="danger" onClick={() => { deleteGame(); setAdminMenuOpen(false); }}>
                                    <Trash2 size={14} /> {t('deleteGame')}
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {loading ? (
                    <div className="modal-loading"><Loader2 size={28} className="spin" /></div>
                ) : (
                    <>
                        {/* Jellyfin-style hero */}
                        <div className="detail-hero">
                            {(game.backdrop_url || game.cover_url) && (
                                <div
                                    className="detail-backdrop"
                                    style={{ backgroundImage: `url(${game.backdrop_url || game.cover_url})` }}
                                />
                            )}
                            <div className="detail-hero-content">
                                <div className="detail-cover-wrap">
                                    {game.cover_url ? (
                                        <img src={game.cover_url} alt={game.title} className="detail-cover" />
                                    ) : (
                                        <div className="detail-cover detail-cover--placeholder"><Gamepad2 size={48} /></div>
                                    )}
                                </div>
                                <div className="detail-meta">
                                    <h2 className="detail-title">{game.title}</h2>
                                    <div className="detail-meta-pills">
                                        <StatusBadge status={game.status} t={t} />
                                        {game.release_year && <span className="detail-pill detail-year">{game.release_year}</span>}
                                        {game.rating != null && (
                                            <span className="detail-pill detail-rating">
                                                <Star size={12} /> {game.rating}/10
                                            </span>
                                        )}
                                    </div>
                                    {game.genre && <p className="detail-genre"><span className="detail-label">{t('genre')}: </span>{game.genre}</p>}
                                    {game.developer && <p className="detail-developer"><span className="detail-label">{t('developer')}: </span>{game.developer}</p>}
                                    {game.platforms && <p className="detail-platforms"><span className="detail-label">{t('platforms')}: </span>{game.platforms}</p>}
                                    {game.tags && (
                                        <p className="detail-tags">
                                            <Tag size={11} /> {game.tags}
                                        </p>
                                    )}
                                    {game.age_rating && <p className="detail-platforms"><span className="detail-label">{t('ageRating')}: </span>{game.age_rating}</p>}
                                    {game.release_date && <p className="detail-platforms"><span className="detail-label">{t('releaseDate')}: </span>{game.release_date}</p>}
                                    <p className="detail-proposed-by">
                                        {t('proposedBy')} <strong>{game.proposed_by_username}</strong>
                                    </p>
                                    {game.website && (
                                        <a href={game.website} target="_blank" rel="noopener noreferrer" className="detail-website">
                                            <ExternalLink size={12} /> {t('officialWebsite')}
                                        </a>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="detail-body">
                        {game.description && (
                            <div className="detail-description">
                                <p>{game.description.length > 600 ? game.description.slice(0, 600) + '…' : game.description}</p>
                            </div>
                        )}

                        {(game.time_to_beat || game.player_counts || game.coop || game.online_offline) && (
                            <div className="detail-section">
                                <h3><Clock size={16} /> {t('advancedMetaSection')}</h3>
                                {game.time_to_beat && <p className="detail-platforms"><span className="detail-label">{t('timeToBeat')}: </span>{game.time_to_beat}</p>}
                                {game.player_counts && <p className="detail-platforms"><span className="detail-label">{t('playerCounts')}: </span>{game.player_counts}</p>}
                                {game.coop && <p className="detail-platforms"><span className="detail-label">{t('coopLabel')}: </span>{game.coop}</p>}
                                {game.online_offline && <p className="detail-platforms"><span className="detail-label">{t('onlineOffline')}: </span>{game.online_offline}</p>}
                            </div>
                        )}

                        {(game.screenshots || []).length > 0 && (
                            <div className="detail-section">
                                <h3><ImageIcon size={16} /> {t('screenshotsSection')}</h3>
                                <div className="detail-image-types">
                                    {(game.screenshots || []).slice(0, 12).map((url, index) => (
                                        <button key={`${url}-${index}`} className="detail-image-type" onClick={() => setLightboxMedia({ mime_type: 'image/custom', filename: null, direct_url: url })}>
                                            <img src={url} alt="" />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {(game.videos || []).length > 0 && (
                            <div className="detail-section">
                                <h3><Play size={16} /> {t('videosSection')}</h3>
                                <div className="detail-video-list">
                                    {(game.videos || []).slice(0, 8).map((video, index) => (
                                        <a key={`${video.url}-${index}`} href={video.url} target="_blank" rel="noopener noreferrer" className="detail-video-item">
                                            <ExternalLink size={13} /> {video.name || `${t('videoLabel')} ${index + 1}`}
                                        </a>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Voting */}
                        {canVote && (
                            <div className="detail-section">
                                <h3><ThumbsUp size={16} /> {t('votingSection')}</h3>
                                <div className="vote-controls">
                                    <button
                                        className={`vote-btn vote-yes ${game.user_vote === 1 ? 'active' : ''}`}
                                        onClick={() => castVote(1)}
                                        disabled={voteLoading}
                                    >
                                        <ThumbsUp size={18} /> {t('voteYes')} ({game.votes_yes})
                                    </button>
                                    <button
                                        className={`vote-btn vote-no ${game.user_vote === 0 ? 'active' : ''}`}
                                        onClick={() => castVote(0)}
                                        disabled={voteLoading}
                                    >
                                        <ThumbsDown size={18} /> {t('voteNo')} ({game.votes_no})
                                    </button>
                                </div>
                                {game.voters && game.voters.length > 0 && (
                                    <div className="voter-list">
                                        {game.voters.map(v => (
                                            <span key={v.user_id} className={`voter-chip ${v.vote ? 'voter-yes' : 'voter-no'}`}>
                                                {v.username}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                {isAdmin && (game.votes_yes > 0 || game.votes_no > 0) && (
                                    <button className="btn btn-sm btn-danger" onClick={resetVotes} style={{ marginTop: '0.5rem' }}>
                                        <RotateCcw size={14} /> {t('resetVotes')}
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Runs */}
                        {(game.status === 'playing' || game.status === 'completed' || game.status === 'backlog') && (
                            <div className="detail-section">
                                <h3><Play size={16} /> {t('runsSection')}</h3>
                                {(game.runs || []).map(run => (
                                    <div key={run.id} className="run-card">
                                        <div className="run-header">
                                            {isAdmin && editingRunId === run.id ? (
                                                <div className="run-name-edit">
                                                    <input
                                                        type="text"
                                                        value={editingRunName}
                                                        onChange={(e) => setEditingRunName(e.target.value)}
                                                        className="rating-comment-input"
                                                    />
                                                    <button className="btn btn-sm btn-outline" onClick={() => saveRunName(run.id)}>{t('saveRunName')}</button>
                                                    <button className="btn btn-sm btn-outline" onClick={() => { setEditingRunId(null); setEditingRunName(''); }}>{t('cancelRunName')}</button>
                                                </div>
                                            ) : (
                                                <span className="run-label">{run.name || `${t('runLabel')} #${run.run_number}`}</span>
                                            )}
                                            {run.completed_at ? (
                                                <span className="run-status run-done"><CheckCircle size={14} /> {t('completed')}</span>
                                            ) : (
                                                <span className="run-status run-active"><Play size={14} /> {t('inProgress')}</span>
                                            )}
                                        </div>
                                        {run.average_rating && (
                                            <div className="run-avg-rating">
                                                <Star size={14} /> {run.average_rating}/10
                                                <span className="run-rating-count">({run.ratings.length} {t('ratings')})</span>
                                            </div>
                                        )}
                                        {/* Individual ratings (admin can delete) */}
                                        {isAdmin && run.ratings && run.ratings.length > 0 && (
                                            <div className="run-ratings-list">
                                                {run.ratings.map(r => (
                                                    <div key={r.user_id} className="run-rating-item">
                                                        <span className="run-rating-user">{r.username}</span>
                                                        <span className="run-rating-score"><Star size={12} /> {r.score}/10</span>
                                                        {r.comment && <span className="run-rating-comment">{r.comment}</span>}
                                                        <button className="player-remove" onClick={() => deleteRating(run.id, r.user_id)} title={t('deleteRating')}>
                                                            <X size={12} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {/* Rating form */}
                                        {run.completed_at && (
                                            <div className="rating-form">
                                                <div className="rating-stars">
                                                    {[...Array(10)].map((_, i) => (
                                                        <Star
                                                            key={i}
                                                            size={18}
                                                            className={`rating-star ${i < ratingScore ? 'filled' : ''}`}
                                                            onClick={() => setRatingScore(i + 1)}
                                                        />
                                                    ))}
                                                </div>
                                                <input
                                                    type="text"
                                                    placeholder={t('ratingCommentPlaceholder')}
                                                    value={ratingComment}
                                                    onChange={e => setRatingComment(e.target.value)}
                                                    className="rating-comment-input"
                                                />
                                                <button className="btn btn-primary btn-sm" onClick={() => submitRating(run.id)} disabled={!ratingScore}>
                                                    {t('submitRating')}
                                                </button>
                                            </div>
                                        )}
                                        <div className="run-admin-actions">
                                            {isAdmin && editingRunId !== run.id && (
                                                <button className="btn btn-sm btn-outline" onClick={() => { setEditingRunId(run.id); setEditingRunName(run.name || `${t('runLabel')} #${run.run_number}`); }}>
                                                    <Edit3 size={14} /> {t('editRunName')}
                                                </button>
                                            )}
                                            {!run.completed_at && isAdmin && (
                                                <button className="btn btn-sm btn-outline" onClick={() => completeRun(run.id)}>
                                                    <CheckCircle size={14} /> {t('completeRun')}
                                                </button>
                                            )}
                                            {isAdmin && (
                                                <button className="btn btn-sm btn-danger" onClick={() => deleteRun(run.id)}>
                                                    <Trash2 size={14} /> {t('deleteRun')}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {isAdmin && (
                                    <button className="btn btn-sm btn-outline" onClick={startRun} style={{ marginTop: '0.5rem' }}>
                                        <Play size={14} /> {t('startNewRun')}
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Players */}
                        <div className="detail-section">
                            <h3><Users size={16} /> {t('playersSection')}</h3>
                            {(game.players || []).length > 0 ? (
                                <div className="player-list">
                                    {game.players.map(p => (
                                        <div key={p.user_id} className="player-chip">
                                            {p.avatar ? (
                                                <img src={`/api/avatars/${p.avatar}`} alt="" className="player-avatar" />
                                            ) : (
                                                <Users size={14} className="player-avatar-placeholder" />
                                            )}
                                            <span className="player-name">{p.username}</span>
                                            {isAdmin && (
                                                <button
                                                    className="player-remove"
                                                    title={t('removePlayer')}
                                                    onClick={async () => {
                                                        try {
                                                            const res = await fetch(`/api/games/${game.id}/players/${p.user_id}`, {
                                                                method: 'DELETE',
                                                                headers: { 'Authorization': `Bearer ${token}` },
                                                            });
                                                            if (res.ok) {
                                                                const data = await res.json();
                                                                setGame(prev => ({ ...prev, players: data.players }));
                                                            }
                                                        } catch { /* ignore */ }
                                                    }}
                                                >
                                                    <X size={12} />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="players-empty">{t('noPlayers')}</p>
                            )}
                            {isAdmin && game.status === 'playing' && (() => {
                                const playerIds = new Set((game.players || []).map(p => p.user_id));
                                const available = allUsers.filter(u => !playerIds.has(u.id));
                                if (available.length === 0) return null;
                                return (
                                    <div className="player-add-row">
                                        <select
                                            id="player-add-select"
                                            className="player-add-select"
                                            defaultValue=""
                                            onChange={async (e) => {
                                                const userId = e.target.value;
                                                if (!userId) return;
                                                try {
                                                    const res = await fetch(`/api/games/${game.id}/players`, {
                                                        method: 'POST',
                                                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                                        body: JSON.stringify({ user_id: userId }),
                                                    });
                                                    if (res.ok) {
                                                        const data = await res.json();
                                                        setGame(prev => ({ ...prev, players: data.players }));
                                                    }
                                                } catch { /* ignore */ }
                                                e.target.value = '';
                                            }}
                                        >
                                            <option value="" disabled>{t('addPlayer')}</option>
                                            {available.map(u => (
                                                <option key={u.id} value={u.id}>{u.username}</option>
                                            ))}
                                        </select>
                                    </div>
                                );
                            })()}
                        </div>

                        {/* Media */}
                        <div
                            className={`detail-section media-drop-zone ${dragging ? 'media-drop-zone--active' : ''}`}
                            onDragEnter={canUploadMedia ? handleDragEnter : undefined}
                            onDragLeave={canUploadMedia ? handleDragLeave : undefined}
                            onDragOver={canUploadMedia ? handleDragOver : undefined}
                            onDrop={canUploadMedia ? handleDrop : undefined}
                        >
                            {dragging && (
                                <div className="media-drop-overlay">
                                    <Upload size={32} />
                                    <span>{t('dropMediaHere')}</span>
                                </div>
                            )}
                            <h3><ImageIcon size={16} /> {t('mediaSection')}</h3>
                            {(() => {
                                const media = game.media || [];
                                // Group by uploader
                                const grouped = {};
                                for (const m of media) {
                                    const name = m.uploaded_by_username || 'Unknown';
                                    if (!grouped[name]) grouped[name] = { avatar: m.uploaded_by_avatar, items: [] };
                                    grouped[name].items.push(m);
                                }
                                const groups = Object.entries(grouped);
                                if (groups.length === 0) {
                                    return <p className="players-empty">{t('noMedia')}</p>;
                                }
                                return groups.map(([username, { avatar, items }]) => (
                                    <div key={username} className="media-group">
                                        <div className="media-group-header">
                                            {avatar ? (
                                                <img src={`/api/avatars/${avatar}`} alt="" className="media-group-avatar" />
                                            ) : (
                                                <Users size={14} className="player-avatar-placeholder" />
                                            )}
                                            {username}
                                        </div>
                                        <div className="media-gallery">
                                            {items.map(m => (
                                                <div key={m.id} className="media-item" onClick={() => { setLightboxMedia(m); setLightboxZoom(1); setLightboxPan({ x: 0, y: 0 }); }}>
                                                    {m.mime_type.startsWith('image/') ? (
                                                        <img src={`/api/media/${m.filename}`} alt="" className="media-thumb" />
                                                    ) : (
                                                        <video src={`/api/media/${m.filename}`} className="media-thumb" />
                                                    )}
                                                    {(m.uploaded_by === currentUser?.id || isAdmin) && (
                                                        <button className="media-delete" onClick={(e) => { e.stopPropagation(); deleteMedia(m.id); }}>
                                                            <Trash2 size={12} />
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ));
                            })()}
                            {canUploadMedia ? (
                                <label className="btn btn-sm btn-outline media-upload-btn">
                                    <Upload size={14} /> {t('uploadMedia')}
                                    <input type="file" accept="image/*,video/*" multiple hidden onChange={e => {
                                        [...(e.target.files || [])].forEach(f => uploadMedia(f));
                                        e.target.value = '';
                                    }} />
                                </label>
                            ) : (
                                <p className="players-empty">{t('mediaUploadLocked')}</p>
                            )}
                        </div>

                        </div>{/* end detail-body */}
                    </>
                )}

                {/* Lightbox */}
                {lightboxMedia && (
                    <div
                        className="lightbox-overlay"
                        onClick={() => setLightboxMedia(null)}
                        onKeyDown={e => e.key === 'Escape' && setLightboxMedia(null)}
                        tabIndex={-1}
                        ref={el => el?.focus()}
                        onWheel={e => {
                            if (!lightboxMedia.mime_type.startsWith('image/')) return;
                            e.preventDefault();
                            setLightboxZoom(prev => {
                                const next = prev + (e.deltaY < 0 ? 0.3 : -0.3);
                                const clamped = Math.min(5, Math.max(1, next));
                                if (clamped <= 1) setLightboxPan({ x: 0, y: 0 });
                                return clamped;
                            });
                        }}
                    >
                        <button className="lightbox-close" onClick={() => setLightboxMedia(null)}><X size={24} /></button>
                        {lightboxZoom > 1 && (
                            <div className="lightbox-zoom-badge">{Math.round(lightboxZoom * 100)}%</div>
                        )}
                        {lightboxMedia.mime_type.startsWith('image/') ? (
                            <img
                                src={lightboxMedia.direct_url || `/api/media/${lightboxMedia.filename}`}
                                alt=""
                                className="lightbox-img"
                                style={{
                                    transform: `scale(${lightboxZoom}) translate(${lightboxPan.x / lightboxZoom}px, ${lightboxPan.y / lightboxZoom}px)`,
                                    cursor: lightboxZoom > 1 ? (isPanning ? 'grabbing' : 'grab') : 'default',
                                }}
                                draggable={false}
                                onClick={e => e.stopPropagation()}
                                onDoubleClick={e => {
                                    e.stopPropagation();
                                    if (lightboxZoom > 1) {
                                        setLightboxZoom(1);
                                        setLightboxPan({ x: 0, y: 0 });
                                    } else {
                                        setLightboxZoom(2.5);
                                    }
                                }}
                                onMouseDown={e => {
                                    if (lightboxZoom <= 1) return;
                                    e.preventDefault();
                                    setIsPanning(true);
                                    setPanStart({ x: e.clientX - lightboxPan.x, y: e.clientY - lightboxPan.y });
                                }}
                                onMouseMove={e => {
                                    if (!isPanning) return;
                                    setLightboxPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
                                }}
                                onMouseUp={() => setIsPanning(false)}
                                onMouseLeave={() => setIsPanning(false)}
                            />
                        ) : (
                            <video src={lightboxMedia.direct_url || `/api/media/${lightboxMedia.filename}`} className="lightbox-video" controls autoPlay onClick={e => e.stopPropagation()} />
                        )}
                    </div>
                )}

                <AdminMetadataEditor
                    open={adminEditorOpen}
                    game={game}
                    token={token}
                    onClose={() => setAdminEditorOpen(false)}
                    onSaved={(updated) => {
                        setGame(updated);
                        onGameUpdated(updated);
                    }}
                    t={t}
                />
            </div>
        </div>
    );
}

// ── DashboardScreen ─────────────────────────────────────────────────────────

export default function DashboardScreen({ token, currentUser }) {
    const { t } = useTranslation();
    const [games, setGames] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showPropose, setShowPropose] = useState(false);
    const [selectedGame, setSelectedGame] = useState(null);
    const [view, setView] = useState('board'); // board | completed

    const fetchGames = useCallback(async () => {
        try {
            const res = await fetch('/api/games', {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (res.ok) setGames(await res.json());
        } catch { /* ignore */ }
        finally { setLoading(false); }
    }, [token]);

    useEffect(() => { fetchGames(); }, [fetchGames]);

    const handleGameUpdated = (updated) => {
        if (updated === null) {
            // Game was deleted
            setGames(prev => prev.filter(g => g.id !== selectedGame?.id));
            return;
        }
        setGames(prev => prev.map(g => g.id === updated.id ? { ...g, ...updated } : g));
    };

    const handleProposed = (game) => {
        setGames(prev => [game, ...prev]);
    };

    const openGame = useCallback((game) => {
        setSelectedGame(game);
        window.history.replaceState(null, '', `#/game/${game.id}`);
    }, []);

    const closeGame = useCallback(() => {
        setSelectedGame(null);
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        fetchGames();
    }, [fetchGames]);

    const openGameFromHash = useCallback(() => {
        const match = window.location.hash.match(/^#\/game\/([^/?#]+)/);
        if (!match) return;
        const targetId = decodeURIComponent(match[1]);
        const game = games.find(g => String(g.id) === targetId);
        if (game) setSelectedGame(game);
    }, [games]);

    // Auto-open game from URL hash once games are available.
    useEffect(() => {
        if (loading || !games.length) return;
        openGameFromHash();
    }, [loading, games, openGameFromHash]);

    // Also react to hash changes (covers cases where hash is set after mount).
    useEffect(() => {
        const onHashChange = () => {
            if (!loading && games.length) openGameFromHash();
        };
        window.addEventListener('hashchange', onHashChange);
        return () => window.removeEventListener('hashchange', onHashChange);
    }, [loading, games, openGameFromHash]);
    const proposed = games.filter(g => g.status === 'proposed' || g.status === 'voting');
    const backlog = games.filter(g => g.status === 'backlog');
    const playing = games.filter(g => g.status === 'playing');
    const completed = games.filter(g => g.status === 'completed');

    return (
        <div className="dashboard-screen">
            {/* View tabs */}
            <div className="board-header">
                <div className="board-tabs">
                    <button
                        className={`board-tab ${view === 'board' ? 'active' : ''}`}
                        onClick={() => setView('board')}
                    >
                        <Gamepad2 size={16} /> {t('boardView')}
                    </button>
                    <button
                        className={`board-tab ${view === 'completed' ? 'active' : ''}`}
                        onClick={() => setView('completed')}
                    >
                        <Trophy size={16} /> {t('completedView')}
                    </button>
                </div>
                <button className="btn btn-primary btn-propose" onClick={() => setShowPropose(true)}>
                    <Plus size={18} /> {t('proposeGame')}
                </button>
            </div>

            {loading ? (
                <div className="board-loading"><Loader2 size={32} className="spin" /></div>
            ) : view === 'board' ? (
                <div className="board-columns">
                    {/* Proposed / Voting */}
                    <div className="board-column">
                        <div className="board-column-header">
                            <Clock size={16} />
                            <span>{t('columnProposed')}</span>
                            <span className="board-column-count">{proposed.length}</span>
                        </div>
                        <div className="board-column-cards">
                            {proposed.map(g => <GameCard key={g.id} game={g} onClick={openGame} t={t} />)}
                            {proposed.length === 0 && <p className="board-empty">{t('noGamesYet')}</p>}
                        </div>
                    </div>

                    {/* Backlog */}
                    <div className="board-column">
                        <div className="board-column-header">
                            <ChevronRight size={16} />
                            <span>{t('columnBacklog')}</span>
                            <span className="board-column-count">{backlog.length}</span>
                        </div>
                        <div className="board-column-cards">
                            {backlog.map(g => <GameCard key={g.id} game={g} onClick={openGame} t={t} />)}
                            {backlog.length === 0 && <p className="board-empty">{t('emptyBacklog')}</p>}
                        </div>
                    </div>

                    {/* Playing */}
                    <div className="board-column">
                        <div className="board-column-header">
                            <Play size={16} />
                            <span>{t('columnPlaying')}</span>
                            <span className="board-column-count">{playing.length}</span>
                        </div>
                        <div className="board-column-cards">
                            {playing.map(g => <GameCard key={g.id} game={g} onClick={openGame} t={t} />)}
                            {playing.length === 0 && <p className="board-empty">{t('emptyPlaying')}</p>}
                        </div>
                    </div>
                </div>
            ) : (
                /* Completed view */
                <div className="completed-grid">
                    {completed.map(g => <GameCard key={g.id} game={g} onClick={openGame} t={t} />)}
                    {completed.length === 0 && <p className="board-empty board-empty--center">{t('noCompleted')}</p>}
                </div>
            )}

            {/* Modals */}
            {showPropose && (
                <ProposeGameModal
                    token={token}
                    onClose={() => setShowPropose(false)}
                    onProposed={handleProposed}
                    t={t}
                />
            )}
            {selectedGame && (
                <GameDetailModal
                    game={selectedGame}
                    token={token}
                    currentUser={currentUser}
                    onClose={closeGame}
                    onGameUpdated={handleGameUpdated}
                    t={t}
                />
            )}
        </div>
    );
}
