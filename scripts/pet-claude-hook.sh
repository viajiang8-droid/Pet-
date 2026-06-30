#!/usr/bin/env bash
# 被 Claude Code 的 hooks 调用，把当前工作状态写进桌宠监听的状态文件。
# 桌宠主进程用 fs.watchFile 监听这个文件（见 src/main.js 的 watchPetState）。
#
# 用法：pet-claude-hook.sh working | waiting | done
#   working  正在干活（UserPromptSubmit / PreToolUse）
#   waiting  在等你确认或输入（Notification）
#   done     一轮任务结束（Stop）
state="${1:-}"
[ -z "$state" ] && exit 0
out="$HOME/.claude/pet-state"
# Claude Code 会把事件 JSON 从 stdin 传进来，这里用不到，直接丢弃。
printf '%s' "$state" > "$out" 2>/dev/null || true
exit 0
