import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
  },
  webServer: [
    {
      command: process.platform === 'win32'
        ? 'python -m uvicorn app.main:app --port 8000'
        : 'python3 -m uvicorn app.main:app --port 8000',
      url: 'http://127.0.0.1:8000/api/v1/health',
      reuseExistingServer: true,
      cwd: '../backend',
      env: {
        PYTHONPATH: '.',
      },
    },
    {
      command: 'npm run preview -- --port 5173',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
    },
  ],
});
