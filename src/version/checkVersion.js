export async function checkVersion() {
    const url = new URL(location.href);
    
    const metaRes = await fetch(url.origin + "/api/meta");
    const metaJson = await metaRes.json();

    const version = metaJson.version;

    return version;
}