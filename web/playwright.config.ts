import { defineConfig, devices } from '@playwright/test';

// 端對端測試：對建置後的網站（vite preview）操作真實瀏覽器。資料以 e2e/fixtures.ts 攔截替換。
// 執行前需先 npm run build。
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173/TW-bentocraft/',
    trace: 'retain-on-failure',
    // 有 HTTP(S)_PROXY 的環境中避免 localhost 被送進代理
    launchOptions: { args: ['--no-proxy-server'] },
  },
  projects: [
    { name: 'desktop', testMatch: 'builder.e2e.ts', use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 900 } } },
    { name: 'mobile', testMatch: 'mobile.e2e.ts', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/TW-bentocraft/',
    reuseExistingServer: !process.env.CI,
  },
});
