import { register, Test } from "@minecraft/server-gametest";
import { Dimension } from "@minecraft/server";
import { generateMegaTree } from "../generators/megaTree";

// GameTest spawning the megatree below the structure origin.
register("canopy", "mega_tree_generation", (test: Test) => {
  const dimension = test.getDimension() as unknown as Dimension;
  const origin = test.worldBlockLocation({ x: 0, y: -60, z: 0 });
  generateMegaTree(dimension, origin, {
    onComplete: (summary) => {
      console.warn(
        `§a[CanopyCraft] Generated megatree seed=${summary.seed} blocks=${summary.placed}`
      );
      test.succeed();
    },
  });
}).maxTicks(8);
