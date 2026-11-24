import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const srcRoot = path.join(root, "src");

function walk(dir, predicate) {
    const files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) files.push(...walk(full, predicate));
        else if (predicate(full)) files.push(full);
    }
    return files;
}

function relative(file) {
    return path.relative(root, file).replaceAll("\\", "/");
}

function lineAt(source, index) {
    return source.slice(0, index).split("\n").length;
}

function maskCssComments(source) {
    return source.replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\n]/g, " "));
}

function stripJsComments(source) {
    let out = "";
    let state = "normal";
    let quote = "";
    for (let i = 0; i < source.length; i++) {
        const ch = source[i];
        const next = source[i + 1];

        if (state === "line") {
            if (ch === "\n") {
                out += "\n";
                state = "normal";
            } else out += " ";
            continue;
        }

        if (state === "block") {
            if (ch === "*" && next === "/") {
                out += "  ";
                i++;
                state = "normal";
            } else out += ch === "\n" ? "\n" : " ";
            continue;
        }

        if (state === "string") {
            out += ch;
            if (ch === "\\") {
                if (i + 1 < source.length) out += source[++i];
                continue;
            }
            if (ch === quote) state = "normal";
            continue;
        }

        if (ch === "'" || ch === "\"" || ch === "`") {
            state = "string";
            quote = ch;
            out += ch;
            continue;
        }

        if (ch === "/" && next === "/") {
            out += "  ";
            i++;
            state = "line";
            continue;
        }

        if (ch === "/" && next === "*") {
            out += "  ";
            i++;
            state = "block";
            continue;
        }

        out += ch;
    }
    return out;
}

const THEME_STRUCTURAL_PROPERTIES = new Set([
    "display", "position", "width", "min-width", "max-width", "height", "min-height", "max-height",
    "padding", "padding-top", "padding-right", "padding-bottom", "padding-left", "padding-inline",
    "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
    "gap", "row-gap", "column-gap", "align-items", "align-self", "align-content",
    "justify-content", "justify-items", "justify-self",
    "flex", "flex-grow", "flex-shrink", "flex-basis", "flex-direction", "flex-wrap", "order",
    "grid", "grid-template-columns", "grid-template-rows", "grid-column", "grid-row",
    "grid-auto-flow", "grid-auto-columns", "grid-auto-rows",
    "top", "right", "bottom", "left", "inset", "overflow", "overflow-x", "overflow-y",
    "box-sizing", "z-index", "pointer-events", "object-fit", "object-position",
    "white-space", "text-overflow"
]);

const SIMPLE_COLOR = "(?:#[0-9a-fA-F]{3,8}\\b|rgba?\\([^()]*\\)|hsla?\\([^()]*\\)|white\\b|black\\b)";
const VAR_FALLBACK_COLOR = new RegExp("(var\\(\\s*--[A-Za-z0-9_-]+\\s*,\\s*)" + SIMPLE_COLOR + "(\\s*\\))", "gi");

function maskSimpleVarFallbackColors(source) {
    let current = source;
    while (true) {
        const next = current.replace(VAR_FALLBACK_COLOR, "$1QUESTUI_ALLOWED_FALLBACK$2");
        if (next === current) return current;
        current = next;
    }
}

function visualLiteralMatches(source) {
    const clean = maskSimpleVarFallbackColors(maskCssComments(source));
    const pattern = /#[0-9a-fA-F]{3,8}\b|rgba?\s*\(|hsla?\s*\(|(^|[^A-Za-z0-9_-])(white|black)(?=$|[^A-Za-z0-9_-])/gim;
    const hits = [];
    let match;
    while ((match = pattern.exec(clean))) {
        const index = match.index + (match[1]?.length ?? 0);
        hits.push({ index, line: lineAt(clean, index), value: match[2] ?? match[0].trim() });
    }
    return hits;
}

