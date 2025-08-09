import { registerMegaTreeDebug } from "./debug/megaTreeDebug";
import { registerElderSaplingGrowth } from "./components/elderSapling";
import { system } from "@minecraft/server";

// Log as soon as the VM ticks
system.run(() => {
  console.warn("§a[CanopyCraft] Add-on loaded!");
});

// Set up script event to spawn the megatree.
registerMegaTreeDebug();

// Enable Elder Oak sapling growth mechanics.
registerElderSaplingGrowth();