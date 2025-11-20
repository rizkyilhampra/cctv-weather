import { main as captureAndAnalyze } from './capture';
import { sendWeatherReport, sendError } from './telegram';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function run() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('CCTV Weather Analysis with Telegram Integration');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    try {
        // Step 1: Capture and analyze
        const result = await captureAndAnalyze();

        // Step 2: Send to Telegram
        console.log('Preparing to send results to Telegram...\n');
        await sendWeatherReport(result.analysis, result.images);

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✓ Complete! Weather report sent to Telegram successfully.');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    } catch (error) {
        const err = error as Error;
        console.error('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('✗ Error:', err.message);
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // Try to send error notification to Telegram
        try {
            await sendError(err);
            console.log('Error notification sent to Telegram.');
        } catch (telegramError) {
            console.error('Could not send error notification to Telegram:', telegramError);
        }

        process.exit(1);
    }
}

// Run the orchestrator
run();