function parseDeclarations(source, masked, start, end) {
    const declarations = [];
    let i = start;
    let segmentStart = start;
    let quote = null;
    let parenDepth = 0;

    while (i <= end) {
        const ch = i < end ? masked[i] : ";";
        if (quote) {
            if (ch === "\\") {
                i += 2;
                continue;
            }
            if (ch === quote) quote = null;
            i++;
            continue;
        }
        if (ch === "'" || ch === "\"" || ch === "`") {
            quote = ch;
            i++;
            continue;
        }
        if (ch === "(") {
            parenDepth++;
            i++;
            continue;
        }
        if (ch === ")") {
            parenDepth = Math.max(0, parenDepth - 1);
            i++;
            continue;
        }
        if (ch === ";" && parenDepth === 0) {
            const raw = masked.slice(segmentStart, i);
            const colon = raw.indexOf(":");
            if (colon >= 0) {
                const property = raw.slice(0, colon).trim();
                const value = raw.slice(colon + 1).trim();
                if (property && value) {
                    declarations.push({
                        property,
                        value,
                        important: /!important\s*$/i.test(value)
                    });
                }
            }
            segmentStart = i + 1;
        }
        i++;
    }
    return declarations;
}

function parseCssRules(source) {
    const masked = maskCssComments(source);
    const rules = [];

    function walkRange(start, end, context) {
        let i = start;
        while (i < end) {
            while (i < end && /\s/.test(masked[i])) i++;
            if (i >= end) break;

            const headStart = i;
            let quote = null;
            let parenDepth = 0;
            while (i < end) {
                const ch = masked[i];
                if (quote) {
                    if (ch === "\\") {
                        i += 2;
                        continue;
                    }
                    if (ch === quote) quote = null;
                    i++;
                    continue;
                }
                if (ch === "'" || ch === "\"" || ch === "`") {
                    quote = ch;
                    i++;
                    continue;
                }
                if (ch === "(") {
                    parenDepth++;
                    i++;
                    continue;
                }
                if (ch === ")") {
                    parenDepth--;
                    i++;
                    continue;
                }
                if (parenDepth === 0 && (ch === "{" || ch === ";")) break;
                i++;
            }
            if (i >= end) break;

            const head = masked.slice(headStart, i).trim();
            if (masked[i] === ";") {
                i++;
                continue;
            }

            const open = i++;
            let depth = 1;
            quote = null;
            while (i < end && depth) {
                const ch = masked[i];
                if (quote) {
                    if (ch === "\\") {
                        i += 2;
                        continue;
                    }
                    if (ch === quote) quote = null;
                    i++;
                    continue;
                }
                if (ch === "'" || ch === "\"" || ch === "`") {
                    quote = ch;
                    i++;
                    continue;
                }
                if (ch === "{") depth++;
                else if (ch === "}") depth--;
                i++;
            }
            const close = i - 1;

            if (/^@(media|supports|container|layer)\b/.test(head)) {
                walkRange(open + 1, close, [...context, head.replace(/\s+/g, " ")]);
                continue;
            }
            if (/^@(?:-webkit-)?keyframes\b/.test(head) || head.startsWith("@")) continue;
            if (!head) continue;

            const body = masked.slice(open + 1, close);
            if (body.includes("{")) continue;
            rules.push({
                context: context.join(" || "),
                selector: head.replace(/\s+/g, " ").trim(),
                line: lineAt(source, headStart),
                declarations: parseDeclarations(source, masked, open + 1, close)
            });
        }
    }

    walkRange(0, masked.length, []);
    return rules;
}

function shadowedDeclarations(source) {
    const rules = parseCssRules(source);
    const groups = new Map();

    for (const rule of rules) {
        const key = rule.context + "@@" + rule.selector;
        const group = groups.get(key) ?? [];
        group.push(rule);
        groups.set(key, group);
    }

    const shadowed = [];
    for (const group of groups.values()) {
        for (let i = 0; i < group.length - 1; i++) {
            for (const declaration of group[i].declarations) {
                if (declaration.property.startsWith("--")) continue;
                for (let j = i + 1; j < group.length; j++) {
                    const later = [...group[j].declarations].reverse().find(candidate =>
                        candidate.property === declaration.property
                    );
                    if (later && (!declaration.important || later.important)) {
                        shadowed.push({
                            line: group[i].line,
                            selector: group[i].selector,
                            property: declaration.property,
                            context: group[i].context || "top-level"
                        });
                        break;
                    }
                }
            }
        }
    }
    return shadowed;
}

function emptyRules(source) {
    return parseCssRules(source)
        .filter(rule => rule.declarations.length === 0)
        .map(rule => ({ line: rule.line, selector: rule.selector, context: rule.context || "top-level" }));
}

function emptyAtRules(source) {
    const masked = maskCssComments(source);
    const hits = [];
    const pattern = /@(media|supports|container|layer)\b([^{}]*)\{\s*\}/g;
    let match;
    while ((match = pattern.exec(masked))) {
        hits.push({
            line: lineAt(source, match.index),
            kind: match[1],
            condition: match[2].trim()
        });
    }
    return hits;
}

