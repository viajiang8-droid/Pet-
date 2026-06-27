// ── 桌宠：平时静止，鼠标滑到身上才动一动并打招呼 ────────────
const FRAMES_BASE = '../assets/pets/little-mao-puppy/frames';
const ANIM = { name: 'scratch', frames: 6, fps: 10 }; // 用 scratch 这组动作

const padded = (i) => String(i + 1).padStart(2, '0');
const framePath = (i) => `${FRAMES_BASE}/${ANIM.name}/${padded(i)}.png`;

// 提前把图片读进内存，切换时不会闪烁
const frames = [];
for (let i = 0; i < ANIM.frames; i++) {
  const img = new Image();
  img.src = framePath(i);
  frames.push(img);
}

const petEl = document.getElementById('pet');
const bubbleEl = document.getElementById('bubble');

let frame = 0;
let timer = null;

function tick() {
  petEl.src = frames[frame].src;
  frame = (frame + 1) % ANIM.frames;
}

function startAnim() {
  if (timer) return;            // 已经在动了就不重复开
  timer = setInterval(tick, 1000 / ANIM.fps);
}

function stopAnim() {
  if (timer) { clearInterval(timer); timer = null; }
}

// 回到静止：停在第一帧
function showStill() {
  stopAnim();
  frame = 0;
  petEl.src = frames[0].src;
}

showStill(); // 默认静止不动

// ── 打招呼气泡 ──
let bubbleTimer = null;
function sayHello() {
  bubbleEl.classList.remove('hidden');
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => bubbleEl.classList.add('hidden'), 2500);
}

// ── 鼠标滑到身上：动起来 + 打招呼；移开就停 ──
petEl.addEventListener('pointerenter', () => {
  startAnim();
  sayHello();
});

petEl.addEventListener('pointerleave', () => {
  if (!dragging) showStill();   // 拖动时别打断
});

// 右键菜单里的「打招呼」也走这里
window.petAPI.onAction((action) => {
  if (action === 'hello') sayHello();
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
