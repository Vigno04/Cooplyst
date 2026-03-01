import { useState, useEffect, useCallback } from 'react';
import { Plus, Gamepad2, Trophy, Clock, Play, ChevronRight, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import GameCard from '../components/GameCard';
import GameDetailModal from '../components/GameDetailModal';
import ProposeGameModal from '../components/ProposeGameModal';

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
