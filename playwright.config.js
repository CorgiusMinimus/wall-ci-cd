const path = require('path');
const { defineConfig } = require('@playwright/test');

const port = Number(process.env.PORT) || 3000;
const baseURL = `http://127.0.0.1:${port}`;

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  webServer: {
    command: 'node -r dotenv/config server.js',
    cwd: __dirname,
    env: {
      DOTENV_CONFIG_PATH: path.join(__dirname, '.env.test'),
    },
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
