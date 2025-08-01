// puppeteer.config.cjs

module.exports = {
  defaultBrowser: 'chromium',
  browsers: [
    {
      name: 'chromium',
      channel: 'stable',
      platform: process.platform,
      revision: '1256258' // Pinned revision chính thức, tương thích với Puppeteer 24.x
    }
  ]
};
