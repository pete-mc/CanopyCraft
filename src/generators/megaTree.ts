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

interface Segment {
  start: Vector3;
  dir: Vector3; // unit
  length: number;
  radius: number;
  level: number;
}

function add(a: Vector3, b: Vector3): Vector3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scale(v: Vector3, s: number): Vector3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function normalize(v: Vector3): Vector3 {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (len === 0) return { x: 0, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function key(p: Vector3): string {
  return `${p.x},${p.y},${p.z}`;
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
  const trunkTopY = baseY + trunkHeight - 1;

  // Resolve permutations
  const outerLog = BlockPermutation.resolve("minecraft:oak_log", {
    pillar_axis: "y",
  });
  const innerLog = BlockPermutation.resolve("minecraft:stripped_oak_log", {
    pillar_axis: "y",
  });
  const leafPerm = BlockPermutation.resolve("minecraft:oak_leaves", {
    persistent_bit: true,
  });

  const pending: { pos: Vector3; perm: BlockPermutation }[] = [];
  const logPositions: Vector3[] = [];

  // Helper to test for protected blocks.
  const isBlocked = (pos: Vector3): boolean => {
    const block = dimension.getBlock(pos);
    if (!block) return true;
    return PROTECTED.has(block.typeId);
  };

  // --- Trunk generation with taper
  const topRadius = Math.max(1, Math.floor(trunkRadius * 0.7));
  const taperSegs = Math.max(8, trunkRadius * 2);
  const taperOffsets: number[] = [];
  for (let i = 0; i < taperSegs; i++) taperOffsets.push(rng.int(-4, 4));
  const taperOffsetFor = (dx: number, dz: number): number => {
    const angle = Math.atan2(dz, dx);
    const idx = ((angle + Math.PI) / (Math.PI * 2)) * taperSegs;
    const i0 = Math.floor(idx) % taperSegs;
    const i1 = (i0 + 1) % taperSegs;
    const f = idx - i0;
    return taperOffsets[i0] * (1 - f) + taperOffsets[i1] * f;
  };
  for (let y = 0; y < trunkHeight; y++) {
    for (let dx = -trunkRadius; dx <= trunkRadius; dx++) {
      for (let dz = -trunkRadius; dz <= trunkRadius; dz++) {
        const offset = taperOffsetFor(dx, dz);
        const t = Math.min(1, Math.max(0, (y + offset) / trunkHeight));
        const radius = Math.round(trunkRadius + (topRadius - trunkRadius) * t);
        if (dx * dx + dz * dz > radius * radius) continue;
        const world = { x: baseX + dx, y: baseY + y, z: baseZ + dz };
        if (isBlocked(world)) return; // Abort on obstruction
        const outer =
          dx * dx + dz * dz >= (radius - 1) * (radius - 1) || radius <= 1;
        const perm = outer ? outerLog : innerLog;
        pending.push({ pos: world, perm });
        logPositions.push(world);
      }
    }
  }

  // --- Root system at base
  const rootCount = rng.int(3, 5);
  for (let r = 0; r < rootCount; r++) {
    const angle = rng.range(0, Math.PI * 2);
    const dirX = Math.cos(angle);
    const dirZ = Math.sin(angle);
    const length = rng.int(2, 4);
    for (let s = 0; s < length; s++) {
      const rx = baseX + Math.round(dirX * (trunkRadius + s));
      const rz = baseZ + Math.round(dirZ * (trunkRadius + s));
      const ry = baseY + (s === 0 ? 1 : 0);
      const rad = Math.max(1, Math.round(2 - (s / length) * 1.5));
      for (let dx = -rad; dx <= rad; dx++) {
        for (let dz = -rad; dz <= rad; dz++) {
          if (dx * dx + dz * dz > rad * rad) continue;
          const pos = { x: rx + dx, y: ry, z: rz + dz };
          if (isBlocked(pos)) continue;
          pending.push({ pos, perm: outerLog });
        }
      }
    }
  }

  // --- Vine growth on trunk
  const vineDirs = [
    { dx: 1, dz: 0, bit: 2 },
    { dx: -1, dz: 0, bit: 1 },
    { dx: 0, dz: 1, bit: 4 },
    { dx: 0, dz: -1, bit: 8 },
  ];
  const vineCount = rng.int(2, 4);
  for (let i = 0; i < vineCount; i++) {
    const dir = vineDirs[rng.int(0, vineDirs.length - 1)];
    let offset = rng.int(-trunkRadius + 1, trunkRadius - 1);
    const startY = baseY + rng.int(1, 3);
    const endY = baseY + trunkHeight - rng.int(4, 8);
    for (let y = startY; y <= endY; y++) {
      if (rng.next() < 0.15) {
        const d = rng.next() < 0.5 ? -1 : 1;
        offset = Math.max(-trunkRadius + 1, Math.min(trunkRadius - 1, offset + d));
      }
      const trunkX = dir.dx !== 0 ? baseX + dir.dx * (trunkRadius - 1) : baseX + offset;
      const trunkZ = dir.dz !== 0 ? baseZ + dir.dz * (trunkRadius - 1) : baseZ + offset;
      const relX = trunkX - baseX;
      const relZ = trunkZ - baseZ;
      const tOff = taperOffsetFor(relX, relZ);
      const localY = y - baseY;
      const t = Math.min(1, Math.max(0, (localY + tOff) / trunkHeight));
      const r = trunkRadius + (topRadius - trunkRadius) * t;
      if (relX * relX + relZ * relZ > r * r) break;
      const vinePos = { x: trunkX + dir.dx, y, z: trunkZ + dir.dz };
      if (isBlocked(vinePos)) continue;
      const perm = BlockPermutation.resolve("minecraft:vine", {
        vine_direction_bits: dir.bit,
      });
      pending.push({ pos: vinePos, perm });
    }
  }

  // --- Branch skeleton
  const segments: Segment[] = [];
  const branchStartMinY = baseY + Math.floor(trunkHeight * 0.8);
  const branchStartMaxY = baseY + trunkHeight - 1;
  const boughCount = rng.int(6, 10);

  for (let i = 0; i < boughCount; i++) {
    const yaw = (i / boughCount) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const startY = rng.int(branchStartMinY, branchStartMaxY);
    const start = {
      x: baseX + Math.round(Math.cos(yaw) * trunkRadius),
      y: startY,
      z: baseZ + Math.round(Math.sin(yaw) * trunkRadius),
    };
    const dir = normalize({
      x: Math.cos(yaw) + rng.range(-0.1, 0.1),
      y: rng.range(0.2, 0.35),
      z: Math.sin(yaw) + rng.range(-0.1, 0.1),
    });
    const length = rng.range(8, 14);
    const radius = Math.max(1, trunkRadius * 0.5);
    const seg: Segment = { start, dir, length, radius, level: 0 };
    segments.push(seg);
    spawnChildren(seg, 1);
  }

  function spawnChildren(parent: Segment, level: number) {
    if (level > 2) return;
    const count = rng.int(1, 2);
    for (let i = 0; i < count; i++) {
      const t = rng.range(0.3, 0.9);
      const start = add(parent.start, scale(parent.dir, parent.length * t));
      const dir = normalize({
        x: parent.dir.x + rng.range(-0.8, 0.8),
        y: parent.dir.y + rng.range(0.05, 0.4),
        z: parent.dir.z + rng.range(-0.8, 0.8),
      });
      const length = parent.length * rng.range(0.4, 0.7);
      const radius = parent.radius * 0.75;
      const seg: Segment = { start, dir, length, radius, level };
      segments.push(seg);
      if (level < 2 && rng.next() < 0.6) spawnChildren(seg, level + 1);
    }
  }

  // --- Place branch logs
  for (const seg of segments) {
    const steps = Math.ceil(seg.length);
    const rad = Math.max(1, Math.round(seg.radius));
    for (let s = 0; s <= steps; s++) {
      const center = add(seg.start, scale(seg.dir, s));
      const cx = Math.round(center.x);
      const cy = Math.round(center.y);
      const cz = Math.round(center.z);
      for (let dx = -rad; dx <= rad; dx++) {
        for (let dy = -rad; dy <= rad; dy++) {
          for (let dz = -rad; dz <= rad; dz++) {
            if (dx * dx + dy * dy + dz * dz > rad * rad) continue;
            const pos = { x: cx + dx, y: cy + dy, z: cz + dz };
            if (isBlocked(pos)) return;
            const ax = Math.abs(seg.dir.x);
            const ay = Math.abs(seg.dir.y);
            const az = Math.abs(seg.dir.z);
            let axis = "y";
            if (ax > ay && ax > az) axis = "x";
            else if (az > ay && az > ax) axis = "z";
            const perm = BlockPermutation.resolve("minecraft:oak_log", {
              pillar_axis: axis,
            });
            pending.push({ pos, perm });
            logPositions.push(pos);
          }
        }
      }
    }
  }

  // --- Compute log distances (Chebyshev BFS)
  const dist = new Map<string, number>();
  const queue: Vector3[] = [];
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (const p of logPositions) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
    const k = key(p);
    if (!dist.has(k)) {
      dist.set(k, 0);
      queue.push(p);
    }
  }
  minX -= 6;
  maxX += 6;
  minY -= 6;
  maxY += 6;
  minZ -= 6;
  maxZ += 6;

  for (let qi = 0; qi < queue.length; qi++) {
    const p = queue[qi];
    const d = dist.get(key(p))!;
    if (d >= 6) continue;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          if (dx === 0 && dy === 0 && dz === 0) continue;
          const nx = p.x + dx;
          const ny = p.y + dy;
          const nz = p.z + dz;
          if (nx < minX || nx > maxX || ny < minY || ny > maxY || nz < minZ || nz > maxZ) continue;
          const k = `${nx},${ny},${nz}`;
          if (dist.has(k)) continue;
          dist.set(k, d + 1);
          queue.push({ x: nx, y: ny, z: nz });
        }
      }
    }
  }

  // --- Leaves around segments
  const placedLeaves = new Set<string>();
  for (const seg of segments) {
    const baseLeafRadius =
      seg.level === 0
        ? 3 + Math.ceil(seg.radius * 1.2)
        : seg.level === 1
        ? 2 + Math.ceil(seg.radius)
        : 1 + Math.ceil(seg.radius * 0.8);
    const step = Math.max(1, Math.floor(seg.radius));
    const startT =
      seg.level === 0 ? seg.length * 0.4 : seg.level === 1 ? seg.length * 0.3 : 0;
    for (let s = startT; s <= seg.length; s += step) {
      const center = add(seg.start, scale(seg.dir, s));
      const cx = Math.round(center.x);
      const cy = Math.round(center.y);
      const cz = Math.round(center.z);
      for (let dx = -baseLeafRadius; dx <= baseLeafRadius; dx++) {
        for (let dy = -baseLeafRadius; dy <= baseLeafRadius; dy++) {
          for (let dz = -baseLeafRadius; dz <= baseLeafRadius; dz++) {
            const distSq = dx * dx + dy * dy + dz * dz;
            let r = baseLeafRadius + Math.floor(noise(cx + dx, cy + dy, cz + dz) * 4 - 2);
            if (distSq > r * r) continue;
            const pos = { x: cx + dx, y: cy + dy, z: cz + dz };
            const k = key(pos);
            const dd = dist.get(k);
            if (dd === undefined || dd > 6) continue;
            if (isBlocked(pos)) continue;
            if (placedLeaves.has(k)) continue;
            placedLeaves.add(k);
            pending.push({ pos, perm: leafPerm });
          }
        }
      }
    }
  }

  // --- Final canopy sealing pass
  const canopyStartY = trunkTopY - 2;
  for (const log of logPositions) {
    if (log.y < canopyStartY) continue;
    const above = { x: log.x, y: log.y + 1, z: log.z };
    const blockAbove = dimension.getBlock(above);
    if (!blockAbove || blockAbove.typeId !== "minecraft:air") continue;
    const aboveKey = key(above);
    const aboveDist = dist.get(aboveKey);
    if (aboveDist === undefined || aboveDist > 6) continue;
    if (!placedLeaves.has(aboveKey)) {
      placedLeaves.add(aboveKey);
      pending.push({ pos: above, perm: leafPerm });
    }
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const pos = { x: above.x + dx, y: above.y + dy, z: above.z + dz };
          const k = key(pos);
          const dd = dist.get(k);
          if (dd === undefined || dd > 6 || dd === 0) continue;
          if (placedLeaves.has(k)) continue;
          if (isBlocked(pos)) continue;
          placedLeaves.add(k);
          pending.push({ pos, perm: leafPerm });
        }
      }
    }
  }

  // --- Placement scheduler
  let index = 0;
  const total = pending.length;
  const placeBatch = () => {
    const limit = Math.min(total, index + maxBlocksPerTick);
    for (; index < limit; index++) {
      const b = pending[index];
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

