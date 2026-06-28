// OpenRouter 请求（在主进程跑，渲染进程拿不到 API Key）。
const { readConfig } = require('./config');

const CHAT_SYSTEM =
  '你是一只叫「点点」的桌面宠物小狗，性格活泼可爱。' +
  '请用简短、口语化、温暖的中文回复，可以偶尔用“汪”或颜文字，但不要太长。';

const TRANSLATE_SYSTEM =
  '你是翻译助手。把用户给的英文翻译成简洁、自然的中文。' +
  '只输出中文译文本身，不要解释、不要保留英文原文。' +
  '如果输入不是英文，就直接把它翻译成中文或如实说明。';

const IMG_TRANSLATE_SYSTEM =
  '你是 OCR + 翻译助手。识别图片里的英文文字，翻译成简洁、自然的中文。' +
  '按原文的段落/换行组织，只输出中文译文本身，不要解释、不要保留英文原文。' +
  '如果图里没有可识别的英文，就如实说明。';

// 公共流式核心：发请求 + 解析 SSE。onDelta 可选；返回完整文本。
async function streamCompletion(messages, { onDelta, signal } = {}) {
  const cfg = readConfig();
  if (!cfg.apiKey) {
    const err = new Error('还没有配置 API Key');
    err.code = 'NO_API_KEY';
    throw err;
  }

  const res = await fetch(cfg.baseURL, {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://localhost/desktop-pet',
      'X-Title': 'Desktop Pet'
    },
    body: JSON.stringify({ model: cfg.model, stream: true, messages })
  });

  if (!res.ok) {
    let detail = '';
    try { detail = (await res.text()).slice(0, 300); } catch { /* ignore */ }
    throw new Error(`接口返回 ${res.status}${detail ? '：' + detail : ''}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line || line.startsWith(':')) continue;     // 空行 / keep-alive 注释
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return full;
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) { full += delta; onDelta?.(delta); }
      } catch { /* 解析不了的行直接跳过 */ }
    }
  }

  return full;
}

// 非流式：一次拿到完整回复（用于截图翻译——结果一次性显示，且更稳，
// 不受某些「思考型」模型流式时把内容放进 reasoning 字段的影响）。
async function complete(messages) {
  const cfg = readConfig();
  if (!cfg.apiKey) {
    const err = new Error('还没有配置 API Key');
    err.code = 'NO_API_KEY';
    throw err;
  }

  const res = await fetch(cfg.baseURL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://localhost/desktop-pet',
      'X-Title': 'Desktop Pet'
    },
    body: JSON.stringify({ model: cfg.model, messages })
  });

  if (!res.ok) {
    let detail = '';
    try { detail = (await res.text()).slice(0, 300); } catch { /* ignore */ }
    throw new Error(`接口返回 ${res.status}${detail ? '：' + detail : ''}`);
  }

  const json = await res.json();
  return (json.choices?.[0]?.message?.content || '').trim();
}

// 聊天：带上人设 + 历史（流式，配合打字机效果）
function streamChat(history, opts) {
  return streamCompletion([{ role: 'system', content: CHAT_SYSTEM }, ...history], opts);
}

// 英译中：翻译一段选中的文字（非流式，纯文本，任意模型都能用）
function translateText(text) {
  return complete([
    { role: 'system', content: TRANSLATE_SYSTEM },
    { role: 'user', content: text }
  ]);
}

// 截图翻译：把一张 PNG 截图交给多模态模型，识别英文并翻成中文（非流式）。
// base64Png 是不带前缀的 base64 字符串。
function translateImage(base64Png) {
  return complete([
    { role: 'system', content: IMG_TRANSLATE_SYSTEM },
    {
      role: 'user',
      content: [
        { type: 'text', text: '识别这张图里的英文并翻译成中文，只输出中文译文。' },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Png}` } }
      ]
    }
  ]);
}

module.exports = { streamChat, translateText, translateImage };
