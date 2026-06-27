const { app, BrowserWindow, ipcMain, Menu, screen } = require('electron');
const path = require('path');

const WIN_SIZE = 160;

function createWindow() {
  const win = new BrowserWindow({
    width: WIN_SIZE,
    height: WIN_SIZE,
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.setAlwaysOnTop(true, 'screen-saver');

  // 初始让它「落地」在屏幕左下角
  const { workArea } = screen.getPrimaryDisplay();
  win.setPosition(workArea.x + 80, workArea.y + workArea.height - WIN_SIZE);

  // 把页面里的 console 和加载失败转发到终端，方便排查
  win.webContents.on('console-message', (e, level, message) => {
    console.log(`[renderer] ${message}`);
  });
  win.webContents.on('did-fail-load', (e, code, desc, url) => {
    console.log(`[did-fail-load] ${code} ${desc} ${url}`);
  });

  win.loadFile(path.join(__dirname, 'index.html'));

  // 页面启动时问一次：我现在在哪、屏幕能走的范围有多大
  ipcMain.handle('pet:init', (event) => {
    const w = BrowserWindow.fromWebContents(event.sender);
    const [x, y] = w.getPosition();
    const display = screen.getDisplayMatching(w.getBounds());
    return { pos: [x, y], work: display.workArea, winSize: WIN_SIZE };
  });

  // 拖动：页面算好新位置后，由主进程真正移动窗口
  ipcMain.on('pet:move', (event, { x, y }) => {
    const w = BrowserWindow.fromWebContents(event.sender);
    if (w) w.setPosition(Math.round(x), Math.round(y));
  });

  // 右键菜单：目前只提供「退出」，以后可以加更多
  ipcMain.on('pet:menu', (event) => {
    const w = BrowserWindow.fromWebContents(event.sender);
    const menu = Menu.buildFromTemplate([
      { label: '退出 小鸡毛', click: () => app.quit() }
    ]);
    menu.popup({ window: w });
  });
}

// 只允许同时存在一个桌宠：拿不到锁说明已经有一只在跑，直接退出。
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.whenReady().then(() => {
    if (process.platform === 'darwin') {
      app.dock.hide();
    }

    createWindow();
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
