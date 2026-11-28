import ErrorBoundary from "@components/ErrorBoundary";
import { findByCodeLazy } from "@webpack";
import { showToast, UserStore, useEffect, useRef, useStateFromStores } from "@webpack/common";

import { captureAccountSession, isCurrentAccountSession } from "../plugin/accountSession";
import { QuestsStore } from "../plugin/stores";
import { readQuestByIdentity, type NormalizedQuest } from "./data";
import { canLaunchQuestQuickOpen, questQuickOpenTarget, type QuestQuickOpenKind } from "./quickOpen";

// Discord Canary 679932: modules 452411 (native Quest CTA), 321538 (video
// modal opener), 61387 (Quest activity hook) and 787389 (activity launch).
// Module IDs are evidence, not runtime lookup keys.
const QUEST_HOME_DESKTOP_LOCATION = 11;
const openNativeVideoQuest = findByCodeLazy("videoSessionId", "sourceQuestContentCTA", "skipEnrollmentCheck") as (options: {
    quest: NormalizedQuest["rawQuest"];
    questContent: number;
    sourceQuestContent: number;
    sourceQuestContentCTA: "WATCH_VIDEO";
}) => void;

const useNativeQuestActivity = findByCodeLazy("launchInGameActivity:", "applicationId:") as (quest: NormalizedQuest["rawQuest"]) => {
    launchInGameActivity: () => Promise<void>;
};

interface TitleProps {
    quest: NormalizedQuest;
    closePopout?: () => void;
}

function PlainTitle({ quest }: TitleProps) {
    return <strong className="quest-ui-card-title" title={quest.name}>{quest.name}</strong>;
}

function currentAccountId(): string | null {
    try { return UserStore?.getCurrentUser?.()?.id ?? null; }
    catch { return null; }
}

function unavailable(text: string): void {
    showToast({ text, variant: "critical" });
}

function NativeOpenButton({ quest, kind, closePopout, launch }: TitleProps & {
    kind: QuestQuickOpenKind;
    launch: (current: NormalizedQuest) => void | Promise<void>;
}) {
    const accountId = useStateFromStores([UserStore], currentAccountId);
    const pending = useRef(false);
    const mounted = useRef(true);
    const session = captureAccountSession();
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);

    const open = async () => {
        if (pending.current || !mounted.current || !accountId || session?.accountId !== accountId || !isCurrentAccountSession(session)) return;

        pending.current = true;
        try {
            const current = readQuestByIdentity({ id: quest.id, name: null });
            if (!current || current.primaryTask?.key !== quest.primaryTask?.key
                || questQuickOpenTarget(current.id, current.primaryTask?.key) !== kind
                || (kind === "activity" && current.applicationId !== quest.applicationId)) {
                unavailable("Quest changed or is no longer available. Reload Quests and try again.");
                return;
            }
            if (current.status === "available") {
                unavailable("Accept the Quest before opening it.");
                return;
            }
            if (!canLaunchQuestQuickOpen(current.status, current.rawQuest?.userStatus?.enrolledAt, QuestsStore?.isQuestAccessSuspended)) {
                unavailable("This Quest cannot be opened in its current state.");
                return;
            }

            // The native CTA owns playback, launch checks, session and tracking.
            // Do not auto-enroll, fabricate progress or open an external URL.
            if (!mounted.current || !isCurrentAccountSession(session)) return;
            await launch(current);
            if (mounted.current && isCurrentAccountSession(session)) closePopout?.();
        } catch {
            if (mounted.current && isCurrentAccountSession(session)) unavailable("Discord could not open this Quest. Try opening it from Quest Home.");
        } finally {
            pending.current = false;
        }
    };

    return (
        <button
            type="button"
            className="quest-ui-card-open-quest"
            title={kind === "video" ? `Watch ${quest.name}` : `Launch ${quest.name}`}
            onClick={() => { void open(); }}
        >
            <strong className="quest-ui-card-title">{quest.name}</strong>
            <svg className="quest-ui-card-open-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M14 3h7v7M21 3 10 14" />
                <path d="M11 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-6" />
            </svg>
        </button>
    );
}

function VideoTitle(props: TitleProps) {
    return <NativeOpenButton {...props} kind="video" launch={current => {
        openNativeVideoQuest({
            quest: current.rawQuest,
            questContent: QUEST_HOME_DESKTOP_LOCATION,
            sourceQuestContent: QUEST_HOME_DESKTOP_LOCATION,
            sourceQuestContentCTA: "WATCH_VIDEO"
        });
    }} />;
}

function ActivityTitle(props: TitleProps) {
    const { launchInGameActivity } = useNativeQuestActivity(props.quest.rawQuest);
    return <NativeOpenButton {...props} kind="activity" launch={() => launchInGameActivity()} />;
}

// Separate component keeps native React hook ordering stable and isolates
// a missing/changed Discord export from the rest of the Dashboard.
const SafeActivityTitle = ErrorBoundary.wrap(ActivityTitle, {
    fallback: ({ wrappedProps }) => <PlainTitle quest={wrappedProps.quest} />
});

export function QuestQuickOpenTitle(props: TitleProps) {
    const kind = questQuickOpenTarget(props.quest.id, props.quest.primaryTask?.key);
    if (kind === "video") return <VideoTitle {...props} />;
    if (kind === "activity") return <SafeActivityTitle {...props} />;
    return <PlainTitle {...props} />;
}
