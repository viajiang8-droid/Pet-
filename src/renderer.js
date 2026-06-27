// ── 待机动画：原地循环播放 scratch 这组逐帧图片 ──────────────
// 一组动作 = 一串图片，按固定速度依次切换，就成了循环动画。

const FRAMES_BASE = '../assets/pets/little-mao-puppy/frames';
const ANIM = { name: 'scratch', frames: 6, fps: 10 }; // scratch 共 6 帧

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

let frame = 0;
function tick() {
  petEl.src = frames[frame].src;
  frame = (frame + 1) % ANIM.frames; // 到最后一帧就回到第一帧，无限循环
}
tick();
setInterval(tick, 1000 / ANIM.fps);

// ── 拖动（保留）：按住小狗拖到桌面任意位置 ──
let dragging = false;
let grabX = 0;
let grabY = 0;

petEl.addEventListener('pointerdown', (e) => {
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

// ── 右键退出（保留）──
window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  window.petAPI.menu();
});
