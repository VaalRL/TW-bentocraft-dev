// 網站位址由 repo 決定：GitHub Pages 專案站台在 https://<owner>.github.io/<repo>/。
// GitHub Actions 裡由 GITHUB_REPOSITORY 帶入，repo 改名或移植時不用改程式；本機預設 VaalRL/TW-bentocraft。
declare const process: { env: Record<string, string | undefined> };  // 只在 Node 端（vite／playwright 設定）使用

export const REPO = process.env.GITHUB_REPOSITORY || 'VaalRL/TW-bentocraft';
const [owner, name] = REPO.split('/');
export const BASE = `/${name}/`;
export const SITE_URL = `https://${owner.toLowerCase()}.github.io/${name}/`;
