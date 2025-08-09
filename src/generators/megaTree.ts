import { BlockPermutation, Dimension, Vector3, system } from "@minecraft/server";

/** Options controlling the size and pacing of the megatree generator. */
export interface MegaTreeOptions {
  /** Radius of the cylindrical trunk in blocks. */
  trunkRadius?: number;
  /** Height of the trunk in blocks. */
  trunkHeight?: number;
  /** Radius of the spherical canopy in blocks. */
  canopyRadius?: number;
  /** Delay in milliseconds between building each Y-layer. */
  stepDelayMs?: number;
}

/** Default parameters used when none are provided. */
const defaultOptions: Required<MegaTreeOptions> = {
  trunkRadius: 7,
  trunkHeight: 35,
  canopyRadius: 14,
  stepDelayMs: 50,
};

/**
 * Generates a large oak megatree at the specified origin.
 *
 * The tree is built layer-by-layer using {@link system.runTimeout} to keep
 * block writes per tick low and avoid the watchdog.
 *
 * @param dimension Dimension to place the tree in.
 * @param origin Block location representing the base of the trunk.
 * @param options Partial options overriding the {@link defaultOptions}.
 */
export function generateMegaTree(
  dimension: Dimension,
  origin: Vector3,
  options: MegaTreeOptions = {}
): void {
  const {
    trunkRadius,
    trunkHeight,
    canopyRadius,
    stepDelayMs,
  } = { ...defaultOptions, ...options };

  const baseX = Math.floor(origin.x);
  const baseY = Math.floor(origin.y);
  const baseZ = Math.floor(origin.z);

  // Pre-resolve permutations for performance.
  const outerLog = BlockPermutation.resolve("minecraft:oak_log", {
    pillar_axis: "y",
  });
  const innerLog = BlockPermutation.resolve("minecraft:stripped_oak_log", {
    pillar_axis: "y",
  });
  const leaves = BlockPermutation.resolve("minecraft:oak_leaves");

  const layers: (() => void)[] = [];

  // Trunk layers
  for (let y = 0; y < trunkHeight; y++) {
    const layerY = baseY + y;
    layers.push(() => {
      for (let dx = -trunkRadius; dx <= trunkRadius; dx++) {
        for (let dz = -trunkRadius; dz <= trunkRadius; dz++) {
          if (dx * dx + dz * dz > trunkRadius * trunkRadius) continue;
          const isOuter =
            dx * dx + dz * dz >= (trunkRadius - 1) * (trunkRadius - 1);
          const perm = isOuter ? outerLog : innerLog;
          dimension
            .getBlock({ x: baseX + dx, y: layerY, z: baseZ + dz })
            ?.setPermutation(perm);
        }
      }
    });
  }

  // Canopy layers (sphere sitting on top of trunk)
  for (let dy = 0; dy < canopyRadius * 2; dy++) {
    const relY = dy - canopyRadius; // -radius .. radius
    const radiusAtY = Math.floor(
      Math.sqrt(canopyRadius * canopyRadius - relY * relY)
    );
    const layerY = baseY + trunkHeight + dy;
    layers.push(() => {
      for (let dx = -radiusAtY; dx <= radiusAtY; dx++) {
        for (let dz = -radiusAtY; dz <= radiusAtY; dz++) {
          if (dx * dx + dz * dz > radiusAtY * radiusAtY) continue;
          dimension
            .getBlock({ x: baseX + dx, y: layerY, z: baseZ + dz })
            ?.setPermutation(leaves);
        }
      }
    });
  }

  // Execute layers sequentially with cooperative timeouts.
  const runLayer = (index: number) => {
    if (index >= layers.length) return;
    layers[index]();
    system.runTimeout(() => runLayer(index + 1), stepDelayMs);
  };

  runLayer(0);
}
