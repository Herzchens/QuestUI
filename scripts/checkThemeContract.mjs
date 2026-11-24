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

function splitSelectorList(selector) {
    const parts = [];
    let start = 0;
    let quote = null;
    let parenDepth = 0;
    let bracketDepth = 0;

    for (let i = 0; i < selector.length; i++) {
        const ch = selector[i];
        if (quote) {
            if (ch === "\\") {
                i++;
                continue;
            }
            if (ch === quote) quote = null;
            continue;
        }
        if (ch === "'" || ch === "\"") {
            quote = ch;
            continue;
        }
        if (ch === "(") parenDepth++;
        else if (ch === ")") parenDepth = Math.max(0, parenDepth - 1);
        else if (ch === "[") bracketDepth++;
        else if (ch === "]") bracketDepth = Math.max(0, bracketDepth - 1);
        else if (ch === "," && parenDepth === 0 && bracketDepth === 0) {
            parts.push(selector.slice(start, i).trim());
            start = i + 1;
        }
    }
    parts.push(selector.slice(start).trim());
    return parts.filter(Boolean);
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
    const later = new Map();
    const shadowed = [];
    const key = (rule, selector, property) => JSON.stringify([rule.context, selector, property]);

    // A grouped declaration is redundant only when every selector arm has
    // a later winner in the same conditional context.
    for (let i = rules.length - 1; i >= 0; i--) {
        const rule = rules[i];
        const selectors = splitSelectorList(rule.selector);
        const exactDeclarations = new Set();

        for (const declaration of rule.declarations) {
            const signature = JSON.stringify([declaration.property, declaration.value]);
            const duplicate = exactDeclarations.has(signature);
            exactDeclarations.add(signature);
            const fullyShadowed = selectors.length > 0 && selectors.every(selector => {
                const winner = later.get(key(rule, selector, declaration.property));
                return winner && (!declaration.important || winner.important);
            });
            if (duplicate || fullyShadowed) {
                shadowed.push({
                    line: rule.line,
                    selector: rule.selector,
                    property: declaration.property,
                    context: rule.context || "top-level"
                });
            }
        }

        // Preserve intentional syntax fallbacks within one rule.
        for (const declaration of rule.declarations) {
            for (const selector of selectors) {
                const id = key(rule, selector, declaration.property);
                const winner = later.get(id);
                if (!winner || (declaration.important && !winner.important)) {
                    later.set(id, declaration);
                }
            }
        }
    }
    return shadowed.reverse();
}

