export const patched = new WeakMap();

export function before(target, key, callback) {
    if (target == null || typeof target[key] !== "function") {
        throw new TypeError(`Function not found: ${String(key)}`);
    }

    const original = target[key];

    if (patched.has(original)) {
        return patched.get(original);
    }

    function wrapped(...args) {
        callback.call(this, args);

        return Reflect.apply(original, this, args);
    }

    target[key] = wrapped;
    patched.set(original, wrapped);

    return wrapped;
}

export function replace(target, key, replacement) {
    if (target == null || typeof target[key] !== "function") {
        throw new TypeError(`Function not found: ${String(key)}`);
    }

    const original = target[key];
    const wrapped = function (...args) {
        return replacement.call(this, original, args);
    };

    target[key] = wrapped;
    return wrapped;
}

Object.defineProperty(globalThis, "__MKEXT_PATCHER__", {
    value: Object.freeze({ before, replace }),
    configurable: false
});