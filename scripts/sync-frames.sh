#!/usr/bin/env bash
# 把「源图」目录里的逐帧 PNG 同步进 App 实际加载的 frames 目录。
#
# 背景：换形象时你只改源图（diandian/<动作>/*.png），但 App 渲染层读的是
# assets/pets/diandian/frames/<动作>/0N.png（见 src/renderer.js，帧数由 renderer 自动探测）。
#
# 命名无关：不关心源文件叫 moren_1@2x / dog_stretch_01 还是别的，只做两件事——
#   1) 把目录里的 PNG 自然排序（01<02<…<10<11）
#   2) 依次重命名拷成 01.png, 02.png, …，并清理目标里多余的旧帧
# 若同一目录里同时存在 @2x 和 @1x 两套，优先用 @2x（更清晰），避免重复计数。
#
# 用法：
#   scripts/sync-frames.sh            # 同步所有动作（按 frames 下已有目录）
#   scripts/sync-frames.sh moren      # 只同步指定动作
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_BASE="$ROOT/diandian"
DST_BASE="$ROOT/assets/pets/diandian/frames"

if [ "$#" -gt 0 ]; then
  ANIMS=("$@")
else
  ANIMS=()
  for d in "$DST_BASE"/*/; do
    [ -d "$d" ] && ANIMS+=("$(basename "$d")")
  done
fi

for anim in "${ANIMS[@]}"; do
  src_dir="$SRC_BASE/$anim"
  dst_dir="$DST_BASE/$anim"
  if [ ! -d "$src_dir" ]; then
    echo "⚠️  跳过 $anim：源目录不存在 $src_dir"
    continue
  fi
  mkdir -p "$dst_dir"

  # 选出这一组源帧：优先 @2x，其次 @1x，否则目录里所有 png。自然排序后入数组。
  # 用 while-read 填数组（兼容 macOS 自带 bash 3.2，无 mapfile）。
  fill() { srcs=(); while IFS= read -r f; do [ -n "$f" ] && srcs+=("$f"); done < <(ls "$src_dir"/$1 2>/dev/null | sort -V); }
  fill '*@2x.png'
  [ "${#srcs[@]}" -eq 0 ] && fill '*@1x.png'
  [ "${#srcs[@]}" -eq 0 ] && fill '*.png'

  if [ "${#srcs[@]}" -eq 0 ]; then
    echo "⚠️  $anim：源目录里没有 .png，未同步"
    continue
  fi

  # 依次拷成 01.png, 02.png, …
  idx=1
  for src in "${srcs[@]}"; do
    cp "$src" "$dst_dir/$(printf '%02d' "$idx").png"
    idx=$((idx + 1))
  done
  count=$((idx - 1))

  # 清理目标里多出来的旧帧（上次帧数更多时残留），保证 frames 与源图严格一一对应
  pruned=0
  while :; do
    extra="$dst_dir/$(printf '%02d' "$idx").png"
    [ -f "$extra" ] || break
    rm -f "$extra"
    pruned=$((pruned + 1))
    idx=$((idx + 1))
  done

  msg="✓ $anim：已同步 $count 帧"
  [ "$pruned" -gt 0 ] && msg="$msg（清理 $pruned 个多余旧帧）"
  echo "$msg → $dst_dir"
done
