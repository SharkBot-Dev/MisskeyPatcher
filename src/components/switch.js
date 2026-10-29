import { getClassName } from "../className/default.js";

// Keep the switch's Misskey class names in className/default.js so the
// class name manager and the component always use the same defaults.
const className = Object.fromEntries([
    "root", "toggle", "disabled", "input", "button", "buttonChecked",
    "knob", "knobChecked", "label", "labelSpan", "labelText"
].map((key) => [key, () => getClassName(`switch.${key}`)]));

export function createSwitch(options = {}) {
    let {
        checked = false,
        defaultChecked = false,
        disabled = false,
        addClassName = null,
        name = null,
        onChange = () => {}
    } = options;

    const root = document.createElement("div");
    root.className = className.root();
    if (disabled) {
        root.classList.add(className.disabled());
    }

    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = className.input();
    input.disabled = disabled;
    if (checked) {
        input.checked = checked;
    }
    if (defaultChecked) {
        input.defaultChecked = defaultChecked;
    }

    if (addClassName) {
        input.className += ` ${addClassName}`
    }

    if (name) {
        input.name = name;
    }

    const toggleButton = document.createElement("span");
    toggleButton.className = `${className.toggle()} ${className.button()}`;
    if (checked) {
        toggleButton.className = `${className.toggle()} ${className.button()} ${className.buttonChecked()}`
        toggleButton.setAttribute("aria-checked", "true");
    }

    const knob = document.createElement("div");
    knob.className = `${className.knob()}`;
    if (checked) {
        knob.className = `${className.knob()} ${className.knobChecked()}`;
    }

    const toggle = () => {
        if (disabled) return;
        checked = !checked;
        
        input.checked = checked;
        input.dispatchEvent(new Event('change'));
        
        if (!checked) {
            toggleButton.setAttribute("aria-checked", "true");
            toggleButton.className = `${className.toggle()} ${className.button()}`

            knob.className = `${className.knob()}`;
        } else {
            toggleButton.removeAttribute("aria-checked");
            toggleButton.className = `${className.toggle()} ${className.button()} ${className.buttonChecked()}`

            knob.className = `${className.knob()} ${className.knobChecked()}`;
        }

        onChange(checked);
    };

    input.addEventListener("change", () => {
        if (input.checked !== checked) {
            checked = input.checked;
            onChange(checked);
        }
    });

    toggleButton.addEventListener("click", (e) => {
        e.preventDefault();
        toggle();
    });

    root.appendChild(input);
    toggleButton.appendChild(knob)
    root.appendChild(toggleButton);

    input.getValue = () => checked;
    input.setValue = (val) => {
        if (disabled) return;
        checked = Boolean(val);
        input.checked = checked;
        if (!checked) {
            toggleButton.setAttribute("aria-checked", "true");
            toggleButton.className = `${className.toggle()} ${className.button()}`

            knob.className = `${className.knob()}`;
        } else {
            toggleButton.removeAttribute("aria-checked");
            toggleButton.className = `${className.toggle()} ${className.button()} ${className.buttonChecked()}`

            knob.className = `${className.knob()} ${className.knobChecked()}`;
        }
    };

    return root;
}

export function createSwitchLabel(options = {}) {
    let {
        label = "",
        text = ""
    } = options;

    const span = document.createElement("span");
    span.className = `${className.label()}`;

    const labelSpan = document.createElement("span");
    labelSpan.className = `${className.labelSpan()}`;

    const labelSpanSpan = document.createElement("span");
    labelSpanSpan.textContent = label

    labelSpan.appendChild(labelSpanSpan);

    span.appendChild(labelSpan);

    if (text) {
        const pText = document.createElement("p");
        pText.className = `${className.labelText()}`;
        pText.textContent = text;
        span.appendChild(pText);
    }

    return span; 
}
