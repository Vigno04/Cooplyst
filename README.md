# Cooplyst

A gaming group management platform for proposing games, voting, managing runs, and sharing media.

## Version

Current release target: `v0.1.0`

## Local run

1. Copy env template:
	- `cp .env.example .env`
2. Set a strong JWT secret in `.env`.
3. Start stack:
	- `docker compose up -d --build`

Frontend is served on `http://localhost:3000`.

## Security before publishing

- Never commit `.env` files with real secrets.
- Never commit DB/runtime data from `server/data`.
- Rotate credentials if you accidentally exposed them in git history.

## GitHub release + Docker images

This repo includes workflow [docker-release.yml](.github/workflows/docker-release.yml) that builds and pushes Docker images to GHCR when a tag like `v0.1.0` is pushed.

Published images:

- `ghcr.io/<owner>/cooplyst-frontend:v0.1.0`
- `ghcr.io/<owner>/cooplyst-backend:v0.1.0`

Create release:

1. Commit changes.
2. Tag release:
	- `git tag -a v0.1.0 -m "First public release"`
3. Push branch + tag:
	- `git push origin main --tags`
4. Create GitHub release from tag `v0.1.0`.

## Deploy on your server (compose)

Use [docker-compose.server.yml](docker-compose.server.yml) on your server.

1. Create `.env` on server with:
	- `GHCR_OWNER=<your-github-user-or-org>`
	- `JWT_SECRET=<strong-random-secret>`
2. Pull and run:
	- `docker compose -f docker-compose.server.yml pull`
	- `docker compose -f docker-compose.server.yml up -d`

Data persists in volume `cooplyst_data`.
