import { useState, useMemo } from 'react';
import { Trophy, Star, ThumbsUp, Users, Play, Image as ImageIcon, ArrowUpDown, Calendar, User } from 'lucide-react';
import GameCard from './GameCard';
import CustomSelect from './CustomSelect';

function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, amount) {
    return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function getMonthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(date) {
    return date.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
}

function formatYearLabel(year) {
    return String(year);
}

function getCompletedGameDate(game) {
    if (game.completed_on && /^\d{4}-\d{2}-\d{2}$/.test(game.completed_on)) {
        return new Date(`${game.completed_on}T00:00:00`);
    }
    if (game.status_changed_at) {
        return new Date(game.status_changed_at * 1000);
    }
    if (game.proposed_at) {
        return new Date(game.proposed_at * 1000);
    }
    return new Date(0);
}

function getStartedGameDate(game) {
    if (game.started_on && /^\d{4}-\d{2}-\d{2}$/.test(game.started_on)) {
        return new Date(`${game.started_on}T00:00:00`);
    }
    return getCompletedGameDate(game);
}

export default function CompletedView({ completedGames, openGame, t }) {
    const [sortBy, setSortBy] = useState('dateDesc');
    const [chartType, setChartType] = useState('completed');
    const [chartRange, setChartRange] = useState('12');

    const stats = useMemo(() => {
        if (!completedGames || completedGames.length === 0) return null;

        let totalGames = completedGames.length;
        let sumVotes = 0;
        let countVotes = 0;

        let mostVotedGame = null;
        let maxRating = -1;

        let mostRunsGame = null;
        let maxRuns = -1;

        let mostPlayersGame = null;
        let maxPlayers = -1;

        let mostMediaGame = null;
        let maxMedia = -1;

        let mostActivePlayer = null;
        const playerCounts = {}; // user_id -> { count, username }

        const periodCounts = {};
        let latestPeriodDate = null;
        let earliestPeriodDate = null;

        completedGames.forEach(g => {
            // average vote calc
            if (g.median_rating !== null && g.median_rating !== undefined) {
                sumVotes += Number(g.median_rating);
                countVotes++;
            }

            // highest rated completed game
            if (g.median_rating !== null && g.median_rating !== undefined) {
                const rating = Number(g.median_rating);
                if (rating > maxRating) {
                    maxRating = rating;
                    mostVotedGame = g;
                }
            }

            // most runs
            if (g.runs_count !== undefined && g.runs_count > maxRuns) {
                maxRuns = g.runs_count;
                mostRunsGame = g;
            }

            // most players
            const pCount = Array.isArray(g.players) ? g.players.length : 0;
            if (pCount > maxPlayers) {
                maxPlayers = pCount;
                mostPlayersGame = g;
            }

            // most media
            if (g.media_count !== undefined && g.media_count > maxMedia) {
                maxMedia = g.media_count;
                mostMediaGame = g;
            }

            // most active player
            if (Array.isArray(g.players)) {
                g.players.forEach(p => {
                    if (!playerCounts[p.user_id]) {
                        playerCounts[p.user_id] = { count: 0, username: p.username };
                    }
                    playerCounts[p.user_id].count++;
                });
            }

            // periods
            if (chartType === 'releaseYear') {
                const releaseYear = Number(g.release_year);
                if (Number.isFinite(releaseYear) && releaseYear > 0) {
                    if (!latestPeriodDate || releaseYear > latestPeriodDate) latestPeriodDate = releaseYear;
                    if (!earliestPeriodDate || releaseYear < earliestPeriodDate) earliestPeriodDate = releaseYear;
                    const pKey = String(releaseYear);
                    if (!periodCounts[pKey]) periodCounts[pKey] = 0;
                    periodCounts[pKey]++;
                }
            } else {
                const periodDate = chartType === 'started' ? getStartedGameDate(g) : getCompletedGameDate(g);
                const periodMonth = startOfMonth(periodDate);

                if (!latestPeriodDate || periodMonth > latestPeriodDate) latestPeriodDate = periodMonth;
                if (!earliestPeriodDate || periodMonth < earliestPeriodDate) earliestPeriodDate = periodMonth;

                const pKey = getMonthKey(periodMonth);
                if (!periodCounts[pKey]) periodCounts[pKey] = 0;
                periodCounts[pKey]++;
            }
        });

        const avgVote = countVotes > 0 ? (sumVotes / countVotes).toFixed(1) : '-';

        let maxPlayerCount = -1;
        for (const uid in playerCounts) {
            if (playerCounts[uid].count > maxPlayerCount) {
                maxPlayerCount = playerCounts[uid].count;
                mostActivePlayer = playerCounts[uid];
            }
        }

        const chartData = [];
        if (chartType === 'releaseYear') {
            const chartStartYear = earliestPeriodDate;
            const chartEndYear = latestPeriodDate;
            if (chartStartYear && chartEndYear) {
                for (let year = chartStartYear; year <= chartEndYear; year++) {
                    const key = String(year);
                    chartData.push({
                        key,
                        label: formatYearLabel(year),
                        count: periodCounts[key] || 0,
                    });
                }
            }
        } else {
            const rangeMonths = chartRange === 'all' ? null : Number(chartRange);
            const chartEnd = latestPeriodDate || startOfMonth(new Date());
            const chartStart = rangeMonths
                ? addMonths(chartEnd, -(rangeMonths - 1))
                : (earliestPeriodDate || chartEnd);

            for (let cursor = new Date(chartStart); cursor <= chartEnd; cursor = addMonths(cursor, 1)) {
                const key = getMonthKey(cursor);
                chartData.push({
                    key,
                    label: formatMonthLabel(cursor),
                    count: periodCounts[key] || 0,
                });
            }
        }

        const maxChartCount = chartData.length > 0 ? Math.max(...chartData.map(d => d.count)) : 0;

        return {
            totalGames,
            avgVote,
            mostVotedGame,
            mostRunsGame,
            mostPlayersGame,
            mostMediaGame,
            mostActivePlayer,
            chartData,
            maxChartCount,
        };
    }, [completedGames, chartRange, chartType]);

    const sortedList = useMemo(() => {
        const arr = [...completedGames];
        return arr.sort((a, b) => {
            const timeA = getCompletedGameDate(a).getTime();
            const timeB = getCompletedGameDate(b).getTime();
            const voteA = a.median_rating !== null ? Number(a.median_rating) : 0;
            const voteB = b.median_rating !== null ? Number(b.median_rating) : 0;

            switch (sortBy) {
                case 'dateDesc': return timeB - timeA;
                case 'dateAsc': return timeA - timeB;
                case 'voteDesc': return voteB - voteA;
                case 'voteAsc': return voteA - voteB;
                default: return timeB - timeA;
            }
        });
    }, [completedGames, sortBy]);

    if (!stats) {
        return <div className="completed-view-empty"><p className="board-empty board-empty--center">{t('noCompleted')}</p></div>;
    }

    return (
        <div className="completed-view">
            <div className="completed-stats-header">
                <h2 className="completed-stats-title"><Trophy size={20} /> {t('completedStats')}</h2>
            </div>

            <div className="completed-stats-grid">
                <div className="completed-stat-card">
                    <div className="completed-stat-icon"><Trophy size={24} /></div>
                    <div className="completed-stat-info">
                        <span className="completed-stat-label">{t('statsTotalGames')}</span>
                        <span className="completed-stat-value">{stats.totalGames}</span>
                    </div>
                </div>
                <div className="completed-stat-card">
                    <div className="completed-stat-icon" style={{ color: 'var(--accent)' }}><Star size={24} /></div>
                    <div className="completed-stat-info">
                        <span className="completed-stat-label">{t('statsAverageVote')}</span>
                        <span className="completed-stat-value">{stats.avgVote}</span>
                    </div>
                </div>
                <div className="completed-stat-card" onClick={() => stats.mostVotedGame && openGame(stats.mostVotedGame)} style={{ cursor: stats.mostVotedGame ? 'pointer' : 'default' }}>
                    <div className="completed-stat-icon"><ThumbsUp size={24} /></div>
                    <div className="completed-stat-info">
                        <span className="completed-stat-label">{t('statsMostVoted')}</span>
                        <span className="completed-stat-value truncate">{stats.mostVotedGame?.title || '-'}</span>
                    </div>
                </div>
                <div className="completed-stat-card" onClick={() => stats.mostRunsGame && openGame(stats.mostRunsGame)} style={{ cursor: stats.mostRunsGame ? 'pointer' : 'default' }}>
                    <div className="completed-stat-icon"><Play size={24} /></div>
                    <div className="completed-stat-info">
                        <span className="completed-stat-label">{t('statsMostRuns')}</span>
                        <span className="completed-stat-value truncate">{stats.mostRunsGame?.title || '-'}</span>
                    </div>
                </div>
                <div className="completed-stat-card" onClick={() => stats.mostPlayersGame && openGame(stats.mostPlayersGame)} style={{ cursor: stats.mostPlayersGame ? 'pointer' : 'default' }}>
                    <div className="completed-stat-icon"><Users size={24} /></div>
                    <div className="completed-stat-info">
                        <span className="completed-stat-label">{t('statsMostPlayers')}</span>
                        <span className="completed-stat-value truncate">{stats.mostPlayersGame?.title || '-'}</span>
                    </div>
                </div>
                <div className="completed-stat-card" onClick={() => stats.mostMediaGame && openGame(stats.mostMediaGame)} style={{ cursor: stats.mostMediaGame ? 'pointer' : 'default' }}>
                    <div className="completed-stat-icon"><ImageIcon size={24} /></div>
                    <div className="completed-stat-info">
                        <span className="completed-stat-label">{t('statsMostMedia')}</span>
                        <span className="completed-stat-value truncate">{stats.mostMediaGame?.title || '-'}</span>
                    </div>
                </div>
                <div className="completed-stat-card">
                    <div className="completed-stat-icon"><User size={24} /></div>
                    <div className="completed-stat-info">
                        <span className="completed-stat-label">{t('statsMostActivePlayer', 'Most Active')}</span>
                        <span className="completed-stat-value truncate">{stats.mostActivePlayer?.username || '-'}</span>
                    </div>
                </div>
            </div>

            {stats.chartData.length > 0 && (
                <div className="completed-chart-container">
                    <div className="completed-chart-header">
                        <h3 className="completed-chart-title"><Calendar size={16} /> {t('statsCompletedChart')}</h3>
                        <div className="completed-chart-controls">
                            <div className="completed-chart-range">
                                <span className="completed-chart-range-label">{t('statsChartType')}</span>
                                <CustomSelect
                                    value={chartType}
                                    onChange={setChartType}
                                    options={[
                                        { value: 'completed', label: t('statsChartTypeCompleted') },
                                        { value: 'started', label: t('statsChartTypeStarted') },
                                        { value: 'releaseYear', label: t('statsChartTypeReleaseYear') },
                                    ]}
                                />
                            </div>
                            {chartType !== 'releaseYear' && (
                                <div className="completed-chart-range">
                                    <span className="completed-chart-range-label">{t('statsChartRange')}</span>
                                    <CustomSelect
                                        value={chartRange}
                                        onChange={setChartRange}
                                        options={[
                                            { value: '3', label: t('statsRange3Months') },
                                            { value: '6', label: t('statsRange6Months') },
                                            { value: '12', label: t('statsRange12Months') },
                                            { value: 'all', label: t('statsRangeAll') },
                                        ]}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="completed-chart">
                        {stats.chartData.map((d, i) => {
                            const heightPercent = stats.maxChartCount > 0 ? (d.count / stats.maxChartCount) * 100 : 0;
                            return (
                                <div key={d.key || i} className="completed-chart-bar-wrap" title={`${d.label}: ${d.count}`}>
                                    <div className="completed-chart-bar-value">{d.count > 0 ? d.count : ''}</div>
                                    <div className="completed-chart-bar-fill" style={{ height: `${Math.max(heightPercent, d.count > 0 ? 6 : 0)}%` }}></div>
                                    <div className="completed-chart-bar-label">{d.label}</div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className="completed-list-controls">
                <div className="completed-sort-box">
                    <ArrowUpDown size={14} className="completed-sort-icon" />
                    <CustomSelect
                        value={sortBy}
                        onChange={setSortBy}
                        options={[
                            { value: 'dateDesc', label: t('orderByDateDesc') },
                            { value: 'dateAsc', label: t('orderByDateAsc') },
                            { value: 'voteDesc', label: t('orderByVoteDesc') },
                            { value: 'voteAsc', label: t('orderByVoteAsc') }
                        ]}
                    />
                </div>
            </div>

            <div className="completed-grid">
                {sortedList.map(g => <GameCard key={g.id} game={g} onClick={openGame} t={t} />)}
            </div>
        </div>
    );
}
