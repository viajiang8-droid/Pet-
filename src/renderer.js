// ── 桌宠三态：默认活动(moren) → 20s 没互动就休息(sleep) → 鼠标摸一下就反应(week) ──
// 帧数不写死：启动时按 01.png、02.png… 顺序探测，加载失败即视为该动作帧已读完。
// 这样换形象时无论多少帧、源图怎么命名（由 scripts/sync-frames.sh 统一成 0N.png）都不用改代码。
const FRAMES_BASE = '../assets/pets/diandian/frames';
const ANIMS = {
  idle:   { fps: 10 }, // 默认待机：原地蹲着挥手打招呼
  walk:   { fps: 10 }, // 走路：待机时隔一会儿往左/右走一段再走回来
  cheer:  { fps: 12 }, // 庆祝：Claude 任务完成时开心一下
  stretch:{ fps: 8 },  // 溜达（备用，暂未使用）
  hello:  { fps: 8 },  // 旧版招呼（备用，暂未使用）
  moren:  { fps: 8 },  // 活动（备用，暂未使用）
  sleep:  { fps: 6 },  // 休息：20 秒没互动后趴窝睡觉
  week:   { fps: 8 },  // 反应：鼠标摸一下
  roll:   { fps: 12 }, // 翻滚：在身上打圈抚摸触发，播一遍
};
const DEFAULT_ANIM = 'idle';
const SLEEP_AFTER_MS = 20000;    // 默认状态下 20 秒没互动 → 去睡觉
const MAX_FRAMES = 60;           // 探测上限，防一直找不到尽头时空转

const padded = (n) => String(n).padStart(2, '0');

// 逐帧探测加载某个动作的所有图片，存进 cache[name]。Promise 在探到尽头时 resolve。
const cache = {};
function preload(name) {
  cache[name] = [];
  return new Promise((resolve) => {
    let n = 1;
    const tryNext = () => {
      if (n > MAX_FRAMES) return resolve();
      const img = new Image();
      img.onload = () => { cache[name].push(img); n++; tryNext(); };
      img.onerror = () => resolve();   // 第 n 帧不存在 → 帧已读完
      img.src = `${FRAMES_BASE}/${name}/${padded(n)}.png`;
    };
    tryNext();
  });
}

const petEl = document.getElementById('pet');
const bubbleEl = document.getElementById('bubble');

let current = DEFAULT_ANIM;
let frame = 0;
let timer = null;
let idleTimer = null;
let rolling = false;     // 正在翻滚时，别被 hover/移开/睡觉打断

// 循环播放某个动作
function play(name) {
  const frames = cache[name];
  if (!frames || frames.length === 0) return;   // 帧还没探测好/该动作没图，跳过
  current = name;
  frame = 0;
  if (timer) clearInterval(timer);
  petEl.src = frames[0].src;
  timer = setInterval(() => {
    const fs = cache[current];
    petEl.src = fs[frame].src;
    frame = (frame + 1) % fs.length;
  }, 1000 / ANIMS[name].fps);
}

// 把某个动作从头到尾播放一遍（不循环），播完调用 done。
function playOnce(name, done) {
  const frames = cache[name];
  if (!frames || frames.length === 0) { if (done) done(); return; }
  current = name;
  if (timer) clearInterval(timer);
  let i = 0;
  petEl.src = frames[0].src;
  timer = setInterval(() => {
    i++;
    if (i >= frames.length) {        // 最后一帧播完
      clearInterval(timer);
      timer = null;
      if (done) done();
      return;
    }
    petEl.src = frames[i].src;
  }, 1000 / ANIMS[name].fps);
}

// 随机自己打个滚：待机时偶尔自发触发，播一遍 roll 后继续待机。
// 不重置睡眠倒计时，所以一直没人理它，打滚/走动几次后仍会照常去睡觉。
function doRandomRoll() {
  rolling = true;
  playOnce('roll', () => {
    rolling = false;
    if (current === 'roll') { play(DEFAULT_ANIM); scheduleWalk(); }
  });
}

// ── 头顶气泡 ──
let bubbleHideTimer = null;
let speechTimer = null;
let bubbleBusy = false;   // 翻译 / Claude 状态占用气泡时，普通提示别打断

// 头部说一句话（自动换行的小气泡，约 3.5 秒后消失）
function say(text) {
  if (bubbleBusy) return;
  clearTimeout(speechTimer);
  bubbleEl.classList.remove('long', 'status', 'hidden');
  bubbleEl.classList.add('speech');
  bubbleEl.textContent = text;
  window.petAPI.resize(240, 240);
  speechTimer = setTimeout(() => {
    if (bubbleBusy) return;            // 已被翻译/状态接管就别还原
    bubbleEl.classList.add('hidden');
    bubbleEl.classList.remove('speech');
    window.petAPI.resize(160, 220);
  }, 3500);
}

