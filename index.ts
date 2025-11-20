import { main as captureAndAnalyze, CapturedImage } from './capture';
import { sendWeatherReport, sendError } from './telegram';
import { saveFailedReport } from './fallback';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load environment variables
dotenv.config();

interface ExecutionStatus {
    captureSuccess: boolean;
    analysisSuccess: boolean;
    telegramSuccess: boolean;
}

async function run() {
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

    // Step 3: Handle final status and notifications
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

        // Try to notify about partial failure
        if (captureError && status.telegramSuccess === false) {
            try {
                await sendError(captureError);
                console.log('Error notification sent to Telegram.');
            } catch (notifyError) {
                console.error('Could not send error notification:', notifyError);
            }
        }
    } else {
        // Total failure
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('✗ Total Failure: All operations failed');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        if (captureError) {
            // Try to send error notification
            try {
                await sendError(captureError);
                console.log('Error notification sent to Telegram.');
            } catch (notifyError) {
                console.error('Could not send error notification:', notifyError);
            }
        }
    }

    process.exit(exitCode);
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

// Run the orchestrator
run();
