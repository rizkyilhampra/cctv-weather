/**
 * Main entry point for CCTV Weather Analysis
 * Orchestrates the capture, analysis, and Telegram reporting workflow
 */

import { CapturedImage } from './types';
import { captureAndAnalyze } from './services/capture/capture.service';
import { sendWeatherReport, sendError } from './services/messaging/telegram.service';
import { saveFailedReport } from './infrastructure/storage/fallback.service';
import { Scheduler } from './services/scheduler/scheduler.service';

interface ExecutionStatus {
  captureSuccess: boolean;
  analysisSuccess: boolean;
  telegramSuccess: boolean;
}

/**
 * Main task execution function
 * Runs the capture, analysis, and reporting workflow
 */
async function executeTask() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('CCTV Weather Analysis with Telegram Integration');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const status: ExecutionStatus = {
    captureSuccess: false,
    analysisSuccess: false,
    telegramSuccess: false,
  };

  let analysis: string | null = null;
  let images: CapturedImage[] = [];
  let captureError: Error | null = null;

  // Step 1: Capture and analyze
  try {
    const result = await captureAndAnalyze();
    analysis = result.analysis;
    images = result.images;
    status.captureSuccess = true;
    status.analysisSuccess = true;
    console.log('✓ Capture and analysis completed successfully\n');
  } catch (error) {
    captureError = error as Error;
    console.error(`✗ Capture/Analysis failed: ${captureError.message}\n`);
  }

  // Step 2: Send to Telegram (if we have results)
  if (analysis && images.length > 0) {
    try {
      console.log('Preparing to send results to Telegram...\n');
      await sendWeatherReport(analysis, images);
      status.telegramSuccess = true;
      console.log('✓ Results sent to Telegram successfully\n');
    } catch (telegramError) {
      const err = telegramError as Error;
      console.error(`✗ Telegram send failed: ${err.message}\n`);

      // Graceful degradation: Save locally
      console.log('Attempting to save results locally as fallback...');
      try {
        await saveFailedReport(analysis, images, err);
        console.log('✓ Results saved locally successfully\n');
      } catch (saveError) {
        console.error('✗ Failed to save results locally:', saveError);
      }
    }
  }

  // Step 3: Log final status
  logExecutionStatus(status);

  // Step 4: Send error notification if needed
  if (captureError && !status.telegramSuccess) {
    try {
      await sendError(captureError);
      console.log('Error notification sent to Telegram.');
    } catch (notifyError) {
      console.error('Could not send error notification:', notifyError);
    }
  }
}

/**
 * Log execution status
 */
function logExecutionStatus(status: ExecutionStatus) {
  const exitCode = determineExitCode(status);

  if (exitCode === 0) {
    // Complete success
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✓ Complete! Weather report sent to Telegram successfully.');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  } else if (exitCode === 1) {
    // Partial success
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⚠️  Partial Success: Some operations failed');
    console.log(`   Capture: ${status.captureSuccess ? '✓' : '✗'}`);
    console.log(`   Analysis: ${status.analysisSuccess ? '✓' : '✗'}`);
    console.log(`   Telegram: ${status.telegramSuccess ? '✓' : '✗'}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  } else {
    // Total failure
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('✗ Total Failure: All operations failed');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }
}

/**
 * Determine exit code based on execution status
 * 0 = complete success
 * 1 = partial success (some operations failed)
 * 2 = total failure (all critical operations failed)
 */
function determineExitCode(status: ExecutionStatus): number {
  // Total success
  if (status.captureSuccess && status.analysisSuccess && status.telegramSuccess) {
    return 0;
  }

  // Total failure (capture/analysis failed = nothing to report)
  if (!status.captureSuccess || !status.analysisSuccess) {
    return 2;
  }

  // Partial success (captured/analyzed but Telegram failed)
  if (status.captureSuccess && status.analysisSuccess && !status.telegramSuccess) {
    return 1;
  }

  // Default to failure
  return 2;
}

/**
 * Determine if scheduler should be enabled
 * Priority: NODE_ENV=production always enables scheduler
 * Otherwise, respect ENABLE_SCHEDULER setting
 */
function shouldEnableScheduler(): boolean {
  const nodeEnv = process.env.NODE_ENV || 'production';
  const enableScheduler = process.env.ENABLE_SCHEDULER;

  // In production, always enable scheduler regardless of ENABLE_SCHEDULER setting
  if (nodeEnv === 'production') {
    return true;
  }

  // In non-production (development/debug), check ENABLE_SCHEDULER
  // Default to false if not set
  if (enableScheduler === undefined || enableScheduler === '') {
    return false;
  }

  // Parse ENABLE_SCHEDULER: 'true', '1', 'yes' = enabled
  return enableScheduler.toLowerCase() === 'true' ||
         enableScheduler === '1' ||
         enableScheduler.toLowerCase() === 'yes';
}

/**
 * Initialize and start the application
 */
async function main() {
  const schedulerEnabled = shouldEnableScheduler();
  const nodeEnv = process.env.NODE_ENV || 'production';

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('CCTV Weather Analysis');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log(`Environment: ${nodeEnv}`);
  console.log(`Scheduler: ${schedulerEnabled ? 'ENABLED' : 'DISABLED'}\n`);

  if (schedulerEnabled) {
    // Scheduled mode - run at configured times
    await runScheduledMode();
  } else {
    // Immediate mode - run once and exit
    await runImmediateMode();
  }
}

/**
 * Run in scheduled mode (long-running with scheduler)
 */
async function runScheduledMode() {
  console.log('Mode: SCHEDULED (long-running)\n');

  // Read schedule configuration from environment
  const scheduleTimes = process.env.SCHEDULE_TIMES || '05:00';
  const timezone = process.env.TZ || 'Asia/Makassar';

  // Parse times (comma-separated)
  const times = scheduleTimes.split(',').map((t) => t.trim());

  console.log(`Schedule Configuration:`);
  console.log(`  Timezone: ${timezone}`);
  console.log(`  Times: ${times.join(', ')}`);
  console.log();

  // Create and configure scheduler
  const scheduler = new Scheduler();

  try {
    scheduler.schedule(
      {
        times,
        timezone,
      },
      executeTask
    );

    scheduler.start();

    console.log('Scheduler started. Waiting for scheduled execution times...');
    console.log('Press Ctrl+C to stop.\n');

    // Graceful shutdown handling
    const shutdown = () => {
      console.log('\nReceived shutdown signal. Stopping scheduler...');
      scheduler.stop();
      console.log('Scheduler stopped. Exiting.');
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    // Keep the process running
    await new Promise(() => {}); // Infinite promise
  } catch (error) {
    console.error('Failed to initialize scheduler:', error);
    process.exit(1);
  }
}

/**
 * Run in immediate mode (execute once and exit)
 */
async function runImmediateMode() {
  console.log('Mode: IMMEDIATE (run once and exit)\n');

  try {
    await executeTask();
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Task completed. Exiting.');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    process.exit(0);
  } catch (error) {
    console.error('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('Task failed:', error);
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    process.exit(1);
  }
}

// Start the application
main();
