// 回報錯誤的連結：開啟 GitHub issue 表單（.github/ISSUE_TEMPLATE/）並預先填入型號或配單連結
export const REPO = 'VaalRL/TW-bentocraft';

function issueUrl(template: string, title: string, fields: Record<string, string>): string {
  const q = new URLSearchParams({ template, title, ...fields });
  return `https://github.com/${REPO}/issues/new?${q}`;
}

export const specReportUrl = (id: string, name: string) =>
  issueUrl('spec-error.yml', `[規格] ${name}`, { model_id: id });

export const checkReportUrl = (buildUrl: string) =>
  issueUrl('compat-check.yml', '[相容性] ', { build_url: buildUrl });
