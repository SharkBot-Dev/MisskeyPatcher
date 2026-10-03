import { installPluginCommandListeners } from './content/plugin-commands.js';
import { installSidebarMenuListeners } from './content/sidebar-menu.js';
import { installSlashCommandListeners } from './content/slash-commands.js';
import { main } from './content/app.js';

installPluginCommandListeners();
installSidebarMenuListeners();
installSlashCommandListeners();
main();
