import { findByCodeLazy } from "@webpack";

// Discord's native Virtual Currency balance action. It owns the request, Flux dispatches,
// server error handling, and VirtualCurrencyStore hydration; QuestUI only invokes it.
const fetchDiscordVirtualCurrencyBalance = findByCodeLazy(
    "VIRTUAL_CURRENCY_BALANCE_FETCH",
    "VIRTUAL_CURRENCY_BALANCE_FETCH_SUCCESS",
    "VIRTUAL_CURRENCY_USER_BALANCE"
) as () => Promise<unknown> | unknown;

type BalanceFetch = { accountId: string; promise: Promise<void>; };
let balanceFetchInFlight: BalanceFetch | null = null;

function runNativeBalanceFetch(): Promise<void> {
    try {
        return Promise.resolve(fetchDiscordVirtualCurrencyBalance()).then(() => undefined);
    } catch (error) {
        return Promise.reject(error);
    }
}

/**
 * Coalesce duplicate Dashboard requests for one account. If Discord switches accounts while a
 * request is in flight, serialize the new account's fetch after the old one so an older response
 * cannot be the final balance write after the newer request completes.
 */
export function fetchOrbBalance(accountId: string): Promise<void> {
    if (balanceFetchInFlight?.accountId === accountId) return balanceFetchInFlight.promise;

    const previous = balanceFetchInFlight?.promise;
    const work = (previous ? previous.catch(() => undefined) : Promise.resolve())
        .then(runNativeBalanceFetch);

    const record: BalanceFetch = {
        accountId,
        promise: work.finally(() => {
            if (balanceFetchInFlight === record) balanceFetchInFlight = null;
        })
    };
    balanceFetchInFlight = record;
    return record.promise;
}
