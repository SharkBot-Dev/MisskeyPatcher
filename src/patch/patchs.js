import hiddenUserName from "./hiddenUsername.js"
import userChan from "./userChan.js"
import autoReversi from './autoReversi.js';

// import { filters } from "../filter/filter.js"

export let routeChangeExecute = [];
export let startUpExecute = [];

export async function executeOnRouteChange() {
    routeChangeExecute.forEach((routeChange) => {
        routeChange();
    })
}

export async function executeStartUp() {
    startUpExecute.forEach((startUp) => {
        startUp();
    })
}

export async function register() {
    hiddenUserName();
    userChan();
    autoReversi();

    executeStartUp();
}
