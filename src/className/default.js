export const metaData = {
  // "default" means these built-in class names are available on every Misskey instance.
  instance: "default",
  description: "Misskey classes used by Misskey Patcher"
};

// Misskey-owned classes are grouped by the UI feature that uses them.
// Extension classes (mkp-*) are intentionally kept in the feature code and CSS.
export const classNames = {
  settingsMenu: {
    container: "rrevdjwu",
    button: "_button item",
    icon: "icon",
    label: "text",
    group: "group",
    items: "items"
  },
  sidebarMenu: {
    button: "_button item",
    icon: "icon",
    label: "text"
  },
  switch: {
    root: "x1kPZ",
    toggle: "xEZjz",
    disabled: "xqcs3",
    input: "x6eY1",
    button: "xbIy7",
    buttonChecked: "xezk7",
    knob: "x3kAx",
    knobChecked: "xo7KL",
    label: "x9TaQ",
    labelSpan: "xDJmg",
    labelText: "xekRM"
  },
  icons: {
    settings: "ti ti-settings-2 ti-fw",
    plugin: "ti ti-plug ti-fw",
    privacy: "ti ti-lock-open ti-fw",
    games: "ti ti-device-gamepad ti-fw",
    other: "ti ti-dots ti-fw",
    classManager: "ti ti-code ti-fw",
    help: "ti ti-settings-2 ti-fw"
  }
};

let userOverrides = {};

export function setClassNameOverrides(overrides = {}) {
  userOverrides = overrides && typeof overrides === "object" ? overrides : {};
}

export function getClassName(path) {
  const flatOverride = userOverrides[path];
  if (typeof flatOverride === "string" && flatOverride.trim()) return flatOverride.trim();
  const keys = path.split(".");
  let value = userOverrides;
  for (const key of keys) value = value?.[key];
  if (typeof value === "string" && value.trim()) return value.trim();

  if (metaData.instance && metaData.instance !== "default"
    && location.hostname.toLowerCase() !== metaData.instance.toLowerCase()) return "";

  value = classNames;
  for (const key of keys) value = value?.[key];
  return typeof value === "string" ? value : "";
}
