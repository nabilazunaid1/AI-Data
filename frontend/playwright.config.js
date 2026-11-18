import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests/browser',fullyParallel:false,workers:1,timeout:45000,
  use:{baseURL:'http://127.0.0.1:5173',browserName:'chromium',channel:'msedge',headless:true,
    viewport:{width:1440,height:1000},screenshot:'only-on-failure'},
  webServer:{command:'npm run dev -- --strictPort',url:'http://127.0.0.1:5173',reuseExistingServer:!process.env.CI},
});
