// ── 聊天逻辑：接 OpenRouter 真 AI，流式 + 打字机效果 ──────────
const PET_AVATAR = '../assets/pets/diandian/frames/zoulu/01.png';

const messagesEl = document.getElementById('messages');
const form = document.getElementById('composer');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send');
const banner = document.getElementById('banner');
const bannerSettings = document.getElementById('banner-settings');

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// who: 'me'（右侧蓝）| 'pet'（左侧灰带头像）。返回气泡元素，便于继续往里填字。
function addMessage(text, who) {
  const row = document.createElement('div');
  row.className = `row ${who}`;

  if (who === 'pet') {
    const avatar = document.createElement('img');
    avatar.className = 'msg-avatar';
    avatar.src = PET_AVATAR;
    avatar.alt = '';
    row.appendChild(avatar);
  }

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;
  row.appendChild(bubble);

  messagesEl.appendChild(row);
  scrollToBottom();
  return bubble;
}

function addSystemNote(text) {
  const note = document.createElement('div');
  note.className = 'system-note';
  note.textContent = text;
  messagesEl.appendChild(note);
  scrollToBottom();
}

// ── 「正在输入」气泡 ──
let typingRow = null;
function showTyping() {
  if (typingRow) return;
  typingRow = document.createElement('div');
  typingRow.className = 'row pet';
  const avatar = document.createElement('img');
  avatar.className = 'msg-avatar';
  avatar.src = PET_AVATAR;
  avatar.alt = '';
  const bubble = document.createElement('div');
  bubble.className = 'bubble typing';
  bubble.append(
    document.createElement('span'),
    document.createElement('span'),
    document.createElement('span')
  );
  typingRow.append(avatar, bubble);
  messagesEl.appendChild(typingRow);
  scrollToBottom();
}
function hideTyping() {
  if (typingRow) { typingRow.remove(); typingRow = null; }
}

// ── 打字机：流式内容先进队列，再按字均匀吐出来 ──
let petBubble = null;   // 当前正在填的桌宠气泡
let pending = '';       // 还没显示的字
let drainTimer = null;
let streaming = false;  // 主进程是否还在往这边发

function startDrain() {
  if (drainTimer) return;
  drainTimer = setInterval(() => {
    if (pending.length === 0) {
      if (!streaming) { clearInterval(drainTimer); drainTimer = null; finishReply(); }
      return;
    }
    petBubble.textContent += pending[0];
    pending = pending.slice(1);
    scrollToBottom();
  }, 22);
}

function finishReply() {
  setBusy(false);
  petBubble = null;
}

// ── 收发状态 ──
function setBusy(busy) {
  input.disabled = busy;
  sendBtn.disabled = busy || input.value.trim() === '';
}

function refreshSendState() {
  if (!input.disabled) sendBtn.disabled = input.value.trim() === '';
}
input.addEventListener('input', refreshSendState);

// ── 来自主进程的流式回调 ──
window.chatAPI.onDelta((chunk) => {
  if (!petBubble) { hideTyping(); petBubble = addMessage('', 'pet'); }
  pending += chunk;
  startDrain();
});

window.chatAPI.onDone(() => {
  streaming = false;
  startDrain(); // 确保把队列里剩下的字吐完
});

window.chatAPI.onError((info) => {
  streaming = false;
  hideTyping();
  petBubble = null;
  if (info && info.code === 'NO_API_KEY') {
    showBanner();
    addSystemNote('请先在「设置」里填好 API Key');
  } else {
    addSystemNote('出错了：' + (info && info.message ? info.message : '请求失败'));
  }
  setBusy(false);
});

// ── 发送 ──
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text || input.disabled) return;

  addMessage(text, 'me');
  input.value = '';
  setBusy(true);

  streaming = true;
  pending = '';
  petBubble = null;
  showTyping();
  window.chatAPI.send(text);
});

// ── 未配置 Key 的提示横幅 ──
function showBanner() { banner.classList.remove('hidden'); }
function hideBanner() { banner.classList.add('hidden'); }
bannerSettings.addEventListener('click', () => window.chatAPI.openSettings());

async function checkConfig() {
  const { hasKey } = await window.chatAPI.getConfigStatus();
  if (hasKey) hideBanner(); else showBanner();
}
window.chatAPI.onConfigChanged(checkConfig);

// 开场白 + 初始检查配置
addMessage('汪！有什么想跟我说的吗～', 'pet');
refreshSendState();
checkConfig();
