import { Gamepad2, ThumbsUp, ThumbsDown, Star } from 'lucide-react';
import StatusBadge from './StatusBadge';

export default function GameCard({ game, onClick, t }) {
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
