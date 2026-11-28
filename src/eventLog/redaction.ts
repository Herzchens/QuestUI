/** Shared diagnostic boundary: never stringify an untrusted object or invoke
 * its accessors, toJSON or toString. Unknown/oversized values fail closed.
 * This detects known credential formats; it cannot recognize arbitrary secrets. */
const REDACTED = "[REDACTED]";
const OMITTED = "[OMITTED diagnostic]";
const MAX_INPUT = 128 * 1024;
const MAX_OUTPUT = 32 * 1024;
const MAX_NODES = 256;
const MAX_DEPTH = 6;
const KEY = String.raw`(?:x[-_ ]?)?(?:proxy[-_ ]?authorization|authorization(?:[-_ ]?header)?|set[-_ ]?cookie|cookies?|(?:access|auth|refresh|session|discord|bot|bearer|oauth|id)[-_ ]?token|token|proxy[-_ ]?ticket|api[-_ ]?key|client[-_ ]?secret|secret[-_ ]?key|personal[-_ ]?access[-_ ]?token|password|passwd|passphrase|credentials?|secret|private[-_ ]?key|(?:oauth|auth|gift|reward)[-_ ]?code)`;
const jsonValue = new RegExp(String.raw`(["']${KEY}["']\s*:\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,}\]]+)`, "gi");
const header = /(^|[\s,;])((?:proxy[-_ ]?authorization|authorization|set[-_ ]?cookie|cookie)\s*[:=]\s*)[^\r\n]*(?:\r?\n[\t ]+[^\r\n]*)*/gi;
const assignment = new RegExp(String.raw`(^|[\s,;?&])(${KEY}\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;&]+)`, "gi");
const query = /([?&](?:code|token|access_token|refresh_token|ticket|api_key|client_secret|password)=)[^&#\s"']+/gi;

const ambiguousContainer = new RegExp(String.raw`(?:["\']${KEY}["\']|\b${KEY})\s*[:=]\s*[\[{]`, "i");
const escapedKey = new RegExp(String.raw`\\["\']${KEY}\\["\']`, "i");
// Every recognized free-text credential format needs at least one of these
// markers. Plain IDs, summaries and diagnostic messages need no regex chain.
function mayContainCredential(text: string): boolean {
    return /[:=.%\\]|-----BEGIN |\b(?:Bearer|Basic)\s/i.test(text);
}

const PERCENT_ESCAPE = /%[0-9a-f]{2}/i;
const MAX_DECODE_PASSES = 4;

// Decode for detection only. All callers retain the original representation.
function containsEncodedCredential(text: string, sensitive: (candidate: string) => boolean): boolean {
    let candidate = text;
    for (let pass = 0; pass < MAX_DECODE_PASSES && PERCENT_ESCAPE.test(candidate); pass++) {
        let next: string;
        try { next = decodeURIComponent(candidate); }
        catch {
            next = candidate.replace(/%([0-7][0-9a-f])/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
        }
        if (next === candidate) return false;
        candidate = next;
        if (candidate.length > MAX_INPUT || sensitive(candidate)) return true;
    }
    // Nested escapes beyond the work budget are ambiguous. Unchanged malformed
    // non-ASCII escapes are handled by the early equality check above.
    return PERCENT_ESCAPE.test(candidate);
}

function redactKnownText(text: string): string {
    return text
        .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, REDACTED)
        .replace(jsonValue, '$1"[REDACTED]"')
        .replace(header, "$1$2" + REDACTED)
        .replace(assignment, "$1$2" + REDACTED)
        .replace(query, "$1" + REDACTED)
        .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9+/_=.-]{12,}/gi, REDACTED)
        .replace(/\b(?:mfa\.[A-Za-z0-9_-]{40,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|[A-Za-z0-9_-]{23,28}\.[A-Za-z0-9_-]{6,7}\.[A-Za-z0-9_-]{25,})\b/g, REDACTED)
        .replace(/(https?:\/\/)[^/\s@]+:[^/\s@]+@/gi, "$1" + REDACTED + "@");
}

function containsKnownCredential(text: string): boolean {
    return ambiguousContainer.test(text) || escapedKey.test(text) || redactKnownText(text) !== text;
}

function textOnly(text: string): string {
    if (text.length > MAX_INPUT) return OMITTED;
    if (!mayContainCredential(text)) return text;
    if (ambiguousContainer.test(text) || escapedKey.test(text)) return OMITTED;
    if (PERCENT_ESCAPE.test(text) && containsEncodedCredential(text, containsKnownCredential)) return OMITTED;
    return redactKnownText(text);
}

function sensitiveCanonicalKey(decoded: string): boolean {
    const canonical = decoded.toLowerCase().replace(/[^a-z0-9]/g, "");
    const sensitive = /^(?:proxyauthorization|authorization(?:header)?|setcookie|cookies?|(?:access|auth|refresh|session|discord|bot|bearer|oauth|id)?token|proxyticket|apikey|clientsecret|secretkey|personalaccesstoken|password|passwd|passphrase|credentials?|secret|privatekey|(?:oauth|auth|gift|reward)code)$/;
    return sensitive.test(canonical) || (canonical.startsWith("x") && sensitive.test(canonical.slice(1)));
}

