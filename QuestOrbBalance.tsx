import { UserStore, useEffect, useRef, useState, useStateFromStores } from "@webpack/common";

import { fetchOrbBalance } from "./orbBalance";
import {
    deriveOrbBalanceDisplayState,
    normalizeOrbBalance,
    shouldFetchOrbBalance
} from "./orbBalanceLogic";
import { QuestOrbIcon } from "./QuestOrbIcon";
import { VirtualCurrencyStore } from "./stores";

export function QuestOrbBalance() {
    const currentUserId = useStateFromStores([UserStore], () => UserStore?.getCurrentUser?.()?.id ?? null);
    const rawBalance = useStateFromStores([VirtualCurrencyStore], () =>
        VirtualCurrencyStore?.getCurrentBalance?.() ?? VirtualCurrencyStore?.balance ?? null
    );
    const isFetching = useStateFromStores([VirtualCurrencyStore], () =>
        VirtualCurrencyStore?.isFetchingBalance === true
    );
    const hasFetchError = useStateFromStores([VirtualCurrencyStore], () =>
        VirtualCurrencyStore?.fetchBalanceError != null
    );
    const [invocationFailed, setInvocationFailed] = useState(false);
    const [trustedUserId, setTrustedUserId] = useState<string | null>(currentUserId);
    const attempted = useRef(false);
    const mounted = useRef(true);
    const storeBalance = normalizeOrbBalance(rawBalance);
    const accountTrusted = trustedUserId === currentUserId;
    const balance = accountTrusted ? storeBalance : null;
    const relevantFetchError = accountTrusted ? hasFetchError : false;

    useEffect(() => () => {
        mounted.current = false;
    }, []);

    useEffect(() => {
        attempted.current = false;
        setInvocationFailed(false);
        setTrustedUserId(current => current === currentUserId ? current : null);
    }, [currentUserId]);

    useEffect(() => {
        if (!currentUserId) return;

        // Once Discord has published a terminal result, allow a later LOGIN_SUCCESS/store reset
        // for the same account to initiate a fresh native fetch instead of retaining a local latch.
        if (balance != null || relevantFetchError) attempted.current = false;

        const needsAccountVerification = !accountTrusted;
        if (!needsAccountVerification
            && !shouldFetchOrbBalance(balance, isFetching, relevantFetchError, invocationFailed)) {
            return;
        }
        if (relevantFetchError || invocationFailed || isFetching || attempted.current) return;

        attempted.current = true;
        try {
            void fetchOrbBalance(currentUserId)
                .then(() => {
                    if (!mounted.current) return;
                    const userStillCurrent = UserStore?.getCurrentUser?.()?.id === currentUserId;
                    const currentBalance = normalizeOrbBalance(
                        VirtualCurrencyStore?.getCurrentBalance?.() ?? VirtualCurrencyStore?.balance ?? null
                    );
                    const currentFetching = VirtualCurrencyStore?.isFetchingBalance === true;
                    const currentError = VirtualCurrencyStore?.fetchBalanceError != null;

                    if (!userStillCurrent) return;
                    if (currentBalance != null) {
                        setTrustedUserId(currentUserId);
                        return;
                    }
                    if (!currentFetching && !currentError) setInvocationFailed(true);
                })
                .catch(() => {
                    if (mounted.current && UserStore?.getCurrentUser?.()?.id === currentUserId) {
                        setInvocationFailed(true);
                    }
                });
        } catch {
            if (mounted.current) setInvocationFailed(true);
        }
    }, [accountTrusted, balance, currentUserId, invocationFailed, isFetching, relevantFetchError]);

    const state = currentUserId == null
        ? { kind: "unavailable" as const }
        : deriveOrbBalanceDisplayState(balance, isFetching, relevantFetchError, invocationFailed);

    const copy = state.kind === "ready"
        ? String(state.balance)
        : state.kind === "loading"
            ? "•••"
            : "—";

    return (
        <span
            className={`quest-ui-dashboard-orb-balance is-${state.kind}`}
            aria-busy={state.kind === "loading"}
            title={state.kind === "ready" ? `${state.balance} Orbs` : state.kind === "loading" ? "Loading Orb balance" : "Discord Orb balance is currently unavailable."}
            aria-label={state.kind === "ready" ? `${state.balance} Orbs` : state.kind === "loading" ? "Loading Orb balance" : "Orb balance unavailable"}
        >
            <QuestOrbIcon size={22} className="quest-ui-dashboard-orb-icon" />
            <strong>{copy}</strong>
        </span>
    );
}