// 回到默认活动状态：播放待机动画 + 自我介绍，并开始 20 秒睡觉倒计时 + 安排走动
function goDefault() {
  play(DEFAULT_ANIM);
  say('Hi, 我叫点点，请开始你的表演');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(enterSleep, SLEEP_AFTER_MS);
  scheduleWalk();
}

// 20 秒没互动 → 去休息（睡着了就别再走动/打滚）
function enterSleep() {
  cancelWalk();
  rolling = false;        // 若正好在打滚中途，复位标志防卡住
  play('sleep');
  say('我要歇一会啦');
}

// ── 自己走来走去：待机时隔一会儿往左/右走一段，再原样走回起点，然后继续待机 ──
// 不重置睡眠倒计时，所以一直没人理它，走一两趟后仍会照常去睡觉。
let walking = false;
let walkTimer = null;
let strollTimer = null;            // 下一次走动的定时器
const WALK_AFTER_MS = 6000;        // 进入待机约 6 秒后走一趟
const WALK_STEP = 4;               // 每帧位移像素
const WALK_TICK_MS = 20;           // 每帧间隔 → 约 200px/秒
const WALK_DIST_MIN = 90;          // 单程最短距离
const WALK_DIST_MAX = 170;         // 单程最长距离
const WALK_FACES_RIGHT = false;    // 走路素材默认朝左（实测：true 时朝向反了）

// 让贴图朝向某方向（dir: 1=右, -1=左）。用水平翻转实现。
// 注意：.pet 本身用 translateX(-50%) 居中，翻转时必须保留它，否则位置会偏。
function faceDir(dir) {
  const flip = WALK_FACES_RIGHT ? dir < 0 : dir > 0;
  petEl.style.transform = flip ? 'translateX(-50%) scaleX(-1)' : '';
}

const ROLL_CHANCE = 0.4;           // 自发动作里约 40% 概率打滚，其余走动

// 安排下一次自发动作（走动 / 打滚）
function scheduleWalk() {
  clearTimeout(strollTimer);
  strollTimer = setTimeout(idleAction, WALK_AFTER_MS);
}

// 待机时的随机自发动作：随机决定打个滚还是走一趟
function idleAction() {
  // 只在「纯待机」时自发动作；睡觉/反应/翻滚/走动/拖动/Claude 工作时不打扰，稍后再试
  if (current !== DEFAULT_ANIM || rolling || dragging || walking || claudeBusy) { scheduleWalk(); return; }
  if (Math.random() < ROLL_CHANCE) doRandomRoll();
  else doWalk();
}

// 沿水平方向逐帧移动 total 像素（带符号），到位后回调 done。
function stepBy(total, done) {
  let remaining = total;
  clearInterval(walkTimer);
  walkTimer = setInterval(() => {
    if (remaining === 0) { clearInterval(walkTimer); walkTimer = null; done(); return; }
    const s = Math.sign(remaining) * Math.min(WALK_STEP, Math.abs(remaining));
    window.petAPI.moveBy(s, 0);
    remaining -= s;
  }, WALK_TICK_MS);
}

async function doWalk() {
  // 只在「纯待机」时走动；睡觉/反应/翻滚/拖动时不打扰，稍后再试
  if (current !== DEFAULT_ANIM || rolling || dragging || walking) { scheduleWalk(); return; }
  const b = await window.petAPI.getBounds();
  if (!b) { scheduleWalk(); return; }

  walking = true;
  let dir = Math.random() < 0.5 ? -1 : 1;                  // 随机左/右
  const dist = Math.round(WALK_DIST_MIN + Math.random() * (WALK_DIST_MAX - WALK_DIST_MIN));
  const minX = b.areaX;
  const maxX = b.areaX + b.areaW - b.winW;
  if (b.x + dir * dist < minX || b.x + dir * dist > maxX) dir = -dir;  // 撞边就改走另一边
  const target = Math.max(minX, Math.min(maxX, b.x + dir * dist));
  const out = target - b.x;                                // 实际外出位移（带符号）

  faceDir(dir);
  play('walk');
  stepBy(out, () => {            // 走到 target
    faceDir(-dir);              // 转身
    stepBy(-out, () => {        // 原样走回起点
      walking = false;
      petEl.style.transform = ''; // 复位朝向
      if (current === 'walk') { play(DEFAULT_ANIM); scheduleWalk(); }
    });
  });
}

// 打断走动（被互动/睡觉触发）：停止移动并复位朝向
function cancelWalk() {
  clearTimeout(strollTimer);
  if (walkTimer) { clearInterval(walkTimer); walkTimer = null; }
  walking = false;
  petEl.style.transform = '';
}

// 显示一段较长的内容：窗口临时变大以容纳多行气泡
function showBubble(text, sticky) {
  clearTimeout(speechTimer);
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
  bubbleEl.classList.remove('long', 'speech');
  bubbleBusy = false;
  window.petAPI.resize(160, 220); // 还原窗口大小
}

