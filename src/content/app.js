import { state } from './state.js';
import { injectSettingsMenuItem } from './settings-menu.js';
import { injectSidebarMoreItems } from './sidebar-menu.js';
import { getChromeStorage, hostIsAllowed } from './storage.js';
import { waitForMisskey } from './detection.js';
import { openDisabledUserScriptsModal } from './help-modals.js';
import { installStyle } from './styles.js';
import { installRouteHooks, onRouteChange } from './routes.js';
import { register, executeStartUp, executeOnRouteChange } from '../patch/patchs.js';

function observeApp() {
  state.observer?.disconnect();
  state.observer = new MutationObserver(() => {
    injectSettingsMenuItem();
    injectSidebarMoreItems();
  });

  state.observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

export async function main() {
  const settings = await getChromeStorage();
  if (!settings.enabled || !hostIsAllowed(settings.allowedHosts)) return;
  if (!(await waitForMisskey())) return;

  state.active = true;
  document.documentElement.dataset.misskeyPatcherActive = 'true';
  document.documentElement.dataset.misskeyPatcherVersion = chrome.runtime?.getManifest?.().version ?? 'dev';

  chrome.runtime.sendMessage({ type: "errpr_user_script_check" }, (response) => {
    // console.log(response)
    if (response.type == "errpr_user_script_disabled") {
     openDisabledUserScriptsModal();
    }
  });

  installStyle('mkp-custom-style', settings.customCss);
  installRouteHooks();
  observeApp();
  injectSettingsMenuItem();
  injectSidebarMoreItems();

  await register();

  // loadDefaultPatch();
  await executeStartUp();

  onRouteChange(() => {
    injectSettingsMenuItem();
    injectSidebarMoreItems();

    // デフォルトパッチのonRouteChangeを発火

    executeOnRouteChange();
  });
}
