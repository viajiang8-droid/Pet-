// ── 桌宠三态：默认活动(moren) → 20s 没互动就休息(sleep) → 鼠标摸一下就反应(week) ──
const FRAMES_BASE = '../assets/pets/diandian/frames';
const ANIMS = {
  moren: { frames: 11, fps: 8 }, // 默认：活动，一直在动
  sleep: { frames: 8,  fps: 6 }, // 休息：20 秒没互动后趴窝睡觉
  week:  { frames: 4,  fps: 8 }, // 反应：鼠标摸一下
};
const DEFAULT_ANIM = 'moren';
const SLEEP_AFTER_MS = 20000;    // 默认状态下 20 秒没互动 → 去睡觉

const padded = (i) => String(i + 1).padStart(2, '0');

// 提前把所有动作的图片读进内存，切换时不会闪烁
const cache = {};
for (const name in ANIMS) {
  cache[name] = [];
  for (let i = 0; i < ANIMS[name].frames; i++) {
    const img = new Image();
    img.src = `${FRAMES_BASE}/${name}/${padded(i)}.png`;
    cache[name].push(img);
  }
}

const petEl = document.getElementById('pet');
const bubbleEl = document.getElementById('bubble');

let current = DEFAULT_ANIM;
let frame = 0;
let timer = null;
let idleTimer = null;

// 循环播放某个动作
function play(name) {
  current = name;
  frame = 0;
  if (timer) clearInterval(timer);
  petEl.src = cache[name][0].src;
  timer = setInterval(() => {
    petEl.src = cache[current][frame].src;
    frame = (frame + 1) % ANIMS[current].frames;
  }, 1000 / ANIMS[name].fps);
}

// 回到默认活动状态，并开始 20 秒倒计时（到点没互动就去睡觉）
function goDefault() {
  play(DEFAULT_ANIM);
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => play('sleep'), SLEEP_AFTER_MS);
}

goDefault(); // 启动即默认活动状态

// ── 头顶气泡：短问候 + 长内容（截图翻译结果）──
let bubbleTimer = null;
let bubbleHideTimer = null;
let bubbleBusy = false;   // 正在显示长气泡（翻译）时，别被悬停问候打断

function sayHello() {
  if (bubbleBusy) return;
  bubbleEl.classList.remove('long');
  bubbleEl.textContent = '你好呀';
  bubbleEl.classList.remove('hidden');
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => bubbleEl.classList.add('hidden'), 2500);
}

// 显示一段较长的内容：窗口临时变大以容纳多行气泡
function showBubble(text, sticky) {
  clearTimeout(bubbleTimer);
  clearTimeout(bubbleHideTimer);
  bubbleBusy = true;
  bubbleEl.textContent = text;
  bubbleEl.classList.add('long');
  bubbleEl.classList.remove('hidden');
  window.petAPI.resize(320, 360);
  if (!sticky) {
    bubbleHideTimer = setTimeout(hideBubble, 9000);
  }
}

function hideBubble() {
  bubbleEl.classList.add('hidden');
  bubbleEl.classList.remove('long');
  bubbleBusy = false;
  window.petAPI.resize(160, 220); // 还原窗口大小
}

// ── 鼠标摸一下：播放 week 反应 + 打招呼（互动 → 取消睡觉倒计时）──
petEl.addEventListener('pointerenter', () => {
  clearTimeout(idleTimer);
  play('week');
  sayHello();
});

// 移开：回到默认活动状态，并重新开始 20 秒倒计时
petEl.addEventListener('pointerleave', () => {
  if (!dragging) goDefault();   // 拖动时别打断
});

// 右键菜单里的「打招呼」
window.petAPI.onAction((action) => {
  if (action === 'hello') sayHello();
});

// 主进程要在头顶气泡里显示内容（截图翻译）
window.petAPI.onBubble(({ text, sticky }) => showBubble(text, sticky));

// ── Claude 运行状态提示框 ──
let claudeTimer = null;
let claudeStart = 0;

function fmtDur(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, '0');
  return m >= 60
    ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${ss}`
    : `${m}:${ss}`;
}

function showClaudeStatus() {
  clearTimeout(bubbleTimer);
  clearTimeout(bubbleHideTimer);
  bubbleBusy = true;
  claudeStart = Date.now();
  bubbleEl.classList.remove('long', 'hidden');
  bubbleEl.classList.add('status');
  bubbleEl.textContent = '🐾 Claude 运行中 · 0:00';
  window.petAPI.resize(240, 220);
  clearInterval(claudeTimer);
  claudeTimer = setInterval(() => {
    bubbleEl.textContent = '🐾 Claude 运行中 · ' + fmtDur(Date.now() - claudeStart);
  }, 1000);
}

function endClaudeStatus() {
  clearInterval(claudeTimer);
  claudeTimer = null;
  bubbleEl.classList.remove('status');
  bubbleEl.textContent = '🐾 Claude 运行成功 ✓ 用时 ' + fmtDur(Date.now() - claudeStart);
  clearTimeout(bubbleHideTimer);
  bubbleHideTimer = setTimeout(hideBubble, 6000);
}

window.petAPI.onClaude((state) => {
  if (state === 'running') showClaudeStatus();
  else if (state === 'done') endClaudeStatus();
});

// ── 拖动（保留）：按住小狗拖到桌面任意位置 ──
let dragging = false;
let grabX = 0;
let grabY = 0;

petEl.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return; // 只用左键拖动，右键留给菜单
  dragging = true;
  grabX = e.clientX;
  grabY = e.clientY;
  petEl.setPointerCapture(e.pointerId);
});

petEl.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  window.petAPI.move(e.screenX - grabX, e.screenY - grabY);
});

petEl.addEventListener('pointerup', (e) => {
  dragging = false;
  petEl.releasePointerCapture(e.pointerId);
});

// ── 右键菜单 ──
window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  window.petAPI.menu();
});