function collectTokenGraph(cssFiles, sourceFiles) {
    const definitions = new Map();
    const uses = new Map();

    const push = (map, token, location) => {
        const values = map.get(token) ?? [];
        values.push(location);
        map.set(token, values);
    };

    for (const file of cssFiles) {
        const source = fs.readFileSync(file, "utf8");
        let match;
        const definitionPattern = /(--quest-ui-[A-Za-z0-9_-]+)\s*:/g;
        while ((match = definitionPattern.exec(source))) {
            push(definitions, match[1], { file: relative(file), line: lineAt(source, match.index) });
        }
        const usePattern = /var\(\s*(--quest-ui-[A-Za-z0-9_-]+)/g;
        while ((match = usePattern.exec(source))) {
            push(uses, match[1], { file: relative(file), line: lineAt(source, match.index) });
        }
    }

    for (const file of sourceFiles) {
        const source = stripJsComments(fs.readFileSync(file, "utf8"));
        let match;
        const objectDefinition = /["'`](--quest-ui-[A-Za-z0-9_-]+)["'`]\s*:/g;
        while ((match = objectDefinition.exec(source))) {
            push(definitions, match[1], { file: relative(file), line: lineAt(source, match.index) });
        }
        const setPropertyDefinition = /setProperty\(\s*["'`](--quest-ui-[A-Za-z0-9_-]+)["'`]/g;
        while ((match = setPropertyDefinition.exec(source))) {
            push(definitions, match[1], { file: relative(file), line: lineAt(source, match.index) });
        }
        const usePattern = /var\(\s*(--quest-ui-[A-Za-z0-9_-]+)/g;
        while ((match = usePattern.exec(source))) {
            push(uses, match[1], { file: relative(file), line: lineAt(source, match.index) });
        }
    }

    return { definitions, uses };
}

function validateRepository() {
    const cssFiles = walk(srcRoot, file => file.endsWith(".css"));
    const sourceFiles = [
        path.join(root, "index.tsx"),
        ...walk(srcRoot, file => /\.(?:ts|tsx)$/.test(file))
    ].filter(fs.existsSync);

    const failures = [];

    for (const file of cssFiles) {
        const source = fs.readFileSync(file, "utf8");
        const rel = relative(file);

        if (!rel.startsWith("src/themes/")) {
            for (const hit of visualLiteralMatches(source)) {
                failures.push(`${rel}:${hit.line}: component CSS owns raw color ${hit.value}`);
            }
        } else {
            for (const rule of parseCssRules(source)) {
                if (/\.quest-ui-theme-[A-Za-z0-9_-]+/.test(rule.selector)) continue;
                for (const declaration of rule.declarations) {
                    if (visualLiteralMatches(declaration.value).length === 0) continue;
                    failures.push(
                        `${rel}:${rule.line}: raw theme color outside named theme in ${rule.selector} (${declaration.property})`
                    );
                }
            }
        }

        for (const hit of emptyRules(source)) {
            failures.push(`${rel}:${hit.line}: empty CSS rule ${hit.selector} [${hit.context}]`);
        }

        for (const hit of emptyAtRules(source)) {
            failures.push(`${rel}:${hit.line}: empty @${hit.kind} block ${hit.condition}`);
        }

        for (const hit of shadowedDeclarations(source)) {
            failures.push(`${rel}:${hit.line}: shadowed CSS declaration ${hit.property} in ${hit.selector} [${hit.context}]`);
        }

        if (rel.startsWith("src/themes/")) {
            for (const rule of parseCssRules(source)) {
                if (!/\.quest-ui-theme-[A-Za-z0-9_-]+/.test(rule.selector)) continue;
                for (const declaration of rule.declarations) {
                    if (!THEME_STRUCTURAL_PROPERTIES.has(declaration.property)) continue;
                    failures.push(
                        `${rel}:${rule.line}: named theme owns shared geometry ${declaration.property} in ${rule.selector}`
                    );
                }
            }
        }
    }

    const inlineColorPattern = /#[0-9a-fA-F]{3,8}\b|rgba?\s*\(|hsla?\s*\(/g;
    const namedInlineStylePattern = /\b(?:color|background(?:Color)?|border(?:Color)?|fill|stroke)\s*:\s*["'`](?:white|black|red|blue|green|yellow|orange|purple|gray|grey)["'`]/gi;
    for (const file of sourceFiles) {
        const source = stripJsComments(fs.readFileSync(file, "utf8"));
        const rel = relative(file);
        let match;
        while ((match = inlineColorPattern.exec(source))) {
            failures.push(`${rel}:${lineAt(source, match.index)}: inline visual color ${match[0]}`);
        }
        while ((match = namedInlineStylePattern.exec(source))) {
            failures.push(`${rel}:${lineAt(source, match.index)}: inline named visual color`);
        }
    }

    for (const file of sourceFiles) {
        if (relative(file) === "src/themes/runtime.ts") continue;
        const source = stripJsComments(fs.readFileSync(file, "utf8"));
        if (source.includes("quest-ui-theme-default") || source.includes("quest-ui-theme\"")) {
            failures.push(`${relative(file)}: theme root classes must be applied through dashboardThemeClassName()`);
        }
    }

    const { definitions, uses } = collectTokenGraph(cssFiles, sourceFiles);
    for (const [token, locations] of uses) {
        if (definitions.has(token)) continue;
        for (const location of locations) {
            failures.push(`${location.file}:${location.line}: undefined QuestUI token ${token}`);
        }
    }
    for (const [token, locations] of definitions) {
        if (uses.has(token)) continue;
        for (const location of locations) {
            failures.push(`${location.file}:${location.line}: unused QuestUI token ${token}`);
        }
    }

    if (failures.length) {
        console.error("QuestUI theme contract verification failed:");
        for (const failure of failures) console.error(" - " + failure);
        process.exit(1);
    }

    console.log(`QuestUI theme contract OK: ${cssFiles.length} CSS files, ${sourceFiles.length} TS/TSX files, ${definitions.size} QuestUI tokens.`);
}

function selfTest() {
    const fallbackOnly = ".x { color: var(--text-default, #fff); background: var(--surface, rgba(1, 2, 3, .5)); }";
    if (visualLiteralMatches(fallbackOnly).length !== 0) throw new Error("self-test: simple var fallbacks must be allowed");

    const raw = ".x { color: #fff; background: rgba(1, 2, 3, .5); }";
    if (visualLiteralMatches(raw).length !== 2) throw new Error("self-test: raw component colors must be detected");

    const named = ".x { color: white; white-space: nowrap; }";
    if (visualLiteralMatches(named).length !== 1) throw new Error("self-test: named colors must not confuse white-space");

    const themeScoped = ".quest-ui-theme-default .x { color: #fff; }";
    const themeShared = ".quest-ui-theme .x { color: #fff; }";
    if (!/\.quest-ui-theme-[A-Za-z0-9_-]+/.test(parseCssRules(themeScoped)[0]?.selector ?? "")) {
        throw new Error("self-test: named theme selectors must be recognized");
    }
    if (/\.quest-ui-theme-[A-Za-z0-9_-]+/.test(parseCssRules(themeShared)[0]?.selector ?? "")) {
        throw new Error("self-test: shared theme root must not count as a named theme");
    }

    const shadowed = ".x { width: 10px; }\n.x { width: 12px; }";
    if (shadowedDeclarations(shadowed).length !== 1) throw new Error("self-test: later identical selector must shadow earlier declaration");

    const protectedImportant = ".x { width: 10px !important; }\n.x { width: 12px; }";
    if (shadowedDeclarations(protectedImportant).length !== 0) throw new Error("self-test: normal declaration must not shadow earlier !important");

    const differentMedia = "@media (max-width: 500px) { .x { width: 10px; } }\n.x { width: 12px; }";
    if (shadowedDeclarations(differentMedia).length !== 0) throw new Error("self-test: different contexts must stay independent");

    if (emptyAtRules("@media (max-width: 500px) { /* no rules */ }").length !== 1) {
        throw new Error("self-test: empty at-rules must be detected");
    }
    if (emptyAtRules("@media (max-width: 500px) { .x { display: block; } }").length !== 0) {
        throw new Error("self-test: non-empty at-rules must remain allowed");
    }

    if (!THEME_STRUCTURAL_PROPERTIES.has("grid-template-columns") || THEME_STRUCTURAL_PROPERTIES.has("color")) {
        throw new Error("self-test: theme geometry property classification drifted");
    }

    console.log("QuestUI theme contract verifier self-test OK.");
}

if (process.argv.includes("--self-test")) selfTest();
else validateRepository();
