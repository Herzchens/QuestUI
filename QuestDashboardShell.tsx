import { useSettings } from "@api/Settings";

import { isOrionCommandReady } from "./orionIntegration";
import { OrionGlobalControls } from "./OrionControls";
import { QuestDashboard } from "./QuestDashboard";
import { QuestReloadControl } from "./QuestReloadControl";
import settings from "./settings";

import "./orion.css";

export function QuestDashboardShell({ closePopout }: { closePopout?: () => void; }) {
    const { orionIntegration } = settings.use(["orionIntegration"]);
    useSettings(["plugins.OrionQuests.enabled"]);
    const showOrionControls = orionIntegration === true && isOrionCommandReady();

    return (
        <div className={`quest-ui-dashboard-shell has-dashboard-tools${showOrionControls ? " has-orion-control" : ""}`}>
            <div className="quest-ui-dashboard-header-tools">
                {showOrionControls && <OrionGlobalControls />}
                <QuestReloadControl />
            </div>
            <QuestDashboard closePopout={closePopout} />
        </div>
    );
}
