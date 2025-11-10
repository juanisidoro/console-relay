const chromeLauncher = require('chrome-launcher');

async function launchChrome({ url, port = 9222, headless = false, logger = console }) {
  const chromeFlags = [
    '--remote-allow-origins=*',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-default-apps',
    '--disable-extensions',
    '--disable-sync',
    '--metrics-recording-only',
    '--no-first-run',
    '--no-default-browser-check',
  ];

  if (headless) {
    chromeFlags.push('--headless=new', '--disable-gpu');
  }

  const chrome = await chromeLauncher.launch({
    port,
    chromeFlags,
    startingUrl: url || 'about:blank',
  });

  logger.info(`[launcher] Chrome running on port ${chrome.port}`);
  return chrome;
}

async function stopChrome(instance, logger = console) {
  if (!instance) {
    return;
  }
  try {
    await instance.kill();
    logger.info('[launcher] Chrome closed');
  } catch (err) {
    logger.error('[launcher] failed to close Chrome', err);
  }
}

module.exports = {
  launchChrome,
  stopChrome,
};
