import { world } from "@minecraft/server";
world.afterEvents.playerSpawn.subscribe(e => {
  e.player.sendMessage("§a[CanopyCraft] Add-on loaded!");
});
