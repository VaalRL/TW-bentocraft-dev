// 回報錯誤的連結：開啟 GitHub issue 表單（.github/ISSUE_TEMPLATE/）並預先填入型號或配單連結
export const REPO: string = import.meta.env.VITE_REPO;  // 建置時由 vite.config.ts 帶入
/** 贊助（Buy Me a Coffee）；同一個帳號也寫在 .github/FUNDING.yml 與 README */
export const SPONSOR_URL = 'https://www.buymeacoffee.com/whoami885';

function issueUrl(template: string, title: string, fields: Record<string, string>): string {
  const q = new URLSearchParams({ template, title, ...fields });
  return `https://github.com/${REPO}/issues/new?${q}`;
}

export const specReportUrl = (id: string, name: string) =>
  issueUrl('spec-error.yml', `[規格] ${name}`, { model_id: id });

export const checkReportUrl = (buildUrl: string) =>
  issueUrl('compat-check.yml', '[相容性] ', { build_url: buildUrl });
