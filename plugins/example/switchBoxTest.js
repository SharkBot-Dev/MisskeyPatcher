api.toast(`<div id="testSwitchBox"></div>`, {html: true, noTimeout: true});

const toggle = api.addComponent('switch', {
    checked: false,
    onChange: (checked) => api.toast(`スイッチボックス: ${checked}`),
});

const switchLabel = api.addComponent("switchLabel", {
    label: "スイッチボックス",
    text: "On/Offできます!便利!"
});

toggle.append(switchLabel);

document.getElementById("testSwitchBox").append(toggle);