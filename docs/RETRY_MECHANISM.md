# Retry Mechanism & Error Handling Documentation

## Overview

This project implements a comprehensive retry mechanism with exponential backoff to handle transient failures in network operations, browser automation, and API calls.

## Architecture

### Core Components

1. **`retry.ts`** - Shared retry utility module
2. **`genai.ts`** - AI API calls with retry logic
3. **`telegram.ts`** - Telegram API calls with retry and graceful degradation
4. **`capture.ts`** - Browser automation with selective retry
5. **`fallback.ts`** - Local storage for failed operations
6. **`index.ts`** - Orchestrator with partial success handling

## Retry Configuration

### Network Operations (Telegram & AI APIs)

- **Initial Delay**: 120 seconds (2 minutes)
- **Max Retries**: 3 attempts
- **Backoff Multiplier**: 2x
- **Total Max Wait**: ~14 minutes (120s + 240s + 480s)

**Retry Sequence:**
```
Attempt 1: Initial try (no delay)
Attempt 2: Wait 120s (2 min)
Attempt 3: Wait 240s (4 min)
Attempt 4: Wait 480s (8 min)
```

### Browser Operations (Camera Capture)

- **Initial Delay**: 2 seconds
- **Max Retries**: Configurable via `MAX_RETRIES` env var (default: 2)
- **Backoff Multiplier**: 2x
- **Total Max Wait**: ~14 seconds (2s + 4s + 8s)

**Retry Sequence:**
```
Attempt 1: Initial try (no delay)
Attempt 2: Wait 2s
Attempt 3: Wait 4s
Attempt 4: Wait 8s (if MAX_RETRIES=3)
```

## Error Classification

### Transient Errors (WILL RETRY)

**Network Errors:**
- `ECONNRESET`, `ECONNREFUSED`, `ETIMEDOUT`
- `ENOTFOUND`, `ENETUNREACH`, `EHOSTUNREACH`
- Socket hang up, network error, fetch failed

**HTTP Errors:**
- `429` - Rate limit exceeded
- `500` - Internal server error
- `502` - Bad gateway
- `503` - Service unavailable
- `504` - Gateway timeout

**Other Transient:**
- Timeout errors
- Quota exceeded
- Rate limiting

### Permanent Errors (WON'T RETRY)

- `400` - Bad request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not found
- Authentication failures
- Invalid tokens
- Validation errors

## Graceful Degradation Strategy

### Level 1: Operation-Level Retry
Each critical operation retries independently:
- AI analysis retries 3 times with 2-minute delays
- Telegram text message retries 3 times with 2-minute delays
- Telegram media group retries 3 times with 2-minute delays
- Camera capture retries with 2-second delays

### Level 2: Fallback Mechanisms

**AI Analysis Failure:**
- Falls back to manual analysis text format
- Continues with captured images
- Logs error details

**Telegram Media Group Failure:**
- Sends text-only analysis (already sent successfully)
- Notifies user about missing images
- Continues with next batch instead of failing completely

**Complete Telegram Failure:**
- Saves report locally to `failed_reports/` directory
- Includes analysis text, images, and error logs
- Allows manual inspection and retry

### Level 3: Partial Success Handling

The orchestrator (`index.ts`) tracks three statuses:
- `captureSuccess` - Camera capture completed
- `analysisSuccess` - AI analysis completed
- `telegramSuccess` - Report sent to Telegram

**Exit Codes:**
- `0` = Complete success (all operations succeeded)
- `1` = Partial success (captured/analyzed but Telegram failed)
- `2` = Total failure (capture/analysis failed)

## Local Fallback Storage

When Telegram sending fails after all retries, the system saves the report locally:

**Directory Structure:**
```
failed_reports/
└── 2025-01-20T15-30-45-123Z/
    ├── README.txt              # Human-readable summary
    ├── analysis.txt            # AI weather analysis
    ├── error.log               # Error details
    ├── images_metadata.json    # Image metadata
    └── images/
        ├── 1_Location_Name.png
        ├── 2_Location_Name.png
        └── 3_Location_Name.png
```

**Utility Functions:**
- `saveFailedReport()` - Save a failed report
- `listFailedReports()` - List all failed reports
- `loadFailedReport()` - Load a specific report
- `deleteFailedReport()` - Delete a report

## Logging

### Retry Logs
Located in `logs/retry.log`:
- Timestamp of each retry attempt
- Operation name
- Error message
- Delay before next retry

### Telegram Error Logs
Located in `logs/telegram_errors.log`:
- Failed error notifications
- Original error details
- Notification failure details

### Console Output
Real-time logging shows:
- Retry attempts and delays
- Success/failure of each operation
- Graceful degradation actions
- Final status summary

## Usage Examples

### Running the Application

```bash
# Normal execution with retry
npm start

# Run capture only (without Telegram)
npm run start:capture
```

### Exit Code Handling

```bash
# In a script or cron job
npm start
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  echo "Complete success"
elif [ $EXIT_CODE -eq 1 ]; then
  echo "Partial success - check failed_reports/"
else
  echo "Total failure - check logs/"
fi
```

### Manual Report Inspection

```typescript
import { listFailedReports, loadFailedReport } from './fallback';

// List all failed reports
const reports = listFailedReports();
console.log('Failed reports:', reports);

// Load a specific report
const report = loadFailedReport('2025-01-20T15-30-45-123Z');
if (report) {
  console.log('Analysis:', report.analysis);
  console.log('Error:', report.error);
  console.log('Images:', report.imageCount);
}
```

## Environment Variables

No new environment variables are required for the retry mechanism. It uses existing configuration:

```bash
# Existing variables
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_channel_id
GOOGLE_GENAI_API_KEY=your_api_key

# Existing retry configuration
MAX_RETRIES=2  # For camera capture only
```

## Monitoring & Debugging

### Check Retry Logs
```bash
cat logs/retry.log
```

### Check Failed Reports
```bash
ls -la failed_reports/
cat failed_reports/latest/README.txt
```

### Check Telegram Errors
```bash
cat logs/telegram_errors.log
```

### Verify Operation Status
The application prints a status summary at the end:
```
⚠️  Partial Success: Some operations failed
   Capture: ✓
   Analysis: ✓
   Telegram: ✗
```

## Best Practices

1. **Monitor retry logs regularly** - High retry rates indicate system issues
2. **Check failed_reports/ directory** - Manual intervention may be needed
3. **Set up alerts on exit code 2** - Complete failures need immediate attention
4. **Clean up old failed reports** - Use `deleteFailedReport()` or manual cleanup
5. **Tune retry parameters** - Adjust delays based on your infrastructure

## Troubleshooting

### High Retry Rates

**Possible causes:**
- Network instability
- API rate limiting
- Service outages
- Insufficient timeouts

**Solutions:**
- Check network connectivity
- Verify API quotas
- Increase retry delays
- Contact service providers

### Frequent Partial Failures

**Possible causes:**
- Telegram API rate limits
- Large image sizes
- Slow network

**Solutions:**
- Reduce image batch size
- Compress images before sending
- Increase delays between batches

### Complete Failures

**Possible causes:**
- Browser automation issues
- Camera offline
- Invalid API keys

**Solutions:**
- Check browser installation
- Verify camera availability
- Validate API credentials

## Performance Impact

### Time Overhead

**Best case (all succeed on first try):**
- No additional delay

**Worst case (all retries exhausted):**
- AI analysis: ~14 minutes additional
- Telegram send: ~14 minutes per operation
- Total max: ~28 minutes overhead

**Typical case (1-2 retries):**
- AI analysis: ~2-4 minutes
- Telegram send: ~2-4 minutes
- Total typical: ~4-8 minutes overhead

### Resource Usage

- **Disk**: Failed reports stored locally (images + metadata)
- **Memory**: Minimal overhead (retry state tracking)
- **CPU**: No significant impact

## Security Considerations

1. **Sensitive data in logs** - Logs contain error messages only, no credentials
2. **Failed reports** - May contain weather analysis and camera images
3. **API keys** - Never logged or saved to fallback storage
4. **File permissions** - Ensure `logs/` and `failed_reports/` have appropriate permissions

## Future Improvements

Potential enhancements:
- Circuit breaker pattern for repeated failures
- Adaptive retry delays based on error type
- Metrics/monitoring integration
- Automatic cleanup of old failed reports
- Webhook notifications for failures
- Dashboard for retry statistics
