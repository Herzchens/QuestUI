import { QuestsStore } from "./stores";
import { useOrionSchedulerView } from "./orionScheduler";
import { schedulerLaneCopy, schedulerQuestEntries, type OrionSchedulerLane } from "./orionSchedulerLogic";

import "./orionScheduler.css";

const LANES: readonly OrionSchedulerLane[] = ["game", "video"];

function laneLabel(lane: OrionSchedulerLane): string {
    return lane === "game" ? "Game lane" : "Video lane";
}

function currentQuestName(questId: string): string {
    try {
        const name = QuestsStore?.getQuest?.(questId)?.config?.messages?.questName;
        return typeof name === "string" && name.trim() ? name.trim() : questId;
    } catch {
        return questId;
    }
}

export function OrionSchedulerPanel() {
    const scheduler = useOrionSchedulerView();

    if (scheduler.state === "unsupported") return null;

    if (scheduler.state === "invalid" || !scheduler.snapshot) {
        return (
            <section className="quest-ui-orion-scheduler is-invalid" aria-label="Orion scheduler metadata unavailable">
                <div className="quest-ui-orion-scheduler-heading">
                    <strong>Orion Scheduler</strong>
                    <span>Metadata unavailable</span>
                </div>
            </section>
        );
    }

    const snapshot = scheduler.snapshot;
    const entries = schedulerQuestEntries(snapshot);
    const hasLiveBatch = LANES.some(lane => snapshot.lanes[lane].limit != null);
    if (!hasLiveBatch) return null;

    return (
        <section className="quest-ui-orion-scheduler" aria-label="Orion live scheduler metadata">
            <div className="quest-ui-orion-scheduler-heading">
                <strong>Orion Scheduler</strong>
                <span>Live batch · unordered</span>
            </div>

            <div className="quest-ui-orion-scheduler-lanes">
                {LANES.map(lane => (
                    <div key={lane} className={`quest-ui-orion-scheduler-lane is-${lane}`}>
                        <span>{laneLabel(lane)}</span>
                        <strong>{schedulerLaneCopy(snapshot.lanes[lane])}</strong>
                    </div>
                ))}
            </div>

            {entries.length > 0 && (
                <div className="quest-ui-orion-scheduler-quests" aria-label="Quests in Orion's current scheduler batch">
                    {entries.map(([questId, quest]) => (
                        <div key={questId} className="quest-ui-orion-scheduler-quest">
                            <span title={questId}>{currentQuestName(questId)}</span>
                            <strong className={`is-${quest.state}`}>{quest.lane.toUpperCase()} · {quest.state.toUpperCase()}</strong>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
