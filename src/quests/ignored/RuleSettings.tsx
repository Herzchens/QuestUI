import { useState, showToast } from "@webpack/common";
import { MAX_IGNORE_RULES, type IgnoreRule } from "./logic";
import { setIgnoreRules, useIgnoredQuests } from "./runtime";

export function IgnoreRuleSettingsControl() {
    const snapshot = useIgnoredQuests();
    return <RuleEditor key={snapshot.accountId ?? "signed-out"} snapshot={snapshot} />;
}

function RuleEditor({ snapshot }: { snapshot: ReturnType<typeof useIgnoredQuests>; }) {
    const [kind, setKind] = useState<IgnoreRule["kind"]>("name-contains");
    const [value, setValue] = useState("");
    const [editing, setEditing] = useState<number | null>(null);
    const [pending, setPending] = useState(false);
    const [expected, setExpected] = useState<readonly IgnoreRule[] | null>(null);
    const disabled = !snapshot.accountId || !snapshot.storageReady || pending;

    function reset() { setValue(""); setEditing(null); setExpected(null); }
    async function save(next: readonly IgnoreRule[], baseline = snapshot.rules) {
        if (disabled || !snapshot.accountId) return;
        setPending(true);
        try {
            await setIgnoreRules(snapshot.accountId, baseline, next);
            reset();
        } catch (error) {
            showToast({ text: error instanceof Error ? error.message : "Could not save Ignore rules.", variant: "critical" });
        } finally { setPending(false); }
    }
    return <section aria-label="Ignore rules" style={{ color: "var(--text-normal)", display: "grid", gap: 8 }}>
        <strong>Ignore rules</strong>
        <span>Rules apply only to the current Discord account. Any matching Quest is ignored. Unignore on a Quest creates an exception until it is claimed or expires.</span>
        {!snapshot.storageReady ? <span>Loading Ignore preferences…</span>
            : !snapshot.ready ? <span>Quest catalogue unavailable. QuestUI cannot safely evaluate rules.</span> : null}
        {snapshot.rules.map((rule, index) => <div key={rule.kind + ":" + rule.value} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ flex: 1, overflowWrap: "anywhere" }}>{rule.kind === "name-contains" ? "Name contains" : "Application ID"}: {rule.value}</span>
            <button type="button" disabled={disabled} onClick={() => { setKind(rule.kind); setValue(rule.value); setEditing(index); setExpected(snapshot.rules); }}>Edit</button>
            <button type="button" disabled={disabled} aria-label={"Delete rule " + rule.value} onClick={() => void save(snapshot.rules.filter((_, i) => i !== index))}>Delete</button>
        </div>)}
        <form onSubmit={event => {
            event.preventDefault();
            const rule = { kind, value };
            const baseline = expected ?? snapshot.rules;
            const next = [...baseline];
            if (editing === null) next.push(rule); else next[editing] = rule;
            void save(next, baseline);
        }} style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <select aria-label="Ignore rule type" value={kind} disabled={disabled} onChange={event => setKind(event.currentTarget.value as IgnoreRule["kind"])}>
                <option value="name-contains">Name contains</option>
                <option value="application-id">Application ID</option>
            </select>
            <input aria-label="Ignore rule value" value={value} disabled={disabled} maxLength={100} onChange={event => setValue(event.currentTarget.value)} />
            <button type="submit" disabled={disabled || !value.trim() || (editing === null && snapshot.rules.length >= MAX_IGNORE_RULES)}>{editing === null ? "Add rule" : "Save rule"}</button>
            {editing !== null && <button type="button" disabled={pending} onClick={reset}>Cancel</button>}
        </form>
    </section>;
}
