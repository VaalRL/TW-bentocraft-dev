import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { BASE, REPO, SITE_URL } from './site';

// index.html 的分享預覽網址必須是絕對路徑（爬蟲不執行 JS）
const siteUrl = (): Plugin => ({
  name: 'site-url',
  transformIndexHtml: { order: 'pre', handler: html => html.replaceAll('%SITE_URL%', SITE_URL) },
});

// GitHub Pages 專案站台位於 /<repo>/ 底下（建置與 vite preview）；本機開發用 /
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? BASE : '/',
  define: { 'import.meta.env.VITE_REPO': JSON.stringify(REPO) },
  plugins: [react(), siteUrl()],
}));