export function isSensitiveDiagnosticKey(key: string): boolean {
    if (key.length > MAX_INPUT) return true;
    return sensitiveCanonicalKey(key) || (PERCENT_ESCAPE.test(key) && containsEncodedCredential(key, sensitiveCanonicalKey));
}

function forbiddenKey(key: string): boolean {
    return key === "__proto__" || key === "constructor" || key === "prototype" || key === "toJSON" || key === "toString" || key === "valueOf";
}

type SafeValue = null | boolean | number | string | SafeValue[] | { [key: string]: SafeValue; };
type Budget = { nodes: number; chars: number; seen: WeakSet<object>; };

function boundedString(text: string, budget: Budget, depth: number): string {
    if (text.length > MAX_INPUT || text.length > budget.chars) return OMITTED;
    budget.chars -= text.length;
    const trimmed = text.trim();
    // JSON strings can themselves carry structured diagnostic fields.
    if (depth < MAX_DEPTH && (trimmed.startsWith("{") || trimmed.startsWith("["))) {
        try {
            const parsed: unknown = JSON.parse(trimmed);
            if (parsed && typeof parsed === "object") return JSON.stringify(walk(parsed, budget, depth + 1));
        } catch { /* fall through to text redaction */ }
    }
    return textOnly(text);
}

function walk(value: unknown, budget: Budget, depth: number): SafeValue {
    if (--budget.nodes < 0 || depth > MAX_DEPTH) return OMITTED;
    if (value == null) return null;
    if (typeof value === "string") return boundedString(value, budget, depth);
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "boolean") return value;
    if (typeof value === "bigint") return textOnly(String(value));
    if (typeof value !== "object") return OMITTED;
    if (budget.seen.has(value)) return OMITTED;
    budget.seen.add(value);
    try {
        if (Array.isArray(value)) {
            // Headers may arrive as [name, value] tuples rather than objects.
            if (value.length === 2) {
                const first = Object.getOwnPropertyDescriptor(value, "0");
                if (first && "value" in first && typeof first.value === "string" && isSensitiveDiagnosticKey(first.value)) {
                    return [boundedString(first.value, budget, depth + 1), REDACTED];
                }
            }
            const result: SafeValue[] = [];
            for (let i = 0; i < Math.min(value.length, 64) && budget.nodes > 0; i++) {
                const prop = Object.getOwnPropertyDescriptor(value, String(i));
                result.push(prop && "value" in prop ? walk(prop.value, budget, depth + 1) : OMITTED);
            }
            if (value.length > result.length) result.push(OMITTED);
            return result;
        }
        const result: Record<string, SafeValue> = Object.create(null);
        let count = 0;
        const keys = value instanceof Error ? ["name", "message", "stack"] : Object.keys(value);
        for (const key of keys) {
            if (++count > 128 || budget.nodes <= 0 || budget.chars <= 0) break;
            if (forbiddenKey(key) || key.length > 256) continue;
            budget.chars -= key.length;
            const safeKey = textOnly(key);
            if (isSensitiveDiagnosticKey(key)) { result[safeKey] = REDACTED; continue; }
            const prop = Object.getOwnPropertyDescriptor(value, key);
            result[safeKey] = prop && "value" in prop ? walk(prop.value, budget, depth + 1) : OMITTED;
        }
        return result;
    } catch { return OMITTED; }
    finally { budget.seen.delete(value); }
}

function newBudget(): Budget {
    return { nodes: MAX_NODES, chars: MAX_INPUT, seen: new WeakSet() };
}

function truncate(text: string, maxLength: number): string {
    const limit = Math.min(MAX_INPUT, Math.max(0, maxLength));
    if (text.length <= limit) return text;
    return text.slice(0, limit) + "… [truncated]";
}

export function sanitizeEventText(value: unknown, maxLength = MAX_OUTPUT): string {
    if (value == null) return "";
    if (typeof value === "string") {
        if (value.length > MAX_INPUT) return truncate(OMITTED, maxLength);
        const first = value.trimStart()[0];
        if (first !== "{" && first !== "[") return truncate(textOnly(value), maxLength);
    }
    const safe = walk(value, newBudget(), 0);
    return truncate(typeof safe === "string" ? safe : JSON.stringify(safe), maxLength);
}

/** Known UI fields stay scalar. Nested diagnostic payloads are safely rendered
 * as JSON text, so malicious toString/valueOf cannot break search or JSX. */
export function sanitizeDiagnosticDetail(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const safe = walk(value, newBudget(), 0);
    if (!safe || typeof safe !== "object" || Array.isArray(safe)) return null;
    const result: Record<string, unknown> = Object.create(null);
    let remaining = MAX_OUTPUT * 2;
    for (const [key, entry] of Object.entries(safe)) {
        if (remaining <= 0) break;
        const scalar = entry != null && typeof entry === "object" ? JSON.stringify(entry) : entry;
        const text = typeof scalar === "string" ? truncate(scalar, Math.min(MAX_OUTPUT, remaining)) : scalar;
        result[key] = text;
        remaining -= key.length + (typeof text === "string" ? text.length : 16);
    }
    return result;
}

export function validDiagnosticTimestamp(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 8.64e15;
}
