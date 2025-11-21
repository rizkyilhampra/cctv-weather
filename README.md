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
│   │   └── messaging/       # Telegram service
│   │       ├── telegram.service.ts
│   │       └── media-handler.ts
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
```

## Usage

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
# Build TypeScript
npm run build

# Run
npm start
```

### Running Directly
```bash
tsx src/index.ts
```

## How It Works

1. **Capture Phase**:
   - Navigates to https://cctv.banjarkab.go.id/grid
   - Selects online cameras
   - Captures video frames from configured number of cameras
   - Retries failed captures with exponential backoff

2. **Analysis Phase**:
   - Sends captured images to Google Gemini AI
   - AI analyzes weather conditions using custom prompts
   - Generates conversational weather updates
   - Falls back to default message on AI failure

3. **Telegram Phase**:
   - Sends images as media groups (up to 10 per batch)
   - Sends analysis text with markdown formatting
   - Retries failed sends (2-minute delays)
   - Falls back to local storage if Telegram fails

## Exit Codes

- `0`: Complete success (capture, analysis, and Telegram send succeeded)
- `1`: Partial success (capture/analysis succeeded, Telegram failed)
- `2`: Total failure (capture or analysis failed)

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

### Browser Settings

Edit `src/config/browser.config.ts` or set environment variables:
- `CHROMIUM_PATH`: Path to Chromium executable
- `HEADLESS`: Run browser in headless mode (true/false)
- `PAGE_LOAD_TIMEOUT`: Page load timeout in milliseconds
- `VIDEO_INIT_WAIT`: Wait time for videos to initialize

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

[Your License Here]

## Contributing

1. Follow existing code organization patterns
2. Maintain type safety (no `any` types)
3. Add tests for new features
4. Update documentation

## Acknowledgments

- CCTV feeds provided by Kabupaten Banjar
- Weather analysis powered by Google Gemini AI
- Browser automation by Playwright
