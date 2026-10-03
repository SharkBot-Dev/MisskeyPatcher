import { DEFAULTS } from './defaults.js';

export function normalizePlugins(settings) {
  const plugins = Array.isArray(settings.customPlugins) ? settings.customPlugins : [];
  const normalized = plugins.map((plugin, index) => ({
    id: String(plugin?.id || `plugin-${index + 1}`),
    name: String(plugin?.name || `プラグイン ${index + 1}`),
    enabled: plugin?.enabled !== false,
    code: String(plugin?.code ?? ''),
  }));

  if (normalized.length > 0) return normalized;
  return [{
    id: `plugin-${Date.now().toString(36)}`,
    name: '基本プラグイン',
    enabled: true,
    code: settings.customJs ?? DEFAULTS.customJs,
  }];
}

export function createPlugin(code = '', name = '新しいプラグイン') {
  return {
    id: `plugin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    enabled: true,
    code,
  };
}

export function pluginNameFromFileName(fileName) {
  const baseName = String(fileName || '').split(/[\\/]/).pop() || '新しいプラグイン';
  return baseName.replace(/\.js$/i, '').trim() || '新しいプラグイン';
}

export function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result ?? '')));
    reader.addEventListener('error', () => reject(reader.error ?? new Error('ファイルを読み込めませんでした。')));
    reader.readAsText(file);
  });
}
