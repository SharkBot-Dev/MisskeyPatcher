export function getHost() {
    const url = new URL(location.href);
    return url.hostname
}

export function getOrigin() {
    const url = new URL(location.href);
    return url.origin
}