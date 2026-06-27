const apiKeyEl = document.getElementById('apiKey');
const modelEl = document.getElementById('model');
const baseURLEl = document.getElementById('baseURL');
const statusEl = document.getElementById('status');
const form = document.getElementById('form');

// 载入已有配置填进表单
(async () => {
  const cfg = await window.settingsAPI.get();
  apiKeyEl.value = cfg.apiKey || '';
  modelEl.value = cfg.model || '';
  baseURLEl.value = cfg.baseURL || '';
})();

form.addEventListener('submit', (e) => {
  e.preventDefault();
  window.settingsAPI.save({
    apiKey: apiKeyEl.value.trim(),
    model: modelEl.value.trim(),
    baseURL: baseURLEl.value.trim()
  });
  // 主进程保存后会关闭本窗口；这里给个即时反馈兜底
  statusEl.textContent = '已保存 ✓';
});
