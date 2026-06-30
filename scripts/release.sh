#!/usr/bin/env bash
# 一键发布：同步源图 → 打包 → 覆盖安装到 /Applications → 重启「点点」。
#
# 解决「改了图却看不到更新」的根因：App 实际运行的是 /Applications/点点.app，
# 而 npm run dist 只产出 dist/mac-arm64/点点.app，两者是不同文件，必须显式覆盖。
#
# 用法：scripts/release.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

APP_NAME="点点"
BUILT="dist/mac-arm64/${APP_NAME}.app"
INSTALLED="/Applications/${APP_NAME}.app"

echo "▶ 1/4 同步源图 → frames"
bash "$ROOT/scripts/sync-frames.sh"

echo "▶ 2/4 打包（electron-builder，约 10-30 秒）"
npm run dist >/tmp/pet-dist.log 2>&1 || { echo "✗ 打包失败，尾部日志："; tail -8 /tmp/pet-dist.log; exit 1; }
[ -d "$BUILT" ] || { echo "✗ 没找到构建产物 $BUILT"; exit 1; }

echo "▶ 3/4 退出旧实例 + 覆盖安装到 /Applications"
osascript -e "quit app \"${APP_NAME}\"" 2>/dev/null || true
pkill -f "${INSTALLED}/Contents/MacOS" 2>/dev/null || true
sleep 1
rm -rf "$INSTALLED"
cp -R "$BUILT" "$INSTALLED"

echo "▶ 4/4 重启「${APP_NAME}」"
open "$INSTALLED"
echo "✅ 完成：${INSTALLED} 已更新并重启"
