import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Search, ThumbsUp, ThumbsDown, Gamepad2, Trophy, Clock, Play, CheckCircle, ChevronRight, X, Star, Upload, Trash2, Loader2, Image as ImageIcon, AlertCircle, Users, User, UserPlus, UserMinus, RotateCcw, ExternalLink, Tag, MoreVertical, RefreshCcw, Edit3, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { uploadWithProgress, uploadChunked } from '../uploadWithProgress';
import magnetIcon from '../assets/magnet-icon.png';
import torrentIcon from '../assets/download-icon.png';
import CustomSelect from '../components/CustomSelect';

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
    const showMedian = game.status === 'completed' && game.median_rating !== null && game.median_rating !== undefined;
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
                    {showMedian ? (
                        <span className="game-card-median" title={t('medianRating')}>
                            <Star size={13} /> {Number(game.median_rating).toFixed(1)}
                        </span>
                    ) : (
                        <span className="game-card-votes">
                            <ThumbsUp size={13} /> {game.votes_yes}
                            <ThumbsDown size={13} style={{ marginLeft: 6 }} /> {game.votes_no}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── ManageDownloadsModal ────────────────────────────────────────────────────
function ManageDownloadsModal({ gameId, token, currentUser, onClose, t, onDownloadsUpdated }) {
    const [downloads, setDownloads] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState(null);
    const [type, setType] = useState('magnet');
    const [link, setLink] = useState('');
    const [file, setFile] = useState(null);

    const fetchDownloads = useCallback(() => {
        setLoading(true);
        fetch(`/api/games/${gameId}/downloads`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) setDownloads(data);
                setLoading(false);
            })
            .catch(() => {
                setError(t('networkError'));
                setLoading(false);
            });
    }, [gameId, token, t]);

    useEffect(() => {
        fetchDownloads();
    }, [fetchDownloads]);

    const handleUpload = async (e) => {
        e.preventDefault();
        if (type === 'magnet' && !link) return setError('Link needed');
        if (type === 'torrent' && !file) return setError('File needed');
        setUploading(true);
        setError(null);

        try {
            const formData = new FormData();
            formData.append('type', type);
            if (type === 'magnet') formData.append('link', link);
            else formData.append('file', file);

            const res = await fetch(`/api/games/${gameId}/downloads`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Upload failed');
            }
            onDownloadsUpdated(data);
            setType('magnet');
            setLink('');
            setFile(null);
            fetchDownloads();
        } catch (err) {
            setError(err.message);
        } finally {
            setUploading(false);
        }
    };

    const deleteDownload = async (downloadId) => {
        if (!window.confirm(t('deleteRunConfirm') || 'Are you sure you want to delete this download?')) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/games/${gameId}/downloads/${downloadId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                onDownloadsUpdated(data);
                fetchDownloads();
            } else {
                const errData = await res.json();
                setError(errData.error || 'Failed to delete download');
                setLoading(false);
            }
        } catch (err) {
            setError(t('networkError') || 'Network error');
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content modal-detail" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>{t('manageDownloads') || 'Manage Downloads'}</h2>
                    <button className="modal-close" onClick={onClose} aria-label="Close"><X size={20} /></button>
                </div>

                <form onSubmit={handleUpload} className="screen-form" style={{ padding: '1rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(74, 144, 226, 0.4)', marginBottom: '1.5rem' }}>
                    <div className="admin-setting-row--text">
                        <label className="admin-setting-label">{t('typeLabel') || 'Type'}</label>
                        <CustomSelect
                            value={type}
                            onChange={val => setType(val)}
                            options={[
                                { value: 'magnet', label: t('magnetType') || 'Magnet Link' },
                                { value: 'torrent', label: t('torrentType') || 'Torrent File' }
                            ]}
                        />
                    </div>
                    {type === 'magnet' ? (
                        <div className="admin-setting-row--text">
                            <label className="admin-setting-label">{t('magnetType') || 'Magnet Link'}</label>
                            <input type="text" className="admin-text-input" value={link} onChange={e => setLink(e.target.value)} placeholder="magnet:?xt=urn:btih:..." />
                        </div>
                    ) : (
                        <div className="admin-setting-row--text">
                            <label className="admin-setting-label">{t('torrentType') || 'Torrent File'}</label>
                            <input type="file" className="admin-text-input" style={{ padding: '0.4rem' }} accept=".torrent" onChange={e => setFile(e.target.files[0])} />
                        </div>
                    )}
                    {error && <div className="auth-error">{error}</div>}
                    <button type="submit" className="btn btn-primary btn-block" disabled={uploading}>
                        {uploading ? <Loader2 size={16} className="spin" /> : <Upload size={16} />}
                        {t('uploadDownload') || 'Add Download'}
                    </button>
                </form>

                <div className="downloads-history">
                    <div className="screen-divider" style={{ borderTop: 'none', marginBottom: '1rem', color: 'var(--text-green)', fontSize: '0.85rem' }}>
                        {t('downloadsHistory') || 'Downloads History'}
                    </div>
                    {loading ? (
                        <div className="modal-loading"><Loader2 size={24} className="spin" /></div>
                    ) : downloads.length === 0 ? (
                        <p className="no-downloads">{t('noDownloadsYet') || 'No downloads added yet.'}</p>
                    ) : (
                        <ul className="downloads-list">
                            {downloads.map(d => (
                                <li key={d.id} className="download-item">
                                    <div className="download-info">
                                        <span className={`download-type-badge ${d.type}`}>
                                            {d.type === 'magnet' ? <img src={magnetIcon} alt="magnet" width={14} height={14} /> : <img src={torrentIcon} alt="torrent" width={14} height={14} />}
                                            {d.type === 'magnet' ? (t('magnetType') || 'MAGNET') : (t('torrentType') || 'TORRENT')}
                                        </span>
                                        <div className="download-meta">
                                            {t('uploadedBy') || 'Uploaded by'} {d.uploaded_by_username} · {new Date(d.uploaded_at * 1000).toLocaleDateString()}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                        <a href={d.type === 'magnet' ? d.link : `/api/media/${d.filename}`} className="btn btn-secondary btn-sm" download={d.type === 'torrent'}>
                                            <Download size={14} /> {t('downloadDownload') || 'Download'}
                                        </a>
                                        {(currentUser?.role === 'admin' || currentUser?.id === d.uploaded_by) && (
                                            <button className="btn btn-danger btn-sm" onClick={() => deleteDownload(d.id)} title="Delete" style={{ padding: '0.4rem' }}>
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
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
    const [hoverRating, setHoverRating] = useState(0);
    const [isDraggingRating, setIsDraggingRating] = useState(false);
    const [ratingComment, setRatingComment] = useState('');
    const [dragging, setDragging] = useState(false);
    const dragCounter = useRef(0);
    const [mediaUploads, setMediaUploads] = useState([]);
    const mediaUploadAbortMapRef = useRef(new Map());
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
    const [manageDownloadsOpen, setManageDownloadsOpen] = useState(false);

    const isAdmin = currentUser?.role === 'admin';
    const canManageDownloads = isAdmin || window?.COOPLYST_CONFIG?.allow_all_users_add_downloads === true;

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
        const numericScore = parseFloat(ratingScore);
        if (isNaN(numericScore) || numericScore < 1 || numericScore > 10) return;
        try {
            const res = await fetch(`/api/games/${game.id}/runs/${runId}/rate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ score: numericScore, comment: ratingComment }),
            });
            if (res.ok) {
                setRatingScore(0);
                setRatingComment('');
                fetchDetail();
                window.dispatchEvent(new Event('cooplyst:rating_submitted'));
            }
        } catch { /* ignore */ }
    };

    const uploadMedia = async (file) => {
        const uploadId = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        setMediaUploads(prev => [...prev, { id: uploadId, name: file.name, progress: 0, error: null }]);
        try {
            const res = await uploadChunked({
                url: `/api/games/${game.id}/media`,
                token,
                file,
                onProgress: (pct) => {
                    setMediaUploads(prev => prev.map(u => u.id === uploadId ? { ...u, progress: pct } : u));
                },
                onAbortReady: (abortFn) => {
                    mediaUploadAbortMapRef.current.set(uploadId, abortFn);
                },
            });
            if (res.ok) {
                setMediaUploads(prev => prev.map(u => u.id === uploadId ? { ...u, progress: 100 } : u));
                fetchDetail();
                setTimeout(() => {
                    setMediaUploads(prev => prev.filter(u => u.id !== uploadId));
                    mediaUploadAbortMapRef.current.delete(uploadId);
                }, 800);
            } else {
                const error = res.data?.error || t('uploadFailed');
                setMediaUploads(prev => prev.map(u => u.id === uploadId ? { ...u, error } : u));
                mediaUploadAbortMapRef.current.delete(uploadId);
            }
        } catch (err) {
            if (err.message === 'ABORTED') {
                setMediaUploads(prev => prev.filter(u => u.id !== uploadId));
                mediaUploadAbortMapRef.current.delete(uploadId);
                return;
            }
            const error = err.message === 'UPLOAD_TIMEOUT' ? t('uploadTimeout') : t('networkError');
            setMediaUploads(prev => prev.map(u => u.id === uploadId ? { ...u, error } : u));
            mediaUploadAbortMapRef.current.delete(uploadId);
        }
    };

    const cancelMediaUpload = (uploadId) => {
        const abortFn = mediaUploadAbortMapRef.current.get(uploadId);
        if (abortFn) abortFn();
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

    const lightboxSource = lightboxMedia
        ? (lightboxMedia.direct_url || `/api/media/${lightboxMedia.filename}`)
        : null;

    const lightboxFilename = (() => {
        if (!lightboxMedia) return 'media';
        if (lightboxMedia.filename) return lightboxMedia.filename;
        const ext = lightboxMedia.mime_type?.startsWith('video/') ? 'mp4' : 'jpg';
        return `cooplyst-media-${Date.now()}.${ext}`;
    })();

    const handleLightboxDownload = (e) => {
        e.stopPropagation();
        if (!lightboxSource) return;
        const link = document.createElement('a');
        link.href = lightboxSource;
        link.download = lightboxFilename;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const canVote = game.status === 'proposed' || game.status === 'voting';
    const canUploadMedia = game.status === 'playing' || game.status === 'completed';
    const statuses = ['proposed', 'voting', 'backlog', 'playing', 'completed'];

    const latestDownloads = game.downloads || game.latest_downloads || [];
    const magnetDl = latestDownloads.find(d => d.type === 'magnet');
    const torrentDl = latestDownloads.find(d => d.type === 'torrent');

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content modal-detail" onClick={e => e.stopPropagation()}>
                <button className="modal-close" onClick={onClose}><X size={20} /></button>
                {(isAdmin || canManageDownloads) && (
                    <div className="detail-admin-menu-wrap">
                        <button
                            className="detail-admin-menu-trigger"
                            onClick={(e) => { e.stopPropagation(); setAdminMenuOpen((prev) => !prev); }}
                        >
                            <MoreVertical size={18} />
                        </button>
                        {adminMenuOpen && (
                            <div className="detail-admin-menu" onClick={(e) => e.stopPropagation()}>
                                {canManageDownloads && (
                                    <button onClick={() => { setManageDownloadsOpen(true); setAdminMenuOpen(false); }}>
                                        <Download size={14} /> {t('manageDownloads') || 'Manage Downloads'}
                                    </button>
                                )}
                                {isAdmin && canManageDownloads && <div className="detail-admin-menu-divider" />}
                                {isAdmin && (
                                    <>
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
                                    </>
                                )}
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
                                    {(magnetDl || torrentDl) && (
                                        <div className="game-card-downloads" style={{ marginTop: '1rem' }} onClick={e => e.stopPropagation()}>
                                            {magnetDl && (
                                                <a href={magnetDl.link} className={`game-download-btn ${!torrentDl ? 'full' : 'half'}`}>
                                                    <img src={magnetIcon} alt="Magnet" className="game-download-icon" />
                                                </a>
                                            )}
                                            {torrentDl && (
                                                <a href={`/api/media/${torrentDl.filename}`} className={`game-download-btn ${!magnetDl ? 'full' : 'half'}`} download>
                                                    <img src={torrentIcon} alt="Torrent" className="game-download-icon" />
                                                </a>
                                            )}
                                        </div>
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
                                            {/* Individual ratings */}
                                            {run.ratings && run.ratings.length > 0 && (
                                                <div className="run-ratings-list">
                                                    {run.ratings.map(r => (
                                                        <div key={r.user_id} className="run-rating-item" style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.5rem', padding: '0.5rem', background: 'rgba(0,0,0,0.1)', borderRadius: '8px' }}>
                                                            {r.avatar ? (
                                                                <img
                                                                    src={`/api/avatars/${r.avatar_pixelated ? r.avatar.replace('.webp', '_pixel.webp') : r.avatar}`}
                                                                    alt={r.username}
                                                                    style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }}
                                                                />
                                                            ) : (
                                                                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                    <User size={20} />
                                                                </div>
                                                            )}
                                                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                    <span className="run-rating-user" style={{ fontWeight: 'bold' }}>{r.username}</span>
                                                                    <span className="run-rating-score" style={{ display: 'flex', alignItems: 'center', gap: '2px', color: 'var(--text-yellow)', fontSize: '0.8rem' }}>
                                                                        <Star size={12} className="filled" /> {r.score}/10
                                                                    </span>
                                                                </div>
                                                                {r.comment && <div className="run-rating-comment" style={{ whiteSpace: 'pre-wrap', marginTop: '0.25rem', fontSize: '0.9rem', opacity: 0.9 }}>{r.comment}</div>}
                                                            </div>
                                                            {isAdmin && (
                                                                <button className="player-remove" onClick={() => deleteRating(run.id, r.user_id)} title={t('deleteRating')} style={{ alignSelf: 'center' }}>
                                                                    <X size={14} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            {/* Rating form */}
                                            {run.completed_at && (
                                                <div className="rating-form">
                                                    <div className="rating-input-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                                        <div
                                                            className="rating-stars"
                                                            style={{ display: 'flex', gap: '4px', touchAction: 'none', cursor: 'pointer' }}
                                                            onPointerDown={(e) => {
                                                                setIsDraggingRating(true);
                                                                e.currentTarget.setPointerCapture(e.pointerId);
                                                                const rect = e.currentTarget.getBoundingClientRect();
                                                                const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
                                                                let starIndex = Math.floor(x / 22);
                                                                if (starIndex > 9) starIndex = 9;
                                                                const relativeX = x - (starIndex * 22);
                                                                const calculatedRating = starIndex + (relativeX < 9 ? 0.5 : 1);
                                                                setRatingScore(calculatedRating);
                                                                setHoverRating(calculatedRating);
                                                            }}
                                                            onPointerMove={(e) => {
                                                                const rect = e.currentTarget.getBoundingClientRect();
                                                                const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
                                                                let starIndex = Math.floor(x / 22);
                                                                if (starIndex > 9) starIndex = 9;
                                                                const relativeX = x - (starIndex * 22);
                                                                const calculatedRating = starIndex + (relativeX < 9 ? 0.5 : 1);

                                                                setHoverRating(calculatedRating);
                                                                if (isDraggingRating) {
                                                                    setRatingScore(calculatedRating);
                                                                }
                                                            }}
                                                            onPointerUp={(e) => {
                                                                setIsDraggingRating(false);
                                                                e.currentTarget.releasePointerCapture(e.pointerId);
                                                            }}
                                                            onPointerLeave={() => {
                                                                if (!isDraggingRating) setHoverRating(0);
                                                            }}
                                                        >
                                                            {[...Array(10)].map((_, i) => {
                                                                const starIndex = i + 1;
                                                                const currentRating = hoverRating || ratingScore || 0;
                                                                const isFull = currentRating >= starIndex;
                                                                const isHalf = currentRating === starIndex - 0.5;

                                                                return (
                                                                    <div key={i} className="rating-star-wrapper" style={{ position: 'relative', width: '18px', height: '18px', pointerEvents: 'none' }}>
                                                                        <Star size={18} className="rating-star" />
                                                                        {(isFull || isHalf) && (
                                                                            <div style={{ position: 'absolute', top: 0, left: 0, overflow: 'hidden', width: isHalf ? '50%' : '100%' }}>
                                                                                <Star size={18} className="rating-star filled" />
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                        <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>{hoverRating || ratingScore || 0}/10</span>
                                                    </div>
                                                    <textarea
                                                        placeholder={t('ratingCommentPlaceholder')}
                                                        value={ratingComment}
                                                        onChange={e => setRatingComment(e.target.value)}
                                                        className="rating-comment-input"
                                                        rows={3}
                                                        style={{ resize: 'vertical', minHeight: '60px', width: '100%', marginBottom: '0.5rem', fontFamily: 'inherit' }}
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
                                            <CustomSelect
                                                className="player-add-select"
                                                value=""
                                                placeholder={t('addPlayer')}
                                                options={available.map(u => ({ value: u.id, label: u.username }))}
                                                onChange={async (userId) => {
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
                                                }}
                                            />
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
                                {mediaUploads.length > 0 && (
                                    <div className="upload-progress-list">
                                        {mediaUploads.map((u) => (
                                            <div key={u.id} className="upload-progress-card">
                                                <div className="upload-progress-meta">
                                                    <span>{u.name}</span>
                                                    <div className="upload-progress-actions">
                                                        <span>{u.error ? t('uploadFailed') : `${u.progress}%`}</span>
                                                        {!u.error && u.progress < 100 && (
                                                            <button
                                                                type="button"
                                                                className="upload-progress-cancel"
                                                                onClick={() => cancelMediaUpload(u.id)}
                                                                aria-label="Cancel upload"
                                                            >
                                                                <X size={12} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="upload-progress-track">
                                                    <div className="upload-progress-fill" style={{ width: `${u.error ? 100 : u.progress}%` }} />
                                                </div>
                                                {u.error && <div className="upload-progress-error">{u.error}</div>}
                                            </div>
                                        ))}
                                    </div>
                                )}
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
                        <button className="lightbox-download" onClick={handleLightboxDownload} title={t('downloadMedia')} aria-label={t('downloadMedia')}>
                            <Download size={18} />
                        </button>
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
                {manageDownloadsOpen && (
                    <ManageDownloadsModal
                        gameId={game.id}
                        token={token}
                        currentUser={currentUser}
                        t={t}
                        onClose={() => setManageDownloadsOpen(false)}
                        onDownloadsUpdated={(data) => {
                            setGame(prev => ({ ...prev, ...data }));
                            onGameUpdated(data);
                        }}
                    />
                )}
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

    // Handle custom DOM event to open a specific game (e.g. from Notifications)
    useEffect(() => {
        const handleOpenGameEvent = (e) => {
            const gameId = e.detail?.gameId;
            if (!gameId) return;
            const targetGame = games.find(g => g.id === gameId);
            if (targetGame) {
                openGame(targetGame);
            }
        };
        window.addEventListener('cooplyst:open_game', handleOpenGameEvent);
        return () => window.removeEventListener('cooplyst:open_game', handleOpenGameEvent);
    }, [games, openGame]);
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
