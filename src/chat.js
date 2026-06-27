// ── 聊天逻辑（先用固定回复，不接 AI）──────────────────────────
const PET_AVATAR = '../assets/pets/little-mao-puppy/frames/walk/01.png';
const FIXED_REPLY = '我收到啦';

const messagesEl = document.getElementById('messages');
const form = document.getElementById('composer');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send');

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// who: 'me'（自己，右侧蓝气泡）| 'pet'（桌宠，左侧灰气泡带头像）
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
}

// 「正在输入」气泡
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

// 开场白
addMessage('汪！有什么想跟我说的吗～', 'pet');

// 根据输入框是否为空，启用/禁用发送按钮
function refreshSendState() {
  sendBtn.disabled = input.value.trim() === '';
}
input.addEventListener('input', refreshSendState);
refreshSendState();

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  addMessage(text, 'me');
  input.value = '';
  refreshSendState();
  input.focus();

  // 先显示「正在输入」，短暂停顿后给出固定回复，更像真人
  showTyping();
  setTimeout(() => {
    hideTyping();
    addMessage(FIXED_REPLY, 'pet');
  }, 700);
});
