const { contextBridge, ipcRenderer } = require('electron');

// 渲染进程（网页）不能直接操作系统/窗口，这里开一个安全的小窗口
// 只把「移动窗口」和「弹出菜单」两件事暴露给页面用。
contextBridge.exposeInMainWorld('petAPI', {
  move: (x, y) => ipcRenderer.send('pet:move', { x, y }),
  menu: (state) => ipcRenderer.send('pet:menu', state),
  // 主进程菜单被点击后，会通过这里把动作（hello / toggle-pause）回传给页面
  onAction: (cb) => ipcRenderer.on('pet:action', (e, action) => cb(action)),
});
