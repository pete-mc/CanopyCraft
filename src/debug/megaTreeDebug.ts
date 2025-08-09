import { system } from "@minecraft/server";
import { generateMegaTree } from "../generators/megaTree";

/**
 * Registers a script event listener that spawns a megatree at the
 * caller's location. Trigger with `/scriptevent canopy:spawn [delayMs]`.
 */
export function registerMegaTreeDebug(): void {
  system.afterEvents.scriptEventReceive.subscribe((ev) => {
    if (ev.id !== "canopy:spawn" || !ev.sourceEntity) return;

    const delay = Number(ev.message) || undefined;
    generateMegaTree(ev.sourceEntity.dimension, ev.sourceEntity.location, {
      stepDelayMs: delay,
    });
  });
}
