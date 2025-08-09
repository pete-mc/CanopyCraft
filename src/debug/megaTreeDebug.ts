import { system } from "@minecraft/server";
import { generateMegaTree } from "../generators/megaTree";

/**
 * Registers a script event listener that spawns a megatree at the player's
 * crosshair block or at their feet if the crosshair is air.
 */
export function registerMegaTreeDebug(): void {
  system.afterEvents.scriptEventReceive.subscribe((ev) => {
    if (ev.id !== "canopy:spawn" || !ev.sourceEntity) return;
    const player = ev.sourceEntity;
    const hit = player.getBlockFromViewDirection({ maxDistance: 30 });
    let loc = hit?.block?.location;
    if (!loc || hit?.block?.typeId === "minecraft:air") {
      loc = player.dimension.getBlock(player.location)?.location;
    }
    if (!loc) return;
    const seed = Math.floor(Date.now() % 2_147_483_647);
    generateMegaTree(player.dimension, loc, { seed });
    console.warn(`§a[CanopyCraft] Spawned megatree (seed ${seed})`);
  });
}
