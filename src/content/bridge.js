export function parseBridgeDetail(detail) {
  if (typeof detail !== 'string') return null;
  try {
    return JSON.parse(detail);
  } catch {
    return null;
  }
}

function serializeBridgePayload(payload) {
  try {
    return JSON.stringify(payload);
  } catch {
    return JSON.stringify({ type: 'bridge-error', reason: 'Failed to serialize payload' });
  }
}

export function sanitizeSettingsItem(rawItem) {
  if (!rawItem || typeof rawItem !== 'object') return null;

  const id = String(rawItem.id ?? '').trim();
  const name = String(rawItem.name ?? rawItem.label ?? '').trim();
  if (!id || !name) return null;

  const icon = String(rawItem.icon ?? 'ti ti-plug ti-fw').trim();
  const order = Number.isFinite(Number(rawItem.order)) ? Number(rawItem.order) : 100;
  return {
    id,
    name,
    icon: icon || 'ti ti-plug ti-fw',
    order,
    pluginName: String(rawItem.pluginName ?? ''),
  };
}

export function sanitizeSidebarMoreItem(rawItem) {
  const item = sanitizeSettingsItem(rawItem);
  if (!item) return null;
  return {
    ...item,
    icon: item.icon || 'ti ti-plug ti-fw',
  };
}

export function sanitizeSlashCommand(rawItem) {
  if (!rawItem || typeof rawItem !== 'object') return null;

  const id = String(rawItem.id ?? '').trim();
  const name = String(rawItem.name ?? rawItem.label ?? '').trim();
  if (!id || !name) return null;

  const command = String(rawItem.command ?? rawItem.slash ?? name).replace(/^\/+/, '').trim();
  if (!command) return null;

  return {
    id,
    name,
    command,
    description: String(rawItem.description ?? '').trim(),
    icon: String(rawItem.icon ?? 'ti ti-slash ti-fw').trim() || 'ti ti-slash ti-fw',
    insert: typeof rawItem.insert === 'string' ? rawItem.insert : null,
    order: Number.isFinite(Number(rawItem.order)) ? Number(rawItem.order) : 100,
    pluginName: String(rawItem.pluginName ?? ''),
  };
}

export function emitPluginSettingsEvent(payload) {
  window.dispatchEvent(new CustomEvent('misskey-patcher:settings-event', {
    detail: serializeBridgePayload(payload),
  }));
}

export function emitPluginSidebarMoreEvent(payload) {
  window.dispatchEvent(new CustomEvent('misskey-patcher:sidebar-more-event', {
    detail: serializeBridgePayload(payload),
  }));
}

export function emitPluginSlashCommandEvent(payload) {
  window.dispatchEvent(new CustomEvent('misskey-patcher:slash-command-event', {
    detail: serializeBridgePayload(payload),
  }));
}
