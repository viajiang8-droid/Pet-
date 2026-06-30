// 10 个主流犬种。头像用 emoji + 渐变底色自绘，1:1 圆形，不依赖外部图片。
const BREEDS = [
  { id: 'shiba',    name: '柴犬',   emoji: '🐕',     c1: '#f7b267', c2: '#f4845f' },
  { id: 'corgi',    name: '柯基',   emoji: '🐶',     c1: '#ffd29d', c2: '#f6a96b' },
  { id: 'golden',   name: '金毛',   emoji: '🦮',     c1: '#ffe08a', c2: '#f0b429' },
  { id: 'labrador', name: '拉布拉多', emoji: '🐕‍🦺', c1: '#f3e9d2', c2: '#d9b97a' },
  { id: 'husky',    name: '哈士奇', emoji: '🐺',     c1: '#aebfd4', c2: '#6b7c93' },
  { id: 'samoyed',  name: '萨摩耶', emoji: '🐩',     c1: '#ffffff', c2: '#dfe6ee' },
  { id: 'poodle',   name: '泰迪',   emoji: '🐩',     c1: '#d7a98c', c2: '#9c6b4a' },
  { id: 'collie',   name: '边牧',   emoji: '🐕',     c1: '#cfd8e3', c2: '#5b6b7d' },
  { id: 'frenchie', name: '法斗',   emoji: '🐶',     c1: '#cdc6bf', c2: '#8d8579' },
  { id: 'beagle',   name: '比格',   emoji: '🐶',     c1: '#e8d3b0', c2: '#b07d4e' },
];

const nameEl = document.getElementById('name');
const errorEl = document.getElementById('error');
const breedsEl = document.getElementById('breeds');
const form = document.getElementById('form');
const cancelBtn = document.getElementById('cancel');

let selectedId = null;

// 渲染品种头像
for (const b of BREEDS) {
  const tile = document.createElement('button');
  tile.type = 'button';
  tile.className = 'breed';
  tile.dataset.id = b.id;
  tile.innerHTML =
    `<span class="avatar" style="background:linear-gradient(135deg, ${b.c1}, ${b.c2})">${b.emoji}</span>` +
    `<span class="breed-name">${b.name}</span>`;
  tile.addEventListener('click', () => selectBreed(b.id));
  breedsEl.appendChild(tile);
}

function selectBreed(id) {
  selectedId = id;
  for (const t of breedsEl.children) {
    t.classList.toggle('selected', t.dataset.id === id);
  }
}

// 默认选中第一个，保证「宠物类型」始终有值（符合「选中类型后确认」）
selectBreed(BREEDS[0].id);

// 输入时清除错误态
nameEl.addEventListener('input', () => {
  nameEl.classList.remove('invalid');
  errorEl.textContent = '';
});

// 载入已创建过的宠物（重开弹窗时回填）
(async () => {
  try {
    const saved = await window.createPetAPI.get();
    if (saved && saved.petName) nameEl.value = saved.petName;
    if (saved && saved.petBreed && BREEDS.some((b) => b.id === saved.petBreed)) {
      selectBreed(saved.petBreed);
    }
  } catch { /* 没有就用默认 */ }
})();

// 确认：校验名称非空
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = nameEl.value.trim();
  if (!name) {
    errorEl.textContent = '请先填写宠物名称';
    nameEl.classList.add('invalid');
    nameEl.classList.remove('shake');
    void nameEl.offsetWidth;        // 重置动画
    nameEl.classList.add('shake');
    nameEl.focus();
    return;                          // 名称为空 → 无法确认
  }
  // 通过校验：保存并由主进程关闭弹窗
  window.createPetAPI.save({ name, breed: selectedId });
});

cancelBtn.addEventListener('click', () => window.createPetAPI.cancel());

// Esc 关闭
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.createPetAPI.cancel();
});

nameEl.focus();
