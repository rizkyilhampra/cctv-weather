/**
 * Browser automation configuration for Playwright
 */

export const browserConfig = {
  chromiumPath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  headless: process.env.HEADLESS === 'true',
  browserChannel: (process.env.BROWSER_CHANNEL || 'chrome') as 'chrome',
  pageLoadTimeout: parseInt(process.env.PAGE_LOAD_TIMEOUT || '90000'),
  selectorTimeout: parseInt(process.env.SELECTOR_TIMEOUT || '30000'),
  videoInitWait: parseInt(process.env.VIDEO_INIT_WAIT || '5000'),
  videoReadyTimeout: parseInt(process.env.VIDEO_READY_TIMEOUT || '5000'),
  captureTimeout: parseInt(process.env.CAPTURE_TIMEOUT || '20000'),
};
