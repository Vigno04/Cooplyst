import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

export default function AdminMetadataEditor({ open, game, token, onClose, onSaved, t }) {
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
