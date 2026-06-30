const { app, BrowserWindow, ipcMain, Menu, screen, globalShortcut, dialog, clipboard, systemPreferences } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { readConfig, writeConfig } = require('./config');
const { streamChat, translateText, translateImage } = require('./ai');
const { uIOhook } = require('uiohook-napi');

const execFileP = promisify(execFile);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const WIN_W = 160;        // 宽度（容纳桌宠本体）
const WIN_H = 220;        // 高度多留 60px，给头顶的「你好呀」气泡用

let petWin = null;        // 桌宠主窗口（模块级，供快捷键/翻译使用）

function createWindow() {
  const win = new BrowserWindow({
    width: WIN_W,
    height: WIN_H,
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

  petWin = win;
  win.setAlwaysOnTop(true, 'screen-saver');

  // 初始让它「落地」在屏幕左下角（窗口底边贴屏幕底边，桌宠就站在地上）
  const { workArea } = screen.getPrimaryDisplay();
  win.setPosition(workArea.x + 80, workArea.y + workArea.height - WIN_H);

  // 把页面里的 console 和加载失败转发到终端，方便排查
  win.webContents.on('console-message', (e, level, message) => {
    console.log(`[renderer] ${message}`);
  });
  win.webContents.on('did-fail-load', (e, code, desc, url) => {
    console.log(`[did-fail-load] ${code} ${desc} ${url}`);
  });

  win.loadFile(path.join(__dirname, 'index.html'));

  // 拖动：页面算好新位置后，由主进程真正移动窗口
  ipcMain.on('pet:move', (event, { x, y }) => {
    const w = BrowserWindow.fromWebContents(event.sender);
    if (w) w.setPosition(Math.round(x), Math.round(y));
  });

  // 自己走动：按相对位移移动窗口（页面不必知道绝对坐标）。不在此夹边界——
  // 页面已用 pet:get-bounds 把目标算在屏幕内，这样「走出去再原样走回来」能精确回到起点。
  ipcMain.on('pet:move-by', (event, { dx, dy }) => {
    const w = BrowserWindow.fromWebContents(event.sender);
    if (!w) return;
    const [x, y] = w.getPosition();
    w.setPosition(Math.round(x + dx), Math.round(y + dy));
  });

  // 给页面读：当前窗口 x/宽度 + 所在屏幕可用区左边界/宽度，用来夹住走动范围
  ipcMain.handle('pet:get-bounds', (event) => {
    const w = BrowserWindow.fromWebContents(event.sender);
    if (!w) return null;
    const b = w.getBounds();
    const { workArea } = screen.getDisplayMatching(b);
    return { x: b.x, winW: b.width, areaX: workArea.x, areaW: workArea.width };
  });

  // 调整窗口大小（显示长气泡时变大、收起后还原），保持底边中点不动，桌宠不跳。
  ipcMain.on('pet:resize', (event, { w, h }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const [x, y] = win.getPosition();
    const [ow, oh] = win.getSize();
    const cx = x + ow / 2;
    const bottom = y + oh;
    const nw = Math.max(WIN_W, Math.round(w));
    const nh = Math.max(WIN_H, Math.round(h));
    win.setBounds({ x: Math.round(cx - nw / 2), y: Math.round(bottom - nh), width: nw, height: nh });
  });

  // 右键菜单（Mac 原生样式）。菜单项点击后通过 pet:action 通知页面去执行。
  // state.paused 由页面在弹菜单时带上，用来决定显示「暂停」还是「继续」。
  ipcMain.on('pet:menu', (event) => {
    const w = BrowserWindow.fromWebContents(event.sender);
    const send = (action) => event.sender.send('pet:action', action);
    const menu = Menu.buildFromTemplate([
      { label: '打招呼', click: () => send('hello') },
      { label: '创建我的宠物…', click: () => openCreatePetWindow() },
      { label: '聊天…', click: () => openChatWindow() },
      { label: '设置…', click: () => openSettingsWindow() },
      { type: 'separator' },
      { label: '退出 点点', click: () => app.quit() }
    ]);
    menu.popup({ window: w });
  });
}

// 聊天窗口：独立的普通窗口（不透明、可调整大小、带原生标题栏按钮）。
// 已经开着就直接聚焦，避免开出多个。
let chatWin = null;
let chatHistory = [];     // 当前会话上下文，开新窗口时清空
let currentAbort = null;  // 用于打断上一条未完成的请求

function openChatWindow() {
  if (chatWin && !chatWin.isDestroyed()) {
    chatWin.show();
    chatWin.focus();
    return;
  }
  chatHistory = [];
  chatWin = new BrowserWindow({
    width: 380,
    height: 560,
    minWidth: 320,
    minHeight: 420,
    title: '点点',
    titleBarStyle: 'hiddenInset', // 保留左上角原生红绿灯按钮，标题栏内容自定义
    backgroundColor: '#ffffff',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'chat-preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  chatWin.loadFile(path.join(__dirname, 'chat.html'));
  chatWin.once('ready-to-show', () => {
    chatWin.show();
    chatWin.focus();
  });
  chatWin.on('closed', () => { chatWin = null; });
}

// 设置窗口：填写 API Key / 模型 / 接口地址
let settingsWin = null;
function openSettingsWindow() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 440,
    height: 380,
    resizable: false,
    title: '设置',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#ffffff',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'settings-preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  settingsWin.loadFile(path.join(__dirname, 'settings.html'));
  settingsWin.once('ready-to-show', () => {
    settingsWin.show();
    settingsWin.focus();
  });
  settingsWin.on('closed', () => { settingsWin = null; });
}

// 「创建我的宠物」弹窗：居中、不可缩放、单实例。
let createPetWin = null;
function openCreatePetWindow() {
  if (createPetWin && !createPetWin.isDestroyed()) {
    createPetWin.show();
    createPetWin.focus();
    return;
  }
  createPetWin = new BrowserWindow({
    width: 440,
    height: 560,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    center: true,                 // 居中显示
    title: '创建我的宠物',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#ffffff',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'create-pet-preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  createPetWin.loadFile(path.join(__dirname, 'create-pet.html'));
  createPetWin.once('ready-to-show', () => {
    createPetWin.show();
    createPetWin.focus();
  });
  createPetWin.on('closed', () => { createPetWin = null; });
}

// ── 聊天相关 IPC ──
ipcMain.handle('chat:config-status', () => {
  const cfg = readConfig();
  return { hasKey: !!cfg.apiKey, model: cfg.model };
});

ipcMain.on('chat:open-settings', () => openSettingsWindow());

ipcMain.on('chat:send', async (event, text) => {
  const wc = event.sender;
  chatHistory.push({ role: 'user', content: text });

  if (currentAbort) currentAbort.abort();
  currentAbort = new AbortController();

  try {
    const full = await streamChat(chatHistory, {
      signal: currentAbort.signal,
      onDelta: (chunk) => wc.send('chat:delta', chunk)
    });
    chatHistory.push({ role: 'assistant', content: full });
    wc.send('chat:done');
  } catch (err) {
    if (err.name === 'AbortError') return;
    // 这条没成功，别把它留在上下文里
    chatHistory.pop();
    wc.send('chat:error', { code: err.code || null, message: err.message || String(err) });
  }
});

// ── 设置相关 IPC ──
ipcMain.handle('settings:get', () => readConfig());

ipcMain.on('settings:save', (event, partial) => {
  writeConfig(partial);
  if (chatWin && !chatWin.isDestroyed()) {
    chatWin.webContents.send('chat:config-changed');
  }
  const w = BrowserWindow.fromWebContents(event.sender);
  if (w) w.close();
});

// ── 创建我的宠物：读取/保存名称+品种，确认后关闭弹窗并让桌宠打个招呼 ──
ipcMain.handle('create-pet:get', () => {
  const cfg = readConfig();
  return { petName: cfg.petName || '', petBreed: cfg.petBreed || '' };
});

ipcMain.on('create-pet:save', (event, { name, breed }) => {
  writeConfig({ petName: name, petBreed: breed });
  const w = BrowserWindow.fromWebContents(event.sender);
  if (w) w.close();
  petBubble(`我是${name}，请多关照～`, false);   // 给个即时反馈
});

ipcMain.on('create-pet:cancel', (event) => {
  const w = BrowserWindow.fromWebContents(event.sender);
  if (w) w.close();
});

// ── 调试日志：写到固定文件，方便排查打包后的 App（看不到终端输出）──
const DEBUG_LOG = path.join(os.tmpdir(), 'pet-debug.log');
function dbg(...parts) {
  const line = `[${new Date().toISOString()}] ${parts.join(' ')}\n`;
  try { fs.appendFileSync(DEBUG_LOG, line); } catch { /* ignore */ }
  console.log('[pet]', ...parts);
}

// ── 截图翻译：Control+Command+A 框选区域 → 截图 → 多模态识别英文翻成中文 → 原生弹框 ──
function petBubble(text, sticky) {
  if (petWin && !petWin.isDestroyed()) {
    petWin.webContents.send('pet:bubble', { text, sticky });
  }
}

// 用 macOS 原生 screencapture 让用户框选一块区域，结果存成 PNG 文件。
//   -i 交互式框选；-x 不播放快门声。用户按 Esc 取消时不会生成文件。
function captureRegion(outPath) {
  return execFileP('screencapture', ['-i', '-x', outPath]);
}

// 把翻译结果显示在 macOS 原生弹框里（最接近「系统默认弹框」）。
function showResultDialog(message) {
  dialog.showMessageBox(petWin && !petWin.isDestroyed() ? petWin : null, {
    type: 'none',
    title: '点点翻译',
    message: '翻译结果',
    detail: message,
    buttons: ['好的'],
    defaultId: 0,
    noLink: true
  });
}

let translating = false;
async function translateScreenshot() {
  dbg('hotkey 触发 translateScreenshot, translating=', translating);
  if (translating) return;
  translating = true;
  const tmp = path.join(os.tmpdir(), `pet-shot-${Date.now()}.png`);
  try {
    dbg('屏幕录制权限 =',
      process.platform === 'darwin' ? systemPreferences.getMediaAccessStatus('screen') : 'n/a');
    // 直接拉起 macOS 框选截图。不要在调用前拦截权限——否则 screencapture 永不执行，
    // 系统也就永远不会把本应用登记进「屏幕录制」列表，用户连授权入口都找不到。
    // 首次执行时系统会自动弹出「点点 想录屏」的授权提示并登记本应用。
    dbg('开始 screencapture ->', tmp);
    await captureRegion(tmp);
    dbg('screencapture 返回');

    const exists = fs.existsSync(tmp);
    const size = exists ? fs.statSync(tmp).size : 0;
    dbg('截图文件 exists=', exists, 'size=', size);
    // 没拿到图：要么没「屏幕录制」权限，要么用户按 Esc 取消了
    if (!exists || size === 0) {
      if (process.platform === 'darwin' &&
          systemPreferences.getMediaAccessStatus('screen') !== 'granted') {
        dbg('判定：无屏幕录制权限');
        petBubble('需要「屏幕录制」权限：系统设置→隐私与安全性→屏幕录制 勾选「点点」后，重启我再试', false);
      } else {
        dbg('判定：已授权但无文件 = 用户取消');
      }
      return; // 已授权却没图 = 用户主动取消，静默结束
    }

    petBubble('翻译中…', true);
    const b64 = fs.readFileSync(tmp).toString('base64');
    dbg('调用 translateImage, base64 长度=', b64.length);
    const out = (await translateImage(b64) || '').trim();
    dbg('translateImage 返回, 译文长度=', out.length);
    petBubble('', false); // 收起「翻译中…」气泡
    showResultDialog(out || '（没识别到可翻译的英文）');
  } catch (err) {
    dbg('ERROR', err.code || '', err.message || String(err));
    petBubble('', false);
    const msg = err.code === 'NO_API_KEY'
      ? '请先在「设置」里填 API Key'
      : '翻译失败：' + (err.message || '请求出错');
    showResultDialog(msg);
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* 文件可能不存在，忽略 */ }
    translating = false;
  }
}

// ── 划词翻译：全局监听鼠标，选中英文 → 模拟 Cmd+C 取词 → 译成中文 → 贴着选区弹气泡 ──
// 取词需「辅助功能」权限（模拟 Cmd+C），监听鼠标需「输入监控」权限。
let tipWin = null;
let tipAnchor = { x: 0, y: 0 };
let tipHideTimer = null;

function createTipWindow() {
  tipWin = new BrowserWindow({
    width: 300,
    height: 120,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,            // 永不抢焦点，不打断用户正在操作的 App
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'tip-preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  tipWin.setAlwaysOnTop(true, 'screen-saver');
  tipWin.setIgnoreMouseEvents(true);  // 点击穿透，不挡住下面的内容
  tipWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  tipWin.loadFile(path.join(__dirname, 'tip.html'));
}

function showTip(x, y, text) {
  if (!tipWin || tipWin.isDestroyed()) return;
  tipAnchor = { x, y };
  dbg('showTip 锚点=', x, y, '文本=', JSON.stringify(text.slice(0, 20)));
  tipWin.webContents.send('tip:text', text); // 尺寸由 tip:size 回调定位后再定
  clearTimeout(tipHideTimer);
  tipHideTimer = setTimeout(hideTip, 7000);
}

function hideTip() {
  clearTimeout(tipHideTimer);
  if (tipWin && !tipWin.isDestroyed() && tipWin.isVisible()) tipWin.hide();
}

// 渲染层量好气泡真实尺寸后，把窗口贴到选区上方居中显示
ipcMain.on('tip:size', (event, { w, h }) => {
  if (!tipWin || tipWin.isDestroyed()) return;
  const { workArea } = screen.getDisplayNearestPoint(tipAnchor);
  const nw = Math.max(40, Math.round(w));
  const nh = Math.max(24, Math.round(h));
  let nx = Math.round(tipAnchor.x - nw / 2);
  let ny = Math.round(tipAnchor.y - nh - 14);      // 浮在选区上方
  nx = Math.max(workArea.x + 4, Math.min(nx, workArea.x + workArea.width - nw - 4));
  if (ny < workArea.y + 4) ny = Math.round(tipAnchor.y + 20); // 上方放不下就放下面
  dbg('tip:size 收到', nw, 'x', nh, '→ 定位', nx, ny, '并显示');
  tipWin.setBounds({ x: nx, y: ny, width: nw, height: nh });
  tipWin.showInactive();
});

// 在桌宠/气泡窗口范围内的拖动不算划词（避免拖动桌宠也去取词）
function pointInWindow(pt, win) {
  if (!win || win.isDestroyed()) return false;
  const b = win.getBounds();
  return pt.x >= b.x && pt.x <= b.x + b.width && pt.y >= b.y && pt.y <= b.y + b.height;
}

let mDown = { x: 0, y: 0 };
let selecting = false;
let lastSelText = '';

// 用 AppleScript 模拟 Cmd+C，把当前选中内容复制到剪贴板（需「辅助功能」权限）
function copySelection() {
  return execFileP('osascript', [
    '-e',
    'tell application "System Events" to keystroke "c" using command down'
  ]);
}

async function handleSelection(pt) {
  if (selecting) return;
  selecting = true;
  const prevClip = clipboard.readText();
  try {
    const SENTINEL = ' __pet__ ';
    clipboard.writeText(SENTINEL);        // 哨兵：用来判断是否真复制到了新内容
    await copySelection();                // 模拟 Cmd+C（需辅助功能权限）
    // 轮询等剪贴板更新：一拿到内容就立刻继续，比固定等待快得多
    let copied = '';
    for (let i = 0; i < 12; i++) {        // 最多 ~300ms 兜底
      await delay(25);
      copied = clipboard.readText();
      if (copied && copied !== SENTINEL) break;
    }
    clipboard.writeText(prevClip);        // 立刻还原剪贴板，不打扰用户
    if (!copied || copied === SENTINEL) return;     // 没选到文字
    const t = copied.trim();
    if (!t || t.length > 800) return;               // 空或太长
    if (!/[A-Za-z]/.test(t)) return;                // 不含英文字母 → 跳过
    if (t === lastSelText) return;                  // 和上次一样，别重复弹
    lastSelText = t;
    dbg('划词取到:', JSON.stringify(t.slice(0, 40)));
    showTip(pt.x, pt.y, '翻译中…');                 // 先立刻弹占位气泡，消除等待感
    const out = (await translateText(t) || '').trim();
    dbg('划词翻译完成, 长度=', out.length);
    if (out) showTip(pt.x, pt.y, out);              // 译文回来原地替换
    else hideTip();
  } catch (err) {
    dbg('划词出错:', err.code || '', err.message || String(err));
    hideTip();
  } finally {
    selecting = false;
  }
}

function startSelectionTranslate() {
  // 划词取词/监听鼠标都需要「辅助功能」权限。没授权先弹系统授权请求，
  // 这会把「点点」加入 系统设置→隐私与安全性→辅助功能 列表，方便用户打开。
  if (process.platform === 'darwin' && !systemPreferences.isTrustedAccessibilityClient(false)) {
    systemPreferences.isTrustedAccessibilityClient(true);
    dbg('未授权「辅助功能」，已弹出系统授权请求；授权后请重启「点点」');
    petBubble('划词翻译需要「辅助功能」权限：系统设置→隐私与安全性→辅助功能 打开「点点」后重启我', false);
  }

  uIOhook.on('mousedown', () => {
    mDown = screen.getCursorScreenPoint();
    hideTip();                            // 一按下就收起上一个气泡
  });
  uIOhook.on('mouseup', (e) => {
    const pt = screen.getCursorScreenPoint();
    const dist = Math.hypot(pt.x - mDown.x, pt.y - mDown.y);
    const isDouble = (e.clicks || 0) >= 2;
    if (!isDouble && dist < 5) return;    // 普通单击，不是选择动作
    if (pointInWindow(mDown, petWin) || pointInWindow(mDown, tipWin)) return; // 拖桌宠/气泡
    handleSelection(pt);
  });
  try {
    uIOhook.start();
    dbg('划词翻译已启动（全局鼠标监听）');
  } catch (err) {
    dbg('uIOhook 启动失败:', err.message || String(err));
  }
}

// ── Claude Code 工作状态：由 Claude Code 的 hooks 写状态文件，桌宠监听文件变化 ──
// hooks 配置在 ~/.claude/settings.json，写入动作交给 scripts/pet-claude-hook.sh。
// 状态值：working（工作中）/ waiting（等你操作）/ done（搞定了）。
const PET_STATE_FILE = path.join(os.homedir(), '.claude', 'pet-state');

function readPetState() {
  try { return fs.readFileSync(PET_STATE_FILE, 'utf-8').trim(); } catch { return ''; }
}

let lastClaudeState = '';
function dispatchClaudeState() {
  const s = readPetState();
  if (!s || s === lastClaudeState) return;   // 没变化就不重复派发（PreToolUse 会频繁写 working）
  lastClaudeState = s;
  dbg('Claude 状态 →', s);
  if (petWin && !petWin.isDestroyed()) petWin.webContents.send('pet:claude', s);
}

function watchPetState() {
  // 启动时先记下当前值（忽略上次遗留的状态，只对之后的变化做反应）
  lastClaudeState = readPetState();
  // fs.watchFile 用轮询实现，跨平台稳定；文件后来才被创建也能触发。
  try {
    fs.watchFile(PET_STATE_FILE, { interval: 400 }, () => dispatchClaudeState());
    dbg('已开始监听 Claude 状态文件:', PET_STATE_FILE);
  } catch (err) {
    dbg('watchPetState 失败:', err.message || String(err));
  }
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
    createTipWindow();
    const regOk = globalShortcut.register('Control+Command+A', translateScreenshot);
    dbg('启动: 快捷键 Control+Command+A registered =', regOk,
      '| isRegistered =', globalShortcut.isRegistered('Control+Command+A'));

    // 划词翻译：全局监听鼠标，选中英文即弹气泡
    startSelectionTranslate();

    // 监听 Claude Code hooks 写入的工作状态文件
    watchPetState();
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    try { uIOhook.stop(); } catch { /* 没启动成功时忽略 */ }
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
