# CCTV Weather Analysis

Automated weather monitoring system that captures CCTV camera feeds from Kabupaten Banjar, Martapura, Indonesia, analyzes weather conditions using Google's Gemini AI, and publishes conversational weather reports to Telegram.

## Features

- **Automated CCTV Capture**: Browser automation using Playwright to capture live camera feeds
- **AI Weather Analysis**: Google Gemini Flash analyzes multiple images to determine weather conditions (raining, wet, or dry)
- **Telegram Integration**: Publishes weather reports with images to Telegram channels
- **Robust Error Handling**:
  - Exponential backoff retry mechanism
  - Transient vs permanent error classification
  - Graceful degradation with local storage fallback
- **Conversational Reports**: AI generates friendly, natural-language weather updates

## Project Structure

```
cctv-weather/
├── src/
│   ├── config/              # Configuration modules
│   │   ├── api.config.ts    # CCTV URL, capture settings
│   │   ├── browser.config.ts # Playwright configuration
│   │   ├── retry.config.ts  # Retry mechanism defaults
│   │   └── index.ts         # Config exports
│   │
│   ├── services/            # Application services
│   │   ├── capture/         # CCTV capture service
│   │   │   ├── capture.service.ts
│   │   │   ├── camera-selector.ts
│   │   │   └── video-capture.ts
│   │   ├── ai/              # AI analysis service
│   │   │   └── genai.service.ts
│   │   ├── messaging/       # Telegram service
│   │   │   ├── telegram.service.ts
│   │   │   └── media-handler.ts
│   │   └── scheduler/       # Task scheduler
│   │       └── scheduler.service.ts
│   │
│   ├── infrastructure/      # External integrations
│   │   ├── retry/           # Retry mechanism
│   │   │   ├── retry.service.ts
│   │   │   └── error-classifier.ts
│   │   └── storage/         # Local storage fallback
│   │       ├── fallback.service.ts
│   │       └── file-manager.ts
│   │
│   ├── types/               # TypeScript type definitions
│   │   ├── index.ts         # Shared types
│   │   └── retry.types.ts   # Retry-specific types
│   │
│   ├── utils/               # Utility functions
│   │   ├── filename.ts      # Filename sanitization
│   │   ├── logger.ts        # Logging utilities
│   │   └── sleep.ts         # Async helpers
│   │
│   ├── prompts/             # AI prompt templates
│   │   └── weather-analysis.ts
│   │
│   └── index.ts             # Main entry point
│
├── data/                    # Runtime data (gitignored)
│   ├── snapshots/           # Captured CCTV images
│   ├── failed_reports/      # Failed Telegram sends
│   └── logs/                # Application logs
│
├── docs/                    # Documentation
│   └── RETRY_MECHANISM.md
│
├── .env.example             # Environment variables template
├── package.json
└── tsconfig.json
```

## Prerequisites

- Node.js (v18 or higher)
- Chromium browser
- Google Generative AI API key
- Telegram bot token

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd cctv-weather
```

2. Install dependencies:
```bash
npm install
```

3. Install Playwright browsers:
```bash
npx playwright install chromium
```

4. Create environment file:
```bash
cp .env.example .env
```

5. Configure environment variables in `.env`:
```env
# Browser Configuration
CHROMIUM_PATH=/usr/bin/chromium
HEADLESS=false
BROWSER_CHANNEL=chrome

# Capture Configuration
TARGET_COUNT=3
OUTPUT_DIR=data/snapshots
MAX_RETRIES=2

# Google GenAI Configuration
GOOGLE_GENAI_API_KEY=your_google_genai_api_key_here
GOOGLE_GENAI_MODEL=models/gemini-flash-latest

# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
TELEGRAM_CHAT_ID=your_channel_or_chat_id

# Telegram Batching Configuration
TELEGRAM_BATCH_SIZE=5  # Max images per media group (1-10, default: 5)
```

## Usage

### Running with Docker (Recommended)

#### Production Mode (Scheduled, Long-Running)

The application runs as a scheduled service inside Docker. In production, the scheduler is **always enabled**:

```bash
# Start the service (production mode, scheduler enabled by default)
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the service
docker-compose down
```

The app will:
- Start and wait for the scheduled execution time
- Run the capture/analysis/reporting task at configured times
- Continue running and repeat on the next scheduled time
- Automatically restart if it crashes (Docker restart policy)

#### Development Mode (Immediate Execution)

For development/testing, you can disable the scheduler to run immediately:

```bash
# Set in .env
NODE_ENV=development
ENABLE_SCHEDULER=  # Leave empty or set to 'false'

