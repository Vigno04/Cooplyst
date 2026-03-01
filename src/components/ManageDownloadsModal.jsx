import { useState, useEffect, useCallback } from 'react';
import { X, Loader2, Upload, Trash2, Download } from 'lucide-react';
import magnetIcon from '../assets/magnet-icon.png';
import torrentIcon from '../assets/download-icon.png';
import CustomSelect from './CustomSelect';

export default function ManageDownloadsModal({ gameId, token, currentUser, onClose, t, onDownloadsUpdated }) {
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
