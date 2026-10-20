export const canonicalize = value => String(value);

export const filters = {
    byProps: (...props) => m =>
        m != null &&
        props.every(prop => m[prop] !== undefined),

    byCode: (...needles) => {
        const patterns = needles.map(canonicalize);

        return m => {
            if (typeof m !== "function") return false;

            const source = Function.prototype.toString.call(m);
            return patterns.every(pattern => source.includes(pattern));
        };
    },

    byStoreName: name => m =>
        m?.constructor?.displayName === name,

    componentByCode: (...needles) => {
        const matches = filters.byCode(...needles);

        return m => {
            const visited = new Set();
            let current = m;

            while (
                current != null &&
                (typeof current === "object" ||
                 typeof current === "function") &&
                !visited.has(current)
            ) {
                visited.add(current);

                if (matches(current)) return true;

                if (typeof current.setup === "function") {
                    if (matches(current.setup)) return true;
                }

                if (typeof current.render === "function") {
                    if (matches(current.render)) return true;
                }

                if (current.type) {
                    current = current.type;
                } else if (typeof current.render === "function") {
                    current = current.render;
                } else {
                    return false;
                }
            }

            return false;
        };
    },

    byClassNames: (...classes) => {
        const patterns = classes.map(
            name => new RegExp(
                `(^|\\s)${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`
            )
        );

        return m => {
            if (m == null || typeof m !== "object") return false;

            const values = Object.values(m);

            return patterns.every(pattern =>
                values.some(value =>
                    typeof value === "string" && pattern.test(value)
                )
            );
        };
    }
};

Object.defineProperty(globalThis, "__MKEXT_FILTERS__", {
    value: Object.freeze(filters),
    configurable: false
});