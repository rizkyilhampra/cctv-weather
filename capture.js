const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
    // 1. Launch in High Resolution
    const browser = await chromium.launch({ 
        headless: false, 
        channel: 'chrome', 
        args: ['--window-size=1920,1080'],
        executablePath: '/usr/bin/chromium' // Linux
    });
    
    const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 } // Set capture resolution to 1080p
    });
    const page = await context.newPage();

    const outputDir = 'cctv_hd_snapshots';
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

    try {
        console.log('Navigating to Grid...');
        await page.goto('https://cctv.banjarkab.go.id/grid', {
            waitUntil: 'load',
            timeout: 90000
        });

        // Wait for CCTV cards to be visible
        await page.waitForSelector('.cctv-card', { timeout: 30000 });
        console.log('Page loaded, waiting for streams to initialize...');

        // Give videos time to start loading
        await page.waitForTimeout(5000);

        // 2. Find all cards
        const cards = await page.locator('.cctv-card').all();
        console.log(`Found ${cards.length} cameras. Looking for 5 verified live streams...`);

        let capturedCount = 0;
        const targetCount = 5;

        for (const card of cards) {
            if (capturedCount >= targetCount) break;

            const title = (await card.locator('.cctv-header').innerText()).trim();
            
            // --- STRICT OFFLINE CHECK ---
            // Check 1: Status Badge
            const isBadgeOnline = await card.locator('.status-badge.online').count() > 0;
            
            // Check 2: Is the "Error/Offline" image visible?
            // (Sometimes badge says Online, but the stream failed and shows the broken icon)
            const isErrorVisible = await card.locator('.error-msg').isVisible();

            if (!isBadgeOnline || isErrorVisible) {
                // Silently skip offline ones to clean up logs
                continue;
            }

            console.log(`\n[${capturedCount + 1}/${targetCount}] processing: "${title}"`);

            try {
                const videoLocator = card.locator('video');
                await videoLocator.scrollIntoViewIfNeeded();

                // Ensure video is playing
                await videoLocator.evaluate(async (v) => {
                    v.muted = true;
                    if (v.paused) await v.play().catch(() => {});
                });

                // Wait for data (prevent black screen)
                try {
                    await page.waitForFunction(
                        (el) => el.readyState >= 2 && el.videoWidth > 0 && el.videoHeight > 0,
                        await videoLocator.elementHandle(),
                        { timeout: 5000 }
                    );
                } catch (e) {
                    console.log(`   ⚠️ Skipped: Video stuck buffering.`);
                    continue; // Skip if it won't load data
                }

                const safeTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                const filename = path.join(outputDir, `${safeTitle}_hd.png`);

                // --- CANVAS API CAPTURE ---
                // Capture the actual video frame at native resolution using Canvas API
                const videoElement = await videoLocator.elementHandle();
                const base64Image = await page.evaluate((video) => {
                    const canvas = document.createElement('canvas');
                    canvas.width = video.videoWidth;  // Native video resolution
                    canvas.height = video.videoHeight;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(video, 0, 0);
                    return canvas.toDataURL('image/png');
                }, videoElement);

                // Convert base64 to buffer and save
                const base64Data = base64Image.replace(/^data:image\/png;base64,/, '');
                const buffer = Buffer.from(base64Data, 'base64');
                fs.writeFileSync(filename, buffer);

                console.log(`   ✅ Captured HD: ${filename}`);
                
                capturedCount++;

            } catch (err) {
                console.error(`   ❌ Error: ${err.message}`);
            }
        }

        console.log(`\nDone. Check the '${outputDir}' folder.`);

    } catch (error) {
        console.error('Fatal Error:', error);
    } finally {
        await browser.close();
    }
})();
