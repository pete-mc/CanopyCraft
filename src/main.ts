import { world } from "@minecraft/server";
import { registerMegaTreeDebug } from "./debug/megaTreeDebug";
import { registerElderOakSapling } from "./saplings/elderOakSapling";

// Inform players that the add-on is active.
world.afterEvents.playerSpawn.subscribe((e) => {
  e.player.sendMessage("§a[CanopyCraft] Add-on loaded!");
});

// Set up script event to spawn the megatree.
registerMegaTreeDebug();

// Enable Elder Oak sapling growth mechanics.
registerElderOakSapling();
