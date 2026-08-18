import { useSettings } from "@api/Settings";

import { isOrionCommandReady } from "./orionIntegration";
import { OrionGlobalControls } from "./OrionControls";
import { QuestDashboard } from "./QuestDashboard";
import settings from "./settings";

import "./orion.css";

export function QuestDashboardShell({ closePopout }: { closePopout?: () => void; }) {
    const { orionIntegration } = settings.use(["orionIntegration"]);
    useSettings(["plugins.OrionQuests.enabled"]);
    const showOrionControls = orionIntegration === true && isOrionCommandReady();

    return (
        <div className={`quest-ui-dashboard-shell${showOrionControls ? " has-orion-control" : ""}`}>
            {showOrionControls && <div className="quest-ui-orion-header-control"><OrionGlobalControls /></div>}
            <QuestDashboard closePopout={closePopout} />
        </div>
    );
}
