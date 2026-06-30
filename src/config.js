// 配置读写：存到 Electron 的 userData 目录（在项目文件夹之外），
// 所以 API Key 天然不会进到 Git 仓库里。
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const DEFAULTS = {
  baseURL: 'https://openrouter.ai/api/v1/chat/completions',
  // gemini-flash-lite 在 OpenRouter 上会间歇路由到对部分区域受限的端点 → 偶发 403
  //「This model is not available in your region」。改用区域稳定、中文好、便宜的 deepseek-chat。
  model: 'deepseek/deepseek-chat',
  apiKey: '',
  petName: '',     // 「创建我的宠物」里填写的名称
  petBreed: ''     // 「创建我的宠物」里选中的品种 id
};

function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function readConfig() {
  try {
    const raw = fs.readFileSync(configPath(), 'utf-8');
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

function writeConfig(partial) {
  const merged = { ...readConfig(), ...partial };
  fs.writeFileSync(configPath(), JSON.stringify(merged, null, 2), 'utf-8');
  return merged;
}

module.exports = { readConfig, writeConfig, configPath, DEFAULTS };
