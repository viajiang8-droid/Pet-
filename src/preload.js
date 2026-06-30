const { contextBridge, ipcRenderer } = require('electron');

// 渲染进程（网页）不能直接操作系统/窗口，这里开一个安全的小窗口
// 只把「移动窗口」和「弹出菜单」两件事暴露给页面用。
contextBridge.exposeInMainWorld('petAPI', {
  move: (x, y) => ipcRenderer.send('pet:move', { x, y }),
  // 让桌宠自己走：按相对位移移动窗口（绝对坐标由主进程读取，渲染层不必知道）
  moveBy: (dx, dy) => ipcRenderer.send('pet:move-by', { dx, dy }),
  // 读当前窗口 x/宽度 + 所在屏幕可用区，用来把走动范围夹在屏幕内
  getBounds: () => ipcRenderer.invoke('pet:get-bounds'),
  resize: (w, h) => ipcRenderer.send('pet:resize', { w, h }),
  menu: (state) => ipcRenderer.send('pet:menu', state),
  // 主进程菜单被点击后，会通过这里把动作（hello）回传给页面
  onAction: (cb) => ipcRenderer.on('pet:action', (e, action) => cb(action)),
  // 主进程要在头顶气泡里显示内容（如截图翻译结果）
  onBubble: (cb) => ipcRenderer.on('pet:bubble', (e, payload) => cb(payload)),
  // Claude 运行状态变化（running / done）
  onClaude: (cb) => ipcRenderer.on('pet:claude', (e, state) => cb(state)),
});
