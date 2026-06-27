// ── 宠物：会在桌面上溜达 ────────────────────────────────────
// 思路：页面自己记着「我在哪」，每隔一会儿决定站着发呆 / 做个小动作 / 走去某处。
// 走的时候，让窗口的位置一点点挪过去，同时播放走路动画、朝向跟着翻转。

const FRAMES_BASE = '../assets/pets/little-mao-puppy/frames';

const ANIMATIONS = {
  walk:    { frames: 8, fps: 10 },
  roll:    { frames: 6, fps: 12 },
  scratch: { frames: 6, fps: 10 },
  cheer:   { frames: 5, fps: 10 },
  wave:    { frames: 4, fps: 8 },
};

const ACTIONS = ['roll', 'scratch', 'cheer', 'wave']; // 发呆时偶尔随机做一个

// 走路素材默认朝右；若发现走反了，把这里改成 false 即可
const ART_FACES_RIGHT = true;
const WALK_SPEED = 1.4; // 每帧(约16ms)移动的像素，越大走得越快

const padded = (i) => String(i + 1).padStart(2, '0');
const framePath = (name, i) => `${FRAMES_BASE}/${name}/${padded(i)}.png`;

// 提前把图片读进内存，切换不闪烁
const cache = {};
for (const name in ANIMATIONS) {
  cache[name] = [];
  for (let i = 0; i < ANIMATIONS[name].frames; i++) {
    const img = new Image();
    img.src = framePath(name, i);
    cache[name].push(img);
  }
}

const petEl = document.getElementById('pet');

// ── 位置与状态 ──
let posX = 0;
let posY = 0;
let work = { x: 0, y: 0, width: 1440, height: 900 };
let WIN = 160;

let mode = 'idle';       // idle（发呆）| walk（走）| action（做动作）| drag（被拖）
let targetX = null;      // 走路目标的窗口 x
let facing = 1;          // 1=朝右, -1=朝左
let dragging = false;
let behaviorTimer = null;

// ── 帧动画引擎 ──
let animName = null;
let animFrame = 0;
let animLoop = true;
let animTimer = null;
let onAnimEnd = null;

function playAnim(name, { loop = true, onEnd = null } = {}) {
  animName = name;
  animFrame = 0;
  animLoop = loop;
  onAnimEnd = onEnd;
  if (animTimer) clearInterval(animTimer);
  petEl.src = cache[name][0].src;
  animTimer = setInterval(() => {
    petEl.src = cache[animName][animFrame].src;
    animFrame++;
    if (animFrame >= ANIMATIONS[animName].frames) {
      if (animLoop) {
        animFrame = 0;
      } else {
        clearInterval(animTimer);
        animTimer = null;
        const cb = onAnimEnd;
        onAnimEnd = null;
        if (cb) cb();
      }
    }
  }, 1000 / ANIMATIONS[name].fps);
}

function showStill() {
  if (animTimer) { clearInterval(animTimer); animTimer = null; }
  petEl.src = cache.walk[0].src; // 站着不动用走路的第一帧
}

function setFacing(dir) {
  facing = dir;
  const flip = (ART_FACES_RIGHT ? dir : -dir);
  petEl.style.transform = `scaleX(${flip})`;
}

// ── 行为决策 ──
function enterIdle() {
  mode = 'idle';
  showStill();
  const wait = 1500 + Math.random() * 3000;
  behaviorTimer = setTimeout(decideNext, wait);
}

function decideNext() {
  if (dragging) return;
  if (Math.random() < 0.6) {
    startWalk();
  } else {
    mode = 'action';
    const a = ACTIONS[Math.floor(Math.random() * ACTIONS.length)];
    playAnim(a, { loop: false, onEnd: enterIdle });
  }
}

function startWalk() {
  mode = 'walk';
  const minX = work.x;
  const maxX = work.x + work.width - WIN;
  const span = maxX - minX;
  let t;
  do {
    t = minX + Math.random() * span;
  } while (Math.abs(t - posX) < 80 && span > 160); // 别走太近的距离
  targetX = t;
  setFacing(targetX >= posX ? 1 : -1);
  playAnim('walk', { loop: true });
}

// ── 移动循环：约 60fps，把窗口一点点挪向目标 ──
function moveLoop() {
  if (mode !== 'walk' || targetX === null || dragging) return;
  const dx = targetX - posX;
  const step = Math.sign(dx) * Math.min(WALK_SPEED, Math.abs(dx));
  posX += step;
  window.petAPI.move(posX, posY);
  if (Math.abs(targetX - posX) < 0.5) {
    posX = targetX;
    targetX = null;
    enterIdle();
  }
}

// ── 拖动：抱起来就停，放下就继续溜达 ──
petEl.addEventListener('pointerdown', (e) => {
  dragging = true;
  mode = 'drag';
  clearTimeout(behaviorTimer);
  showStill();
  petEl.dataset.grabX = e.clientX;
  petEl.dataset.grabY = e.clientY;
  petEl.setPointerCapture(e.pointerId);
});

petEl.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  posX = e.screenX - Number(petEl.dataset.grabX);
  posY = e.screenY - Number(petEl.dataset.grabY);
  window.petAPI.move(posX, posY);
});

petEl.addEventListener('pointerup', (e) => {
  dragging = false;
  petEl.releasePointerCapture(e.pointerId);
  enterIdle();
});

// 右键退出菜单
window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  window.petAPI.menu();
});

// ── 启动 ──
async function start() {
  const info = await window.petAPI.init();
  posX = info.pos[0];
  posY = info.pos[1];
  work = info.work;
  WIN = info.winSize;
  setFacing(1);
  setInterval(moveLoop, 16);
  mode = 'action';
  playAnim('wave', { loop: false, onEnd: enterIdle }); // 出场挥手打招呼
}

start().catch((err) => console.log('start() failed:', err && err.message));
