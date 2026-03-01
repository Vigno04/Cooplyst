export default function StatusBadge({ status, t }) {
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