// Ownership is checked independently of import order, within one theme.
// Keep same-context overrides and syntax fallbacks in the same owner stylesheet.
// Distinct selectors and conditional contexts remain independent.
function crossFileDeclarationOwners(stylesheets) {
    const owners = new Map();
    for (const { file, source } of stylesheets) {
        for (const rule of parseCssRules(source)) {
            for (const selector of splitSelectorList(rule.selector)) {
                for (const declaration of rule.declarations) {
                    const property = declaration.property.startsWith("--")
                        ? declaration.property
                        : declaration.property.toLowerCase();
                    const key = JSON.stringify([rule.context, selector, property]);
                    let entry = owners.get(key);
                    if (!entry) {
                        entry = { context: rule.context, selector, property, locations: new Map() };
                        owners.set(key, entry);
                    }
                    if (!entry.locations.has(file)) entry.locations.set(file, rule.line);
                }
            }
        }
    }
    return [...owners.values()].filter(entry => entry.locations.size > 1);
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

function hasCustomPropertySelfReference(declaration) {
    if (!/^--[A-Za-z0-9_-]+$/.test(declaration.property)) return false;
    return new RegExp(
        `var\\(\\s*${declaration.property}\\s*(?:,|\\))`
    ).test(declaration.value);
}

function collectTokenGraph(cssFiles, sourceFiles) {
    const definitions = new Map();
    const uses = new Map();
    const edges = new Map();

    const push = (map, token, location) => {
        const values = map.get(token) ?? [];
        values.push(location);
        map.set(token, values);
    };
    const addEdge = (from, to) => {
        const targets = edges.get(from) ?? new Set();
        targets.add(to);
        edges.set(from, targets);
    };

    for (const file of cssFiles) {
        const rawSource = fs.readFileSync(file, "utf8");
        const source = maskCssComments(rawSource);
        let match;
        const definitionPattern = /(--quest-ui-[A-Za-z0-9_-]+)\s*:/g;
        while ((match = definitionPattern.exec(source))) {
            push(definitions, match[1], { file: relative(file), line: lineAt(source, match.index) });
        }
        const usePattern = /var\(\s*(--quest-ui-[A-Za-z0-9_-]+)/g;
        while ((match = usePattern.exec(source))) {
            push(uses, match[1], { file: relative(file), line: lineAt(source, match.index) });
        }
        for (const rule of parseCssRules(rawSource)) {
            for (const declaration of rule.declarations) {
                if (!/^--quest-ui-[A-Za-z0-9_-]+$/.test(declaration.property)) continue;
                for (const ref of declaration.value.matchAll(/var\(\s*(--quest-ui-[A-Za-z0-9_-]+)/g)) {
                    addEdge(declaration.property, ref[1]);
                }
            }
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

    return { definitions, uses, edges };
}

function customPropertyCycles(edges) {
    const cycles = [];
    const seen = new Set();
    const visiting = new Set();
    const stack = [];

    const canonical = nodes => {
        const ring = nodes.slice(0, -1);
        const rotations = ring.map((_, index) => [...ring.slice(index), ...ring.slice(0, index)].join(" -> "));
        return rotations.sort()[0];
    };

    const visit = node => {
        visiting.add(node);
        stack.push(node);
        for (const next of edges.get(node) ?? []) {
            const existing = stack.indexOf(next);
            if (existing >= 0) {
                const cycle = [...stack.slice(existing), next];
                const key = canonical(cycle);
                if (!seen.has(key)) {
                    seen.add(key);
                    cycles.push(cycle);
                }
                continue;
            }
            if (!visiting.has(next)) visit(next);
        }
        stack.pop();
        visiting.delete(node);
    };

    for (const node of edges.keys()) visit(node);
    return cycles;
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

        if (!/^src\/themes\/[^/]+\/.+\.css$/.test(rel)) {
            failures.push(`${rel}: stylesheet must belong to a self-contained theme folder`);
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

        for (const rule of parseCssRules(source)) {
            for (const declaration of rule.declarations) {
                if (!hasCustomPropertySelfReference(declaration)) continue;
                failures.push(
                    `${rel}:${rule.line}: custom property self-reference ${declaration.property} in ${rule.selector}`
                );
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
        if (/\bquest-ui-theme(?:-[A-Za-z0-9_-]+)?\b/.test(source)) {
            failures.push(`${relative(file)}: theme root classes must be applied through dashboardThemeClassName()`);
        }
    }

    // Validate each theme independently: a token from another theme cannot hide a missing definition.
    const themeGroups = new Map();
    for (const file of cssFiles) {
        const match = /^src\/themes\/([^/]+)\//.exec(relative(file));
        if (!match) continue;
        const files = themeGroups.get(match[1]) ?? [];
        files.push(file);
        themeGroups.set(match[1], files);
    }
    let tokenCount = 0;
    for (const [theme, files] of themeGroups) {
        const stylesheets = files.map(file => ({ file: relative(file), source: fs.readFileSync(file, "utf8") }));
        for (const hit of crossFileDeclarationOwners(stylesheets)) {
            const locations = [...hit.locations].map(([file, line]) => `${file}:${line}`).join(", ");
            failures.push(`${theme}: cross-file declaration ownership for ${hit.property} in ${hit.selector} [${hit.context || "top-level"}]: ${locations}`);
        }
        const { definitions, uses, edges } = collectTokenGraph(files, sourceFiles);
        tokenCount += definitions.size;
        for (const cycle of customPropertyCycles(edges)) {
            if (cycle.length <= 2) continue;
            failures.push(`${theme}: indirect custom-property cycle ${cycle.join(" -> ")}`);
        }
        for (const [token, locations] of uses) {
            if (definitions.has(token)) continue;
            for (const location of locations) {
                failures.push(`${location.file}:${location.line}: undefined QuestUI token ${token} in theme ${theme}`);
            }
        }
        for (const [token, locations] of definitions) {
            if (uses.has(token)) continue;
            for (const location of locations) {
                failures.push(`${location.file}:${location.line}: unused QuestUI token ${token} in theme ${theme}`);
            }
        }
    }

    if (failures.length) {
        console.error("QuestUI theme contract verification failed:");
        for (const failure of failures) console.error(" - " + failure);
        process.exit(1);
    }

    console.log(`QuestUI theme contract OK: ${cssFiles.length} CSS files, ${sourceFiles.length} TS/TSX files, ${tokenCount} QuestUI tokens across ${themeGroups.size} theme(s).`);
}

function selfTest() {
    const shadowed = ".x { width: 10px; }\n.x { width: 12px; }";
    if (shadowedDeclarations(shadowed).length !== 1) throw new Error("self-test: later identical selector must shadow earlier declaration");

    const grouped = ".x, .y { width: 10px; }\n.x { width: 12px; }\n.y { width: 14px; }";
    if (shadowedDeclarations(grouped).length !== 1) throw new Error("self-test: every selector-list arm can be shadowed independently");
    const partial = ".x, .y { width: 10px; }\n.x { width: 12px; }";
    if (shadowedDeclarations(partial).length !== 0) throw new Error("self-test: live selector-list arms must remain allowed");
    const custom = ".x { --quest-ui-example: 1; }\n.x { --quest-ui-example: 2; }";
    if (shadowedDeclarations(custom).length !== 1) throw new Error("self-test: duplicate custom properties must be detected");
    const duplicate = ".x { width: 10px; width: 10px; }";
    if (shadowedDeclarations(duplicate).length !== 1) throw new Error("self-test: identical declarations inside one rule must be detected");
    const fallback = ".x { display: block; display: grid; }";
    if (shadowedDeclarations(fallback).length !== 0) throw new Error("self-test: distinct within-rule fallbacks must stay allowed");

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

    const selfCycleRule = parseCssRules(".x { --quest-ui-test: var(--quest-ui-test); }")[0];
    if (!selfCycleRule || !selfCycleRule.declarations.some(hasCustomPropertySelfReference)) {
        throw new Error("self-test: custom-property self-cycles must remain detectable");
    }
    const nonCycleRule = parseCssRules(".x { --quest-ui-test: var(--quest-ui-other); }")[0];
    if (!nonCycleRule || nonCycleRule.declarations.some(hasCustomPropertySelfReference)) {
        throw new Error("self-test: unrelated custom-property references must remain allowed");
    }

    const indirectRules = parseCssRules(".x { --quest-ui-a: var(--quest-ui-b); --quest-ui-b: var(--quest-ui-c); --quest-ui-c: var(--quest-ui-a); }");
    const indirectEdges = new Map();
    for (const declaration of indirectRules[0].declarations) {
        if (!declaration.property.startsWith("--quest-ui-")) continue;
        indirectEdges.set(
            declaration.property,
            new Set([...declaration.value.matchAll(/var\(\s*(--quest-ui-[A-Za-z0-9_-]+)/g)].map(match => match[1]))
        );
    }
    if (customPropertyCycles(indirectEdges).length !== 1) {
        throw new Error("self-test: indirect custom-property cycles must be detected");
    }

    const selectorList = splitSelectorList(".quest-ui-theme-default .a, .unscoped:is(.b, .c)");
    if (selectorList.length !== 2 || selectorList[1] !== ".unscoped:is(.b, .c)") {
        throw new Error("self-test: mixed selector lists must preserve unscoped selectors");
    }


    const acrossFiles = (...sources) => crossFileDeclarationOwners(sources.map((source, index) => ({ file: `theme/${index}.css`, source })));
    const crossFileHits = acrossFiles(".x, .y { color: red; }", ".y { color: blue; }");
    if (crossFileHits.length !== 1 || crossFileHits[0].selector !== ".y" || crossFileHits[0].locations.size !== 2) {
        throw new Error("self-test: selector-list cross-file ownership must be detected");
    }
    if (acrossFiles(".x { width: 10px; }", ".x { width: 10px; }").length !== 1) {
        throw new Error("self-test: identical cross-file declarations must be detected");
    }
    if (acrossFiles(".x { WIDTH: 10px !important; }", ".x { width: 20px; }").length !== 1) {
        throw new Error("self-test: cross-file ownership must not depend on importance or property case");
    }
    if (acrossFiles(".x { display: block; display: grid; }", ".x:hover { display: flex; }", "@media (max-width: 500px) { .x { display: block; } }").length !== 0) {
        throw new Error("self-test: in-file fallbacks, distinct selectors and conditional contexts must remain allowed");
    }
    if (acrossFiles(".x:is(.a, .b) { color: red; }", ".x:is(.a, .b), .z { color: blue; }").length !== 1) {
        throw new Error("self-test: commas inside selector functions must not split ownership keys");
    }
    if (acrossFiles(".x { --quest-ui-A: 1; }", ".x { --quest-ui-a: 2; }").length !== 0) {
        throw new Error("self-test: custom-property names must remain case-sensitive");
    }

    console.log("QuestUI theme contract verifier self-test OK.");
}

if (process.argv.includes("--self-test")) selfTest();
else validateRepository();
