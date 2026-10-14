#!/bin/bash
# Claude Code 雲端對話啟動時安裝相依套件，讓測試、型別檢查與規格庫驗證一開始就能執行。
# 同步執行：裝完才開始對話，避免在安裝途中跑測試而誤判失敗。本機開發不執行。
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Python：資料管線、schema 驗證與單元測試
python3 -m pip install --quiet --disable-pip-version-check --root-user-action=ignore -r requirements.txt

# 前端：用 npm install 而非 npm ci，保留既有 node_modules，讓容器快取生效
(cd web && npm install --no-audit --no-fund --loglevel=error)

# 前端精簡資料（web/public/data/，不進版控），npm run dev／build 需要
python3 scripts/build_web_data.py > /dev/null
