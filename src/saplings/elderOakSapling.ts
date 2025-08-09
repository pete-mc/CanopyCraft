import { Block, system, world } from "@minecraft/server";
import { generateMegaTree } from "../generators/megaTree";

const SAPLING_ID = "canopy:elder_oak_sapling";

function grow(block: Block): void {
  generateMegaTree(block.dimension, block.location);
  block.setType("minecraft:air");
}

export function registerElderOakSapling(): void {
  world.afterEvents.itemStartUseOn.subscribe((ev) => {
    if (!ev.itemStack || ev.itemStack.typeId !== "minecraft:bone_meal") return;
    if (ev.block.typeId !== SAPLING_ID) return;
    grow(ev.block);
  });

  system.afterEvents.scriptEventReceive.subscribe((ev) => {
    if (ev.id !== "canopy:elder_sapling_grow") return;
    const block = ev.sourceBlock;
    if (!block || block.typeId !== SAPLING_ID) return;
    grow(block);
  });
}
