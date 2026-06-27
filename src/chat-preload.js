const { contextBridge, ipcRenderer } = require('electron');

// 聊天窗口用的安全桥。注意：这里只传消息文本，永远拿不到 API Key。
contextBridge.exposeInMainWorld('chatAPI', {
  getConfigStatus: () => ipcRenderer.invoke('chat:config-status'), // { hasKey, model }
  send: (text) => ipcRenderer.send('chat:send', text),
  openSettings: () => ipcRenderer.send('chat:open-settings'),
  onDelta: (cb) => ipcRenderer.on('chat:delta', (e, chunk) => cb(chunk)),
  onDone: (cb) => ipcRenderer.on('chat:done', () => cb()),
  onError: (cb) => ipcRenderer.on('chat:error', (e, info) => cb(info)),
  onConfigChanged: (cb) => ipcRenderer.on('chat:config-changed', () => cb())
});
