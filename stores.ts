import { findByPropsLazy } from "@webpack";

export const QuestsStore = findByPropsLazy("getQuest") as any;
