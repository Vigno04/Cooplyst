import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Star, ThumbsUp, ThumbsDown, Gamepad2, Play, CheckCircle, Upload, Trash2, Loader2, Image as ImageIcon, Users, User, UserPlus, UserMinus, RotateCcw, ExternalLink, Tag, MoreVertical, RefreshCcw, Edit3, Download, Clock, AlertCircle } from 'lucide-react';
import { uploadChunked } from '../uploadWithProgress';
import magnetIcon from '../assets/magnet-icon.png';
import torrentIcon from '../assets/download-icon.png';
import CustomSelect from './CustomSelect';
import StatusBadge from './StatusBadge';
import AdminMetadataEditor from './AdminMetadataEditor';
import ManageDownloadsModal from './ManageDownloadsModal';

export default function GameDetailModal({ game: initialGame, token, currentUser, onClose, onGameUpdated, t }) {
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
