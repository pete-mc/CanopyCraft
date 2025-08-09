import { world } from "@minecraft/server";
import { registerMegaTreeDebug } from "./debug/megaTreeDebug";
import { registerElderOakSapling } from "./saplings/elderOakSapling";

// --- Hard‑verify the script engine is alive
import { system } from "@minecraft/server";

// Log as soon as the VM ticks
system.run(() => {
  console.warn("§a[CanopyCraft] Add-on loaded!");
});

// Also log on world init (fires when packs finish bootstrapping)
world.afterEvents.worldLoad.subscribe(() => {
  console.warn("§a[CanopyCraft] WorldLoad fired");
});

// --- Wire /scriptevent canopy:spawn <payload?>
system.afterEvents.scriptEventReceive.subscribe((ev) => {
  if (ev.id !== "canopy:spawn") return;

  // Echo what we got so you can see it's wired
  console.warn(`canopy:spawn received. message='${ev.message}' from=${ev.sourceType}`);

  // Example: simple feedback to player, if a player ran the command
  try { ev.sourceEntity?.runCommand(`tellraw @s {"rawtext":[{"text":"[CanopyCraft] spawn received"}]}`); } catch {}
});

// Inform players that the add-on is active.
world.afterEvents.playerSpawn.subscribe((e) => {
  e.player.sendMessage("§a[CanopyCraft] Add-on loaded!");
});

// Set up script event to spawn the megatree.
registerMegaTreeDebug();

// Enable Elder Oak sapling growth mechanics.
registerElderOakSapling();
