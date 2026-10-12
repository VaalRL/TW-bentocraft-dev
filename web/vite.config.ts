import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages 專案站台位於 /TW-bentocraft/ 底下（建置與 vite preview）；本機開發用 /
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/TW-bentocraft/' : '/',
  plugins: [react()],
}));
