const { contextBridge, ipcRenderer } = require('electron');

// 设置窗口用的桥。设置界面是用户编辑配置的地方，允许读取/写入完整配置（含 Key）。
contextBridge.exposeInMainWorld('settingsAPI', {
  get: () => ipcRenderer.invoke('settings:get'),
  save: (cfg) => ipcRenderer.send('settings:save', cfg)
});
