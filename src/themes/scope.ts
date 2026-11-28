/** Browser-parsed scope is a guard against accidental global styling, not
 * a sandbox for untrusted CSS or network side channels. */
export function prepareScopedThemeCSS(selector: string, css: string): string {
    if (!/^\.[a-z][a-z0-9-]*$/.test(selector)) throw new TypeError("Invalid theme scope.");
    const sheet = new CSSStyleSheet();
    sheet.replaceSync("@scope (" + selector + ") {\n" + css + "\n}");
    const rule = sheet.cssRules[0];
    if (sheet.cssRules.length !== 1 || !rule || !rule.cssText.startsWith("@scope (" + selector + ")")
        || !("cssRules" in rule) || !(rule as CSSGroupingRule).cssRules.length) {
        throw new Error("Invalid custom theme CSS or unsupported CSS scope.");
    }
    return rule.cssText;
}
