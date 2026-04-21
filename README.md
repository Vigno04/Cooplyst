<div align="center">
  <h1><img src="https://github.com/Vigno04/Cooplyst/blob/main/src/assets/cooplyst-icon.png?raw=true" width="48" style="vertical-align: middle; margin-right: 12px; border-radius: 8px;"> Cooplyst</h1>
  <p><strong>A self-hosted gaming group management platform</strong></p>

  [![Version](https://img.shields.io/github/v/release/vigno04/cooplyst)](https://github.com/vigno04/cooplyst/releases)
  [![License](https://img.shields.io/github/license/vigno04/cooplyst)](LICENSE)
  [![Last Commit](https://img.shields.io/github/last-commit/vigno04/cooplyst/main)](https://github.com/vigno04/cooplyst/commits/main)
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

## Images
<div align="center">

<table>
  <tr>
    <td align="center">
      <img src="https://github.com/Vigno04/Cooplyst/blob/main/readme-images/main-page.png?raw=true" height="250">
    </td>
    <td align="center">
      <img src="https://github.com/Vigno04/Cooplyst/blob/main/readme-images/automatic-search.png?raw=true" height="250">
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="https://github.com/Vigno04/Cooplyst/blob/main/readme-images/game-modal.png?raw=true" height="250">
    </td>
    <td align="center">
      <img src="https://github.com/Vigno04/Cooplyst/blob/main/readme-images/played-game-view.png?raw=true" height="250">
    </td>
  </tr>
</table>

</div>

## Getting Started

The easiest way to run Cooplyst locally is with Docker Compose.

```yaml
services:
    cooplyst:
        image: ghcr.io/vigno04/cooplyst:main
        env_file:
            - .env
        ports:
            - "3000:80"
        environment:
            - JWT_SECRET=${JWT_SECRET}
            - NODE_ENV=production
        volumes:
            - ./cooplyst_data:/app/data
        restart: unless-stopped
```

Then open [http://localhost:3000](http://localhost:3000) in your browser. Look in the console for the admin credentials.

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
