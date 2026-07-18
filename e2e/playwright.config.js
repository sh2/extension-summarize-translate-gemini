import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./specs",
  workers: 1,
  retries: 0,
  reporter: "list",
  timeout: 60000
});
