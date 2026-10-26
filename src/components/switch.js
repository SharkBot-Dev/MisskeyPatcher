const className = {
    root: "x1kPZ",
    toggle: "xEZjz",
    disabled: "xqcs3",
    input: "x6eY1",
    button: "xbIy7",
    buttonChecked: "xezk7",
    knob: "x3kAx",
    knobChecked: "xo7KL"
};

export function createSwitch(options = {}) {
    let {
        checked = false,
        disabled = false,
        onChange = () => {}
    } = options;

    const root = document.createElement("div");
    root.className = className.root;
    if (disabled) {
        root.classList.add(className.disabled);
    }

    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = className.input;
    input.disabled = disabled;
    input.checked = checked;

    const toggleButton = document.createElement("span");
    toggleButton.className = `${className.toggle} ${className.button}`;
    if (checked) {
        toggleButton.className = `${className.toggle} ${className.button} ${className.buttonChecked}`
        toggleButton.setAttribute("aria-checked", "true");
    }

    const knob = document.createElement("div");
    knob.className = `${className.knob}`;
    if (checked) {
        knob.className = `${className.knob} ${className.knobChecked}`;
    }

    const toggle = () => {
        if (disabled) return;
        checked = !checked;
        
        input.checked = checked;
        input.dispatchEvent(new Event('change'));
        
        if (checked) {
            toggleButton.setAttribute("aria-checked", "true");
            toggleButton.className = `${className.toggle} ${className.button}`

            knob.className = `${className.knob}`;
        } else {
            toggleButton.removeAttribute("aria-checked");
            toggleButton.className = `${className.toggle} ${className.button} ${className.buttonChecked}`

            knob.className = `${className.knob} ${className.knobChecked}`;
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

    root.getValue = () => checked;
    root.setValue = (val) => {
        if (disabled) return;
        checked = Boolean(val);
        input.checked = checked;
        if (checked) {
            toggleButton.setAttribute("aria-checked", "true");
            toggleButton.className = `${className.toggle} ${className.button}`

            knob.className = `${className.knob}`;
        } else {
            toggleButton.removeAttribute("aria-checked");
            toggleButton.className = `${className.toggle} ${className.button} ${className.buttonChecked}`

            knob.className = `${className.knob} ${className.knobChecked}`;
        }
    };

    return root;
}