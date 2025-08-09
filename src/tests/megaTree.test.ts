import { register, Test } from "@minecraft/server-gametest";
import { Dimension } from "@minecraft/server";
import { generateMegaTree } from "../generators/megaTree";

// Simple GameTest ensuring the generator executes without throwing.
register("canopy", "mega_tree_generation", (test: Test) => {
  const dimension = test.getDimension() as unknown as Dimension;
  const origin = test.worldBlockLocation({ x: 0, y: 0, z: 0 });
  generateMegaTree(dimension, origin, { stepDelayMs: 0 });
  test.succeed();
}).maxTicks(600);
