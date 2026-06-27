// OpenRouter 流式请求（在主进程跑，渲染进程拿不到 API Key）。
const { readConfig } = require('./config');

const SYSTEM_PROMPT =
  '你是一只叫「小鸡毛」的桌面宠物小狗，性格活泼可爱。' +
  '请用简短、口语化、温暖的中文回复，可以偶尔用“汪”或颜文字，但不要太长。';

// history: [{role, content}, ...]
// onDelta(textChunk)：每拿到一小段就回调一次
// 返回完整回复文本；出错抛 Error（err.code === 'NO_API_KEY' 表示没配 Key）
async function streamChat(history, { onDelta, signal } = {}) {
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
    body: JSON.stringify({
      model: cfg.model,
      stream: true,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...history]
    })
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

module.exports = { streamChat };