// ── 鼠标摸一下：播放 week 反应 + 提示（互动 → 取消睡觉倒计时）──
petEl.addEventListener('pointerenter', () => {
  if (rolling || claudeBusy) return;   // 翻滚 / Claude 状态展示中别打断
  cancelWalk();                 // 正在走就先停下，回到原地反应
  clearTimeout(idleTimer);
  play('week');
  say('有什么好消息呀');
});

// 移开：回到默认活动状态，并重新开始 20 秒倒计时
petEl.addEventListener('pointerleave', () => {
  if (!dragging && !rolling && !claudeBusy) goDefault();   // 拖动/翻滚/Claude 状态时别打断
});

// （打滚改为待机时随机自发触发，见 idleAction / doRandomRoll；不再由抚摸触发）

// 右键菜单里的「打招呼」
window.petAPI.onAction((action) => {
  if (action === 'hello') say('你好呀');
});

// 主进程要在头顶气泡里显示内容（截图翻译）。空文本表示收起气泡。
window.petAPI.onBubble(({ text, sticky }) => {
  if (text) showBubble(text, sticky);
  else hideBubble();
});

// ── Claude Code 工作状态提示（由 Claude Code 的 hooks 驱动：working / waiting / done） ──
let claudeTimer = null;
let claudeStart = 0;
let claudeActive = false;   // 是否处于一轮任务里（用于累计用时）
let claudeBusy = false;     // 工作/等待/庆祝期间：暂停走动、不被 hover 打断
let celebrating = false;    // 正在播庆祝动画/收尾，期间来了新状态就别再自动回待机

function fmtDur(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, '0');
  return m >= 60
    ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${ss}`
    : `${m}:${ss}`;
}

// 显示一行状态气泡（带脉冲样式）
function showStatusBubble(text) {
  clearTimeout(speechTimer);
  clearTimeout(bubbleHideTimer);
  clearInterval(claudeTimer);
  claudeTimer = null;
  bubbleBusy = true;
  bubbleEl.classList.remove('long', 'speech', 'hidden');
  bubbleEl.classList.add('status');
  bubbleEl.textContent = text;
  window.petAPI.resize(240, 220);
}

// 干净地回到待机（不重复念自我介绍）
function resumeIdle() {
  play(DEFAULT_ANIM);
  clearTimeout(idleTimer);
  idleTimer = setTimeout(enterSleep, SLEEP_AFTER_MS);
  scheduleWalk();
}

// 1) 工作中：显示「工作中 · 用时」并每秒刷新
function claudeWorking() {
  cancelWalk();
  clearTimeout(idleTimer);          // 工作期间不去睡觉
  claudeBusy = true;
  celebrating = false;              // 新一轮工作开始，取消上一轮的庆祝收尾
  if (!claudeActive) { claudeActive = true; claudeStart = Date.now(); }
  showStatusBubble('🐾 工作中 · ' + fmtDur(Date.now() - claudeStart));
  claudeTimer = setInterval(() => {
    bubbleEl.textContent = '🐾 工作中 · ' + fmtDur(Date.now() - claudeStart);
  }, 1000);
}

// 2) 等你操作：Claude 在等确认/输入
function claudeWaiting() {
  cancelWalk();
  clearTimeout(idleTimer);
  claudeBusy = true;
  celebrating = false;
  showStatusBubble('✋ 等你操作');
}

// 3) 搞定了：显示完成 + 播一遍庆祝动画，随后回到待机
function claudeDone() {
  cancelWalk();
  const used = claudeActive ? ' 用时 ' + fmtDur(Date.now() - claudeStart) : '';
  claudeActive = false;
  claudeBusy = true;
  celebrating = true;
  showStatusBubble('🎉 搞定了！' + used);
  rolling = true;                   // 庆祝期间不被 hover / 自发动作打断
  playOnce('cheer', () => {
    rolling = false;
    clearTimeout(bubbleHideTimer);
    bubbleHideTimer = setTimeout(() => {  // 庆祝完气泡再停留一会儿
      if (!celebrating) return;           // 期间已开始新一轮工作，别回待机
      celebrating = false;
      claudeBusy = false;
      hideBubble();
      resumeIdle();
    }, 2000);
  });
}

window.petAPI.onClaude((state) => {
  if (state === 'working') claudeWorking();
  else if (state === 'waiting') claudeWaiting();
  else if (state === 'done') claudeDone();
});

// ── 拖动（保留）：按住小狗拖到桌面任意位置 ──
let dragging = false;
let grabX = 0;
let grabY = 0;

petEl.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return; // 只用左键拖动，右键留给菜单
  cancelWalk();               // 抓住它时停止自动走动，交给用户拖
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

// 启动：先把三个动作的帧都探测加载好，再进入默认活动状态
Promise.all(Object.keys(ANIMS).map(preload)).then(goDefault);
