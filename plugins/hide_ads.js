// misskey.ioでのみ検証しています。

const check = api.store.get("hide-ads-enabled")
if (check == undefined || check == null) {
    api.store.set("hide-ads-enabled", "1")
}

const adsEnabled = api.store.get("hide-ads-enabled") == "1"

if (adsEnabled) {
    api.installStyle(`
.xA2Se {
    display: none;
}
`)
}

api.registerSidebarMoreItem({
  id: 'hide-ads-setting',
  name: '広告非表示設定',
  icon: 'ti ti-trash',
  order: 120,
}, () => {
    api.store.set("hide-ads-enabled", adsEnabled ? "0" : "1")
    api.toast('広告を' + (adsEnabled ? "表示するように" : "非表示に") + "しました。\n3秒後にリロードします。");

    setTimeout(() => location.reload(), 3000)
});