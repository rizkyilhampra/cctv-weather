# CCTV Weather Analysis

Automated weather monitoring system that captures CCTV camera feeds from two sources in South Kalimantan, Indonesia:
- **Kabupaten Banjar** (Banjarkab): https://cctv.banjarkab.go.id/grid
- **Kota Banjarbaru** (Banjarbaru): https://cctv.banjarbarukota.go.id/CCTV

The system analyzes weather conditions using Google's Gemini AI and publishes conversational weather reports to Telegram.

## Features

- **Dual-Source CCTV Capture**: Browser automation using Playwright to capture live feeds from both locations
- **Firefox Fallback**: Automatic retry with Firefox for HLS streams that fail in Chrome
- **AI Weather Analysis**: Google Gemini Flash analyzes multiple images to determine weather conditions (raining, wet, or dry)
- **Telegram Integration**: Publishes weather reports with images to Telegram channels
- **Scheduled Dual-Source Execution**: Configure different times for each CCTV source
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
- Chromium/Chrome browser (primary)
- Firefox browser (optional, for HLS fallback)
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
# Install Chrome (primary browser)
npx playwright install chrome

# Optional: Install Firefox for HLS fallback
npx playwright install firefox
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
ENABLE_FIREFOX_FALLBACK=true  # Auto-retry failed streams with Firefox

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

The Docker image includes both Chrome and Firefox browsers for maximum HLS stream compatibility.

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
- Automatically retry failed HLS streams with Firefox (enabled by default)
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

### Schedule Configuration (Dual-Source Mode)

The application supports monitoring two CCTV sources with independent schedules:

1. **Kabupaten Banjar (Banjarkab)**: https://cctv.banjarkab.go.id/grid
2. **Kota Banjarbaru (Banjarbaru)**: https://cctv.banjarbarukota.go.id/CCTV

#### Production Mode (Scheduled Execution)

In production, **exactly 2 times must be configured** in `SCHEDULE_TIMES`:

```env
# MUST have exactly 2 times
# Format: time1,time2
# First time = Banjarkab scraper
# Second time = Banjarbaru scraper
SCHEDULE_TIMES=05:00,15:00
TZ=Asia/Makassar
```

**Example execution:**
- 05:00 WITA (5:00 AM) → Captures from **Banjarkab**
- 15:00 WITA (3:00 PM) → Captures from **Banjarbaru**

**Other examples:**
```env
# Morning and evening
SCHEDULE_TIMES=06:00,18:00  → Banjarkab at 6 AM, Banjarbaru at 6 PM

# Early morning and afternoon
SCHEDULE_TIMES=07:00,14:00  → Banjarkab at 7 AM, Banjarbaru at 2 PM
```

**⚠️ Important:** The application will **exit with an error** if `SCHEDULE_TIMES` does not have exactly 2 values:
```env
# ✗ Invalid - only 1 time
SCHEDULE_TIMES=05:00

# ✗ Invalid - 3 times
SCHEDULE_TIMES=05:00,12:00,18:00

# ✓ Valid - exactly 2 times
SCHEDULE_TIMES=05:00,15:00
```

#### Immediate Mode (Manual Testing)

Test sources without scheduling:

```bash
# Test BOTH sources synchronously (when CCTV_SOURCE is unset/empty)
npm start

# Test individual sources only
CCTV_SOURCE=banjarkab npm start
CCTV_SOURCE=banjarbaru npm start

# Or use the predefined scripts
npm run start:banjarkab  # Banjarkab only
npm run start:banjarbaru  # Banjarbaru only
```

**Available scripts:**
- `npm start` - Run with scheduler (production) or immediate mode (development)
  - When scheduler disabled and `CCTV_SOURCE` unset: processes both sources
  - When scheduler disabled and `CCTV_SOURCE` set: processes only specified source
- `npm run start:banjarkab` - Test Banjarkab source immediately
- `npm run start:banjarbaru` - Test Banjarbaru source immediately
- `npm run dev` - Watch mode (respects `CCTV_SOURCE`)
  - When `CCTV_SOURCE` unset: processes both sources in watch mode
  - When `CCTV_SOURCE` set: processes only specified source in watch mode
- `npm run dev:banjarkab` - Watch mode for Banjarkab only
- `npm run dev:banjarbaru` - Watch mode for Banjarbaru only

#### Source-Specific Differences

| Feature | Banjarkab | Banjarbaru |
|---------|-----------|------------|
| **URL** | cctv.banjarkab.go.id/grid | cctv.banjarbarukota.go.id/CCTV |
| **Video Tech** | Direct HLS streaming | Alpine.js + HLS.js |
| **Interaction** | Auto-play videos | Click to load videos |
| **Pagination** | Yes | No |
| **Error Detection** | `.error-msg` element | `error.png` image |
| **Online Indicator** | `.status-badge.online` | HLS load success |
| **Filtering** | Not supported | Keyword filter (env: `BANJARBARU_FILTER`) |
| **Firefox Fallback** | Not needed | Auto-enabled for failed streams |

#### Firefox Fallback (Banjarbaru Only)

Some HLS streams on Banjarbaru's CCTV system work better in Firefox than Chrome. The application automatically handles this:

**How it works:**
1. **Primary attempt**: Chrome tries to load all cameras
2. **Track failures**: Cameras showing `error.png` are tracked
3. **Automatic retry**: Firefox launches and retries only the failed cameras
4. **Seamless integration**: Successfully captured images are added to the analysis

**Configuration:**
```env
# Enable/disable Firefox fallback (enabled by default)
ENABLE_FIREFOX_FALLBACK=true

# Primary browser
BROWSER_CHANNEL=chrome
```

**Requirements:**
- Firefox must be installed: `npx playwright install firefox`
- Only works when using Chrome as primary browser
- Automatically skipped if already using Firefox

**Example output:**
```
[1/3] Capturing: "JEMBATAN CEMPAKA 2"...
   ✗ Video failed to load (showing error)
   → Will retry with Firefox

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🦊 Retrying 1 failed camera(s) with Firefox...

[1/3] Retrying: "JEMBATAN CEMPAKA 2"...
   ✓ Captured with Firefox
```

#### Camera Filtering (Banjarbaru Only)

Filter Banjarbaru cameras by keyword to capture only specific locations:

```env
# Capture only cameras with "cempaka" in the title
BANJARBARU_FILTER=cempaka
TARGET_COUNT=3,5  # Banjarkab: 3, Banjarbaru: 5 cameras matching "cempaka"
```

**Examples:**
```env
# Only Cempaka area cameras
BANJARBARU_FILTER=cempaka

# Only bridge (jembatan) cameras
BANJARBARU_FILTER=jembatan

# Only roundabout (bundaran) cameras
BANJARBARU_FILTER=bundaran

# No filter - capture all cameras (default)
BANJARBARU_FILTER=
```

**How it works:**
- Case-insensitive matching (e.g., "CEMPAKA" matches "Jembatan Cempaka 1")
- Partial match (e.g., "cempaka" matches "CCTV CEMPAKA 2")
- Only affects Banjarbaru source
- If set, only cameras with matching titles will be captured

#### Target Count Configuration

Configure how many cameras to capture from each source:

```env
# Same count for both sources
TARGET_COUNT=3  # 3 from Banjarkab, 3 from Banjarbaru

# Different counts per source
TARGET_COUNT=5,10  # 5 from Banjarkab, 10 from Banjarbaru
```

**Format:** `count` or `count1,count2`
- Single value: Both sources use the same count
- Two values: First = Banjarkab, Second = Banjarbaru

**Examples:**
```env
# Equal distribution
TARGET_COUNT=5  # 5 cameras from each source

# More from Banjarbaru
TARGET_COUNT=3,10  # 3 from Banjarkab, 10 from Banjarbaru

# More from Banjarkab
TARGET_COUNT=10,3  # 10 from Banjarkab, 3 from Banjarbaru

# Combined with filter (only Banjarbaru affected)
TARGET_COUNT=5,8
BANJARBARU_FILTER=cempaka  # Banjarbaru: 8 cameras matching "cempaka"
                           # Banjarkab: 5 cameras (no filter)
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

# Run - processes BOTH sources synchronously when CCTV_SOURCE is unset
npm start

# Or specify a single source
CCTV_SOURCE=banjarkab npm start
CCTV_SOURCE=banjarbaru npm start
```

**Dual-Source Immediate Mode:**
When `CCTV_SOURCE` is unset or empty in immediate mode, the application will process both sources synchronously (one after the other) rather than just one source.

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
   - Navigates to the CCTV source website
   - Selects online cameras from camera list
   - Automatically paginates through multiple pages if `TARGET_COUNT` exceeds cameras on current page
   - Captures video frames from configured number of cameras
   - For Banjarbaru: Automatically retries failed HLS streams with Firefox (if enabled)
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
- `BROWSER_CHANNEL`: Browser to use ('chrome' or 'firefox', default: 'chrome')
- `ENABLE_FIREFOX_FALLBACK`: Auto-retry failed HLS streams with Firefox (default: true)
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
# Install Chrome (primary browser)
npx playwright install chrome

# Install Firefox (for HLS fallback)
npx playwright install firefox

# Or set custom path in .env (for Chrome)
CHROMIUM_PATH=/path/to/chromium
```

### HLS Streams Failing
If certain cameras consistently fail to load:
1. Ensure Firefox is installed: `npx playwright install firefox`
2. Verify `ENABLE_FIREFOX_FALLBACK=true` in `.env`
3. Check console output for "🦊 Retrying with Firefox..." message
4. If still failing, try setting `BROWSER_CHANNEL=firefox` to use Firefox as primary browser

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
