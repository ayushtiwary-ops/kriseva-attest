export default {
  testDir: './tests/browser',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  reporter: 'line',
  timeout: 30_000,
  use: {
    browserName: 'chromium',
    headless: true,
  },
};
