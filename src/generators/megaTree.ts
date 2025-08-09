import {
  BlockPermutation,
  Dimension,
  Vector3,
  system,
} from "@minecraft/server";

/** Set of block ids that must never be overwritten. */
const PROTECTED = new Set([
  "minecraft:chest",
  "minecraft:trapped_chest",
  "minecraft:ender_chest",
  "minecraft:shulker_box",
  "minecraft:barrel",
  "minecraft:beacon",
  "minecraft:command_block",
  "minecraft:repeating_command_block",
  "minecraft:chain_command_block",
  "minecraft:bedrock",
  "minecraft:nether_portal",
  "minecraft:end_portal",
  "minecraft:end_gateway",
]);

/** Pseudo random number generator. */
class RNG {
  private state: number;
  constructor(seed: number) {
    this.state = seed;
  }
  next(): number {
    // LCG constants from Numerical Recipes
    this.state = (1664525 * this.state + 1013904223) >>> 0;
    return this.state / 0xffffffff;
  }
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }
}

/** Options controlling the size and pacing of the megatree generator. */
export interface MegaTreeOptions {
  seed?: number;
  trunkRadius?: number;
  trunkHeight?: number;
  /** Maximum blocks placed per tick. */
  maxBlocksPerTick?: number;
  /** Callback invoked when generation finishes. */
  onComplete?: (summary: { seed: number; placed: number }) => void;
}

/** Default parameters used when none are provided. */
const defaultOptions: Required<Omit<MegaTreeOptions, "onComplete">> = {
  seed: Math.floor(Date.now() % 2_147_483_647),
  trunkRadius: 6,
  trunkHeight: 32,
  maxBlocksPerTick: 500,
};

/** Simple integer noise. */
function noise(x: number, y: number, z: number): number {
  let h = x * 374761393 + y * 668265263 + z * 2147483647;
  h = (h ^ (h >> 13)) >>> 0;
  return ((h * 1274126177) & 0xffffffff) / 0xffffffff;
}

/**
 * Generates a large oak megatree at the specified origin.
 *
 * The tree is built using cooperative scheduling to keep block writes per tick
 * bounded. Some artistic liberties are taken; the implementation approximates
 * the silhouette described in the design spec.
 */
export function generateMegaTree(
  dimension: Dimension,
  origin: Vector3,
  options: MegaTreeOptions = {},
): void {
  const { seed, trunkRadius, trunkHeight, maxBlocksPerTick, onComplete } = {
    ...defaultOptions,
    ...options,
  };
  const rng = new RNG(seed);

  const baseX = Math.floor(origin.x);
  const baseY = Math.floor(origin.y);
  const baseZ = Math.floor(origin.z);

  // Resolve permutations
  const outerLog = BlockPermutation.resolve("minecraft:oak_log", {
    pillar_axis: "y",
  });
  const innerLog = BlockPermutation.resolve("minecraft:stripped_oak_log", {
    pillar_axis: "y",
  });
  const branchLog = BlockPermutation.resolve("minecraft:oak_log", {
    pillar_axis: "x",
  });
  const leaves = BlockPermutation.resolve("minecraft:oak_leaves");

  const blocks: { pos: Vector3; perm: BlockPermutation }[] = [];

  // Helper to test for protected blocks.
  const isBlocked = (pos: Vector3): boolean => {
    const block = dimension.getBlock(pos);
    if (!block) return true;
    return PROTECTED.has(block.typeId);
  };

  // --- Trunk generation with taper
  const topRadius = Math.max(1, Math.floor(trunkRadius * 0.7));
  for (let y = 0; y < trunkHeight; y++) {
    const t = y / trunkHeight;
    const radius = Math.round(trunkRadius + (topRadius - trunkRadius) * t);
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (dx * dx + dz * dz > radius * radius) continue;
        const world = { x: baseX + dx, y: baseY + y, z: baseZ + dz };
        if (isBlocked(world)) return; // Abort on obstruction
        const outer =
          dx * dx + dz * dz >= (radius - 1) * (radius - 1) || radius <= 1;
        blocks.push({ pos: world, perm: outer ? outerLog : innerLog });
      }
    }
  }

  // --- Branch ring
  const branchY = baseY + trunkHeight - 2;
  const branchCount = rng.int(8, 14);
  let maxBranchReach = 0;
  for (let i = 0; i < branchCount; i++) {
    const yaw = (i / branchCount) * Math.PI * 2 + rng.range(-0.1, 0.1);
    const length = rng.int(10, 22);
    const pitch = rng.range(0.087, 0.21); // 5-12 degrees in radians
    let x = baseX + Math.cos(yaw) * trunkRadius;
    let y = branchY;
    let z = baseZ + Math.sin(yaw) * trunkRadius;
    const dirX = Math.cos(yaw);
    const dirZ = Math.sin(yaw);
    for (let t = 0; t < length; t++) {
      const bx = Math.round(x);
      const by = Math.round(y);
      const bz = Math.round(z);
      const pos = { x: bx, y: by, z: bz };
      if (isBlocked(pos)) return;
      blocks.push({ pos, perm: branchLog });
      if (t === length - 1) {
        const twigLen = rng.int(3, 6);
        for (let j = 1; j <= twigLen; j++) {
          const tx = bx + Math.round(dirX * j);
          const ty = by + j;
          const tz = bz + Math.round(dirZ * j);
          const tpos = { x: tx, y: ty, z: tz };
          if (isBlocked(tpos)) return;
          blocks.push({ pos: tpos, perm: branchLog });
        }
      }
      x += dirX;
      z += dirZ;
      y += Math.tan(pitch);
    }
    const reach = trunkRadius + length;
    if (reach > maxBranchReach) maxBranchReach = reach;
  }

  // --- Canopy (oblate dome with noise)
  const baseRadius = Math.round(
    trunkRadius * rng.range(2.2, 2.6) + maxBranchReach
  );
  const radiusY = Math.round(baseRadius * rng.range(0.45, 0.55));
  const centerY = branchY + radiusY;

  for (let y = -radiusY; y <= radiusY; y++) {
    const fracY = y / radiusY;
    const radiusAtY = Math.round(Math.sqrt(1 - fracY * fracY) * baseRadius);
    for (let dx = -radiusAtY; dx <= radiusAtY; dx++) {
      for (let dz = -radiusAtY; dz <= radiusAtY; dz++) {
        const dist = Math.sqrt(dx * dx + dz * dz);
        let r = radiusAtY;
        r += Math.floor(noise(dx, y, dz) * 4 - 2);
        if (dist > r) continue;
        const world = {
          x: baseX + dx,
          y: centerY + y,
          z: baseZ + dz,
        };
        if (isBlocked(world)) return;
        if (y < 0 && noise(dx + 10, y + 10, dz + 10) > 0.6) continue;
        blocks.push({ pos: world, perm: leaves });
      }
    }
  }

  // --- Placement scheduler
  let index = 0;
  const total = blocks.length;
  const placeBatch = () => {
    const limit = Math.min(total, index + maxBlocksPerTick);
    for (; index < limit; index++) {
      const b = blocks[index];
      const block = dimension.getBlock(b.pos);
      if (!block || PROTECTED.has(block.typeId)) continue;
      block.setPermutation(b.perm);
    }
    if (index < total) {
      system.run(placeBatch);
    } else {
      onComplete?.({ seed, placed: total });
    }
  };
  system.run(placeBatch);
}
