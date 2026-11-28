import { selectGraphicsQuality, type GraphicsPreference } from "../dashboard/graphicsLogic";

/** A locked detent cannot change quality. Deliberately leaving Light clears its override. */
export function commitGraphicsDetent(value: GraphicsPreference, index: number | null): GraphicsPreference {
    if (index === 4) return value.light ? selectGraphicsQuality(value, index) : value;
    if (index === null || !Number.isInteger(index) || index < 0 || index > 3) return value;
    return selectGraphicsQuality(value, index);
}
