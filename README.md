<div align="center">
  <h1>Cooplyst</h1>
  <p><strong>A self-hosted gaming group management platform</strong></p>

  [![Version](https://img.shields.io/github/v/release/vigno04/cooplyst)](https://github.com/vigno04/cooplyst/releases)
  [![License](https://img.shields.io/github/license/vigno04/cooplyst)](LICENSE)
  [![Last Commit](https://img.shields.io/github/last-commit/vigno04/cooplyst/develop)](https://github.com/vigno04/cooplyst/commits/develop)
</div>

## What is Cooplyst?

Cooplyst is a self-hosted platform built for gaming groups. Propose games, vote on what to play next, track runs, and share screenshots and clips — all in one place, on your own infrastructure with full data ownership.

- **Game board** — kanban-style view across proposed, backlog, playing, and completed states
- **Voting** — members propose games and vote them into the backlog
- **Run tracking** — log play sessions with start/end dates and player rosters
- **Ratings** — per-member star ratings with group median on completed games
- **Media gallery** — upload screenshots and videos, grouped by run or uploader, with a fullscreen lightbox viewer
- **Notifications** — get notified when it's time to rate a completed game
- **SSO support** — optional Authentik OIDC integration alongside local auth
- **i18n** — English and Italian included out of the box

## Getting Started

The easiest way to run Cooplyst locally is with Docker Compose.

```bash
cp .env.example .env
# Edit .env and set a strong JWT_SECRET
docker compose up -d --build
```

Then open [http://localhost:3000](http://localhost:3000) in your browser. Look in the console for the admin credentials.

## Deploy on Your Server

Use [docker-compose.server.yml](docker-compose.server.yml) on your server to pull the pre-built image from GHCR.

1. Create a `.env` file with:

```env
JWT_SECRET=<strong-random-secret>
```

2. Pull and start:

```bash
docker compose -f docker-compose.server.yml pull
docker compose -f docker-compose.server.yml up -d
```

Data is persisted in the `cooplyst_data` Docker volume.

## Contributing

Contributions are welcome! Feel free to open issues for bugs or feature requests, or submit a pull request.

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

<div align="center">
  <p>Made with ❤️ for gaming groups everywhere</p>
  <p>
    <a href="https://github.com/vigno04/cooplyst">GitHub</a> •
    <a href="https://github.com/vigno04/cooplyst/issues">Issues</a>
  </p>
</div>
