const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tipAPI', {
  // 主进程推送要显示的译文
  onText: (cb) => ipcRenderer.on('tip:text', (_e, text) => cb(text)),
  // 量好气泡真实尺寸后回报，主进程据此把窗口贴到选区上方
  size: (w, h) => ipcRenderer.send('tip:size', { w, h })
});