# Or use environment variable override
NODE_ENV=development docker-compose up
```

This will:
- Run the task immediately on startup
- Exit after completion (no scheduling)
- Useful for testing and debugging

### Schedule Configuration

Configure the execution schedule in `.env`:

```env
# Run once daily at 5:00 AM Asia/Makassar time (WITA, GMT+8)
SCHEDULE_TIMES=05:00
TZ=Asia/Makassar
```

**Multiple times per day:**
```env
# Run at 5:00 AM and 5:00 PM (use 17:00, not 05:00 PM)
SCHEDULE_TIMES=05:00,17:00
TZ=Asia/Makassar
```

**Other examples:**
```env
# Three times daily
SCHEDULE_TIMES=06:00,12:00,18:00

# Different timezone (Jakarta - WIB, GMT+7)
SCHEDULE_TIMES=05:00
TZ=Asia/Jakarta
```

**Important notes:**
- Times are in **24-hour format** (HH:MM)
- Use `17:00` for 5:00 PM, not `05:00 PM`
- All times run **daily** (same times every day)
- Times are comma-separated with no spaces
- Timezone uses IANA identifiers (e.g., `Asia/Makassar`, `Asia/Jakarta`)

The scheduler automatically converts your local times to UTC internally.

### Development Mode

Development mode enables debug features for troubleshooting:

```bash
# Set NODE_ENV in .env
NODE_ENV=development

# Rebuild and restart
docker-compose up -d --build
```

**Debug Features:**
- Saves captured images to `data/captures/` with timestamps
- Logs AI token usage for cost monitoring
- Useful for verifying camera captures before AI analysis

### Running Locally (Without Docker)

For local development and testing:

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chrome

# Configure .env file
cp .env.example .env
# Edit .env with your configuration
```

**Immediate mode (run once and exit):**
```bash
# Set in .env
NODE_ENV=development
ENABLE_SCHEDULER=  # Leave empty

# Run
npm start
```

**Scheduled mode (long-running):**
```bash
# Set in .env
NODE_ENV=development
ENABLE_SCHEDULER=true

# Run
npm start
```

**Development mode with auto-restart:**
```bash
npm run dev
```

## How It Works

### Scheduling System

The application runs continuously as a long-running service:

1. **Initialization**:
   - Reads `SCHEDULE_TIMES` (comma-separated times in HH:MM format) and `TZ` (IANA timezone)
   - Converts each time from your timezone to UTC for scheduling
   - Creates a daily scheduled task for each specified time
   - Starts the scheduler and waits for scheduled execution times

2. **Scheduled Execution**:
   - At each scheduled time, executes the capture/analysis/reporting workflow
   - Logs all execution details with timestamps (both UTC and local time)
   - Continues running even if a task fails (for resilience)
   - Waits for the next scheduled time

3. **Graceful Shutdown**:
   - Handles SIGTERM and SIGINT signals
   - Stops all scheduled tasks cleanly
   - Ensures no orphaned processes

### Task Execution Workflow

Each scheduled execution runs the following phases:

1. **Capture Phase**:
   - Navigates to https://cctv.banjarkab.go.id/grid
   - Selects online cameras from camera list
   - Automatically paginates through multiple pages if `TARGET_COUNT` exceeds cameras on current page
   - Captures video frames from configured number of cameras
   - Retries failed captures with exponential backoff
   - Enforces capture timeout to prevent indefinite hangs

2. **Analysis Phase**:
   - Sends captured images to Google Gemini AI
   - AI analyzes weather conditions using custom prompts
   - Generates conversational weather updates
   - Falls back to default message on AI failure

3. **Telegram Phase**:
   - Sends images as media groups (configurable batch size via `TELEGRAM_BATCH_SIZE`, default: 5)
   - Automatically splits large image sets into multiple batches if needed
   - Sends analysis text with markdown formatting
   - Retries failed sends with exponential backoff
   - Falls back to local storage if Telegram fails

### Execution Status

Each task execution logs its status:

- **Complete success**: Capture, analysis, and Telegram send all succeeded
- **Partial success**: Capture/analysis succeeded, but Telegram failed (saved locally)
- **Total failure**: Capture or analysis failed (no data to send)

## Retry Mechanism

The project implements robust retry logic with:

- **Transient Error Detection**: Network errors, timeouts, HTTP 429/500/502/503/504
- **Permanent Error Detection**: Authentication failures, 400/401/403/404 errors
- **Exponential Backoff**:
  - Browser operations: 2s, 4s, 8s
  - AI operations: 2min, 4min, 8min
  - Telegram operations: 2min, 4min, 8min

See [docs/RETRY_MECHANISM.md](docs/RETRY_MECHANISM.md) for detailed documentation.

## Graceful Degradation

