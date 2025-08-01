// puppeteer.config.cjs

module.exports = {
  defaultBrowser: 'chrome-headless-shell',
  browsers: [
    {
      name: 'chrome-headless-shell',
      channel: 'stable',
      platform: process.platform,
      revision: '1256258' // Pinned revision chính thức tương thích Puppeteer 24.x
    }
  ]
};
