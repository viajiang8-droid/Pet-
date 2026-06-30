// 划词翻译气泡：收到译文 → 量出真实尺寸 → 通知主进程定位窗口
const tipEl = document.getElementById('tip');

window.tipAPI.onText((text) => {
  tipEl.textContent = text;
  // 同步读取 getBoundingClientRect 会强制立即布局，拿到真实尺寸。
  // 不能用 requestAnimationFrame：窗口此刻还隐藏着，Chromium 会暂停 rAF，
  // 回调永不触发 → 窗口永远显示不出来。
  const rect = tipEl.getBoundingClientRect();
  const w = Math.ceil(rect.width) + 2;    // 防止四舍五入把文字挤换行
  const h = Math.ceil(rect.height) + 10;  // 给下方小尾巴留出空间
  window.tipAPI.size(w, h);
});