If Telegram sending fails after all retries, the system:

1. Saves the report locally to `data/failed_reports/[timestamp]/`
2. Creates a structured directory with:
   - `analysis.txt` - Weather analysis
   - `error.log` - Error details
   - `images/` - Captured images
   - `images_metadata.json` - Image metadata
   - `README.txt` - Summary and next steps

## Configuration

### Environment Settings

Set in `.env`:
- `NODE_ENV`: Environment mode (`production` or `development`)
  - **Production**: Scheduler always enabled, minimal logging
  - **Development**: Scheduler controlled by `ENABLE_SCHEDULER`, debug logging enabled
- `ENABLE_SCHEDULER`: Control scheduler behavior
  - **In production**: Ignored (scheduler always enabled)
  - **In development**:
    - `true`, `1`, or `yes` = Scheduled mode (long-running)
    - Unset or `false` = Immediate mode (run once and exit)

### Schedule Settings

Set in `.env`:
- `SCHEDULE_TIMES`: Comma-separated times in 24-hour format (default: `05:00`)
- `TZ`: IANA timezone identifier (default: `Asia/Makassar`)

**Time format:**
- Use 24-hour format: `HH:MM`
- Multiple times separated by commas: `05:00,17:00`
- Times run daily (same times every day)

**Timezone examples:**
- `Asia/Makassar` - WITA (GMT+8): Makassar, Banjarmasin, Balikpapan
- `Asia/Jakarta` - WIB (GMT+7): Jakarta, Bandung, Surabaya
- `Asia/Jayapura` - WIT (GMT+9): Jayapura, Manokwari
- `Asia/Singapore` - SGT (GMT+8)
- `Asia/Manila` - PHT (GMT+8)
- `UTC` - Universal Coordinated Time

**Complete list:** See [IANA timezone database](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones)

### Browser Settings

Edit `src/config/browser.config.ts` or set environment variables:
- `CHROMIUM_PATH`: Path to Chromium executable
- `HEADLESS`: Run browser in headless mode (true/false)
- `PAGE_LOAD_TIMEOUT`: Page load timeout in milliseconds (default: 90000)
- `SELECTOR_TIMEOUT`: Element selector timeout in milliseconds (default: 30000)
- `VIDEO_INIT_WAIT`: Wait time for videos to initialize (default: 5000)
- `VIDEO_READY_TIMEOUT`: Timeout for video ready state (default: 5000)
- `CAPTURE_TIMEOUT`: Maximum time to capture a single camera in milliseconds (default: 20000)

### Capture Settings

Edit `src/config/api.config.ts` or set environment variables:
- `TARGET_COUNT`: Number of cameras to capture (default: 3)
- `MAX_RETRIES`: Camera capture retry attempts (default: 2)
- `OUTPUT_DIR`: Directory for snapshots (default: data/snapshots)

### Retry Settings

Edit `src/config/retry.config.ts` to customize retry behavior for:
- AI operations
- Telegram API calls
- Browser capture operations

## Development

### Type Safety

The project uses strict TypeScript configuration with:
- Strict null checks
- No implicit any
- Consistent casing in file names
- ES Module interoperability

### Adding New Features

1. **New Service**: Add to `src/services/[domain]/`
2. **New Configuration**: Add to `src/config/`
3. **New Types**: Add to `src/types/`
4. **New Utility**: Add to `src/utils/`

### Code Organization Principles

- **Separation of Concerns**: Clear boundaries between layers
- **Single Responsibility**: Each module has one focused purpose
- **DRY Principle**: Shared types and utilities centralized
- **Dependency Injection**: Services use configuration modules

## Logging

Logs are written to `data/logs/`:
- `retry.log`: Retry attempt logs
- `telegram_errors.log`: Telegram notification failures

## Troubleshooting

### Build Errors
```bash
# Clean and rebuild
rm -rf dist
npm run build
```

### Browser Not Found
```bash
# Install Playwright browsers
npx playwright install chromium

# Or set custom path in .env
CHROMIUM_PATH=/path/to/chromium
```

### Telegram Send Failures

Check `data/failed_reports/` for locally saved reports. Each directory contains:
- Full analysis and images
- Error details
- Manual retry instructions

### AI Analysis Failures

The system falls back to a default message. Check:
- Google GenAI API key is valid
- API quota is not exceeded
- Network connectivity

## License

[MIT](LICENSE)

## Contributing

1. Follow existing code organization patterns
2. Maintain type safety (no `any` types)
3. Add tests for new features
4. Update documentation

## Acknowledgments

- CCTV feeds provided by Kabupaten Banjar
- Weather analysis powered by Google Gemini AI
- Browser automation by Playwright
