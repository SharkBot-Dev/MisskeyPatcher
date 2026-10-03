export const DEFAULTS = {
  enabled: true,
  showBadge: true,
  allowedHosts: '',
  customCss: [
    '/* Example: make built Misskey pages feel slightly denser. */',
    ':root[data-misskey-patcher-active="true"] {',
    '  --mkp-patched-at: "extension";',
    '}',
    '',
    '[data-mkp-note-root] {',
    '  scroll-margin-top: 72px;',
    '}',
  ].join('\n'),
  customJs: [
    '// Runs as a Manifest V3 user script after Misskey is detected.',
    '// Available globals: window, document, api',
    'api.markNotes();',
    'api.onRouteChange(() => api.markNotes());',
  ].join('\n'),
  customPlugins: [],
};

export const INSTANCE_SETTINGS_KEY = 'instanceSettings';
