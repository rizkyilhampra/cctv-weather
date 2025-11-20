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
        await page.goto('https://cctv.banjarkab.go.id/grid', { waitUntil: 'networkidle' });

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
                        (el) => el.readyState >= 2, 
                        await videoLocator.elementHandle(), 
                        { timeout: 5000 }
                    );
                } catch (e) {
                    console.log(`   ⚠️ Skipped: Video stuck buffering.`);
                    continue; // Skip if it won't load data
                }

                // --- THE "HD" HACK ---
                // We inject JS to make THIS specific video fill the entire screen temporarily
                // This forces the screenshot to be 1920x1080 instead of small grid size.
                await videoLocator.evaluate((el) => {
                    el.dataset.originalStyle = el.getAttribute('style'); // Backup style
                    el.style.position = 'fixed';
                    el.style.top = '0';
                    el.style.left = '0';
                    el.style.width = '100vw';
                    el.style.height = '100vh';
                    el.style.zIndex = '99999';
                    el.style.backgroundColor = 'black';
                    el.style.objectFit = 'contain'; // Keep aspect ratio, don't stretch
                });

                // Wait a split second for the resize to render
                await page.waitForTimeout(500);

                const safeTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                const filename = path.join(outputDir, `${safeTitle}_hd.png`);

                // Screenshot the WHOLE PAGE (which is now just the video)
                await page.screenshot({ path: filename });

                console.log(`   ✅ Captured HD: ${filename}`);

                // --- RESTORE STYLE ---
                // Put the video back in the grid so we can continue
                await videoLocator.evaluate((el) => {
                    const original = el.dataset.originalStyle;
                    if (original) el.setAttribute('style', original);
                    else el.removeAttribute('style');
                });
                
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
