import {
    system, BlockPermutation, Dimension, Vector3, Player, ItemStack,EquipmentSlot 
} from "@minecraft/server";
import { generateMegaTree } from "../generators/megaTree";

function getSelectedItem(player: Player): ItemStack | undefined {
  const equip = player.getComponent("minecraft:equippable");
  if (!equip) return undefined;
  return equip.getEquipment(EquipmentSlot.Mainhand);
}
  
  const SAPLING_ID = "canopy:elder_oak_sapling";
  const BONE_MEAL_ID = "minecraft:bone_meal";
  const GROW_CHANCE = 1 / 7; // vanilla-ish
  
  function tryGrowAt(dimension: Dimension, at: Vector3) {
    const b = dimension.getBlock(at);
    if (!b || b.typeId !== SAPLING_ID) return;
    if (!isSpaceClear(dimension, at)) return;
  
    b.setPermutation(BlockPermutation.resolve("minecraft:air"));
    generateMegaTree(dimension, at,  {
        // trunkRadius: 6,
        // trunkHeight: 32,
        maxBlocksPerTick: 500,
        onComplete: () => {
            // lightweight telemetry; remove if noisy
            // console.warn(`[CanopyCraft] MegaTree complete`);
        },
    });
  }
  
  function isSpaceClear(dimension: Dimension, at: Vector3): boolean {
    const min = { x: at.x - 2, y: at.y + 1, z: at.z - 2 };
    const max = { x: at.x + 2, y: at.y + 9, z: at.z + 2 };
    let solids = 0;
    for (let y = min.y; y <= max.y; y++)
      for (let z = min.z; z <= max.z; z++)
        for (let x = min.x; x <= max.x; x++) {
          const id = dimension.getBlock({ x, y, z })?.typeId;
          if (!id || id === "minecraft:air") continue;
          if (id.endsWith("_leaves")) continue;
          if (id.includes("grass") || id.includes("flower")) continue;
          if (++solids > 6) return false;
        }
    return true;
  }
  
  // Register the custom block component early
  export function registerElderSaplingGrowth(){
    system.beforeEvents.startup.subscribe((ev) => {
        ev.blockComponentRegistry.registerCustomComponent("canopy:elder_sapling_growth", {
        onTick(e) {
            // periodic growth chance
            if (Math.random() >= GROW_CHANCE) return;
            tryGrowAt(e.block.dimension, e.block.location);
        },
        onPlayerInteract(e) {
            if (!e.player) return;
            const held = getSelectedItem(e.player);
            if (!held || held.typeId !== BONE_MEAL_ID) return;
        
            // Consume one bonemeal
            held.amount--;
            if (held.amount <= 0) {
            e.player.getComponent("minecraft:equippable")
                ?.setEquipment(EquipmentSlot.Mainhand, undefined);
            } else {
            e.player.getComponent("minecraft:equippable")
                ?.setEquipment(EquipmentSlot.Mainhand, held);
            }
        
            tryGrowAt(e.block.dimension, e.block.location);
        },
        });
    });
}