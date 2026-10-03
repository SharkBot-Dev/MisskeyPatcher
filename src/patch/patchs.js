import hiddenUserName from "./hiddenUsername.js"
import userChan from "./userChan.js"

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

    executeStartUp();
}