import { useState } from 'react';
import { Gamepad2, ThumbsUp, ThumbsDown, Star, Link, Check } from 'lucide-react';
import StatusBadge from './StatusBadge';

function copyToClipboard(text) {
    if (navigator.clipboard?.writeText) {
        return navigator.clipboard.writeText(text);
    }
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
    } catch { /* ignore */ }
    return Promise.resolve();
}

export default function GameCard({ game, onClick, t }) {
    const [copied, setCopied] = useState(false);
    const showMedian = game.status === 'completed' && game.median_rating !== null && game.median_rating !== undefined;
    const showVotes = game.status === 'proposed' || game.status === 'voting';

    const handleShare = (e) => {
        e.stopPropagation();
        // Preserve the current view prefix (#/completed or empty) for context-aware links
        const viewPrefix = /^#\/completed/.test(window.location.hash) ? '#/completed' : '';
        const url = `${window.location.origin}${window.location.pathname}${viewPrefix}/game/${game.id}`;
        const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1500); };
        copyToClipboard(url).then(done).catch(() => done());
    };

    return (
        <div className="game-card" onClick={() => onClick(game)}>
            <div className="game-card-cover-wrap">
                {game.cover_url ? (
                    <img src={game.cover_url} alt={game.title} className="game-card-cover" loading="lazy" />
                ) : (
                    <div className="game-card-cover game-card-cover--placeholder">
                        <Gamepad2 size={40} />
                    </div>
                )}
                <button
                    className={`game-card-share-btn${copied ? ' game-card-share-btn--copied' : ''}`}
                    onClick={handleShare}
                    title={copied ? (t('linkCopied') || 'Copied!') : (t('shareGame') || 'Copy link')}
                    aria-label={t('shareGame') || 'Copy link'}
                >
                    {copied ? <Check size={11} /> : <Link size={11} />}
                </button>
            </div>
            <div className="game-card-body">
                <h3 className="game-card-title">{game.title}</h3>
                {game.genre && <p className="game-card-genre">{game.genre}</p>}
                <div className="game-card-footer">
                    <StatusBadge status={game.status} t={t} />
                    {showMedian ? (
                        <span className="game-card-median" title={t('medianRating')}>
                            <Star size={13} /> {Number(game.median_rating).toFixed(1)}
                        </span>
                    ) : showVotes ? (
                        <span className="game-card-votes">
                            <ThumbsUp size={13} /> {game.votes_yes}
                            <ThumbsDown size={13} style={{ marginLeft: 6 }} /> {game.votes_no}
                        </span>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
