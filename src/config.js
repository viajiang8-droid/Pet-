// 配置读写：存到 Electron 的 userData 目录（在项目文件夹之外），
// 所以 API Key 天然不会进到 Git 仓库里。
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const DEFAULTS = {
  baseURL: 'https://openrouter.ai/api/v1/chat/completions',
  // gpt-4o-mini 已于 2026-03-31 退役，改用 OpenRouter 上便宜稳定的 gemini flash-lite
  model: 'google/gemini-3.1-flash-lite',
  apiKey: ''
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
