import { findByCodeLazy } from "@webpack";
import { createLatestNativeRequest } from "../plugin/latestNativeRequest";
import { captureAccountSession, isCurrentAccountSession, type AccountSession } from "../plugin/accountSession";

// Discord's native Virtual Currency balance action. It owns the request, Flux dispatches,
// server error handling, and VirtualCurrencyStore hydration; QuestUI only invokes it.
const fetchDiscordVirtualCurrencyBalance = findByCodeLazy(
    "VIRTUAL_CURRENCY_BALANCE_FETCH",
    "VIRTUAL_CURRENCY_BALANCE_FETCH_SUCCESS",
    "VIRTUAL_CURRENCY_USER_BALANCE"
) as () => Promise<unknown> | unknown;

function runNativeBalanceFetch(): Promise<void> {
    try {
        return Promise.resolve(fetchDiscordVirtualCurrencyBalance()).then(() => undefined);
    } catch (error) {
        return Promise.reject(error);
    }
}

const requestBalance = createLatestNativeRequest<AccountSession>(runNativeBalanceFetch,
    isCurrentAccountSession, () => new Error("Discord account changed before Orb balance refresh."));

export function fetchOrbBalance(accountId: string): Promise<void> {
    const session = captureAccountSession();
    if (!session || session.accountId !== accountId) return Promise.reject(new Error("Discord account changed before Orb balance refresh."));
    return requestBalance(session);
}
