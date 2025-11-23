# Docker Deployment Guide

This guide explains how to deploy the CCTV Weather Analysis project using Docker.

## Overview

The project uses the official Playwright Docker image with Chrome browser support, which includes the H.264 codec necessary for CCTV video stream playback.

## Prerequisites

- Docker installed ([Install Docker](https://docs.docker.com/get-docker/))
- Docker Compose installed ([Install Docker Compose](https://docs.docker.com/compose/install/))
- Your `.env` file configured with API keys and tokens

## Quick Start

### 1. Configure Environment Variables

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env` and configure:
- `GOOGLE_GENAI_API_KEY` - Your Google Gemini API key
- `TELEGRAM_BOT_TOKEN` - Your Telegram bot token
- `TELEGRAM_CHAT_ID` - Your Telegram chat/channel ID
- `CCTV_URL` - Your CCTV grid URL
- Other settings as needed

### 2. Build and Run

```bash
# Build and start the container
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the container
docker-compose down
```

## Configuration

### Headless Mode

By default, Docker runs in headless mode. To change this, edit `docker-compose.yml` or set in `.env`:

```env
HEADLESS=true  # Default for Docker
```

### Browser Channel

The Docker setup automatically uses Chrome (not Chromium) because CCTV streams require H.264 codec support:

```yaml
environment:
  - BROWSER_CHANNEL=chrome  # Uses Chrome from Playwright image
```

### Resource Limits

Default memory limits are set in `docker-compose.yml`:

```yaml
deploy:
  resources:
    limits:
      memory: 2G      # Maximum memory
    reservations:
      memory: 512M    # Reserved memory
```

Adjust these based on your system and the number of cameras you're capturing.

### Data Persistence

Three volumes are mounted for persistent data:

- `./data/snapshots` - Captured CCTV images
- `./data/captures` - Debug captures (when NODE_ENV=development)
- `./logs` - Application logs

## Manual Docker Build

If you prefer not to use Docker Compose:

```bash
# Build the image
docker build -t cctv-weather .

# Run the container
docker run -d \
  --name cctv-weather \
  --ipc=host \
  --env-file .env \
  -v $(pwd)/data/snapshots:/app/data/snapshots \
  -v $(pwd)/data/captures:/app/data/captures \
  -v $(pwd)/logs:/app/logs \
  cctv-weather
```

## Important Notes

### IPC Host Mode

The `ipc: host` setting is required for Chrome to avoid memory issues:

```yaml
ipc: host  # Prevents Chrome from running out of memory
```

### Security Context

The container runs as non-root user `pwuser` for security:

```dockerfile
USER pwuser
```

### Chrome vs Chromium

The Docker image uses **Chrome** (not Chromium) because:
- CCTV streams typically use H.264 codec
- Chromium lacks H.264 support due to licensing
- Chrome includes proprietary codecs
- This is why we set `BROWSER_CHANNEL=chrome`

See [Playwright Docker Documentation](https://playwright.dev/docs/docker) for more details.

## Troubleshooting

### Out of Memory Errors

If Chrome crashes with OOM errors:

1. Increase memory limits in `docker-compose.yml`
2. Ensure `ipc: host` is set
3. Reduce `TARGET_COUNT` to capture fewer cameras

### Video Not Playing

If CCTV videos aren't loading:

1. Verify `BROWSER_CHANNEL=chrome` is set
2. Check network connectivity from container
3. Increase timeouts in `.env` if needed

### Permission Errors

If you see permission errors with mounted volumes:

```bash
# Fix permissions
sudo chown -R 1000:1000 data/
```

The `pwuser` in the container has UID 1000.

## Scheduled Runs

To run the capture on a schedule, use cron or a container orchestrator:

### Using Cron (Host)

```bash
# Edit crontab
crontab -e

# Run every hour
0 * * * * cd /path/to/cctv-weather && docker-compose up
```

### Using Docker with Cron

Create a cron container that triggers the main container on a schedule.

## Production Deployment

For production deployments:

1. Use environment-specific `.env` files
2. Set up log rotation for `./logs`
3. Monitor container health
4. Consider using Docker Swarm or Kubernetes for orchestration
5. Set up alerts for failed captures

## Environment Variables Reference

See `.env.example` for a complete list of configurable environment variables.

## Support

For issues related to:
- Docker setup: Check [Docker Documentation](https://docs.docker.com/)
- Playwright in Docker: Check [Playwright Docker Guide](https://playwright.dev/docs/docker)
- Project-specific issues: See main README.md
