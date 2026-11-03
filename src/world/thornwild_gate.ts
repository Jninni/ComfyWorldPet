/**
 * Thorn Gate — the overworld entrance to the Thornwild: a ≈5 m archway of twisted brambles with a glowing purple
 * swirl inside, flanking bramble hedges, a twisted tree or two behind, and an icon-only warning sign.
 *
 * Built in LOCAL coordinates under `root` (root.position = pos, root.rotation.y = rotY); front faces local -Z.
 * Colliders are returned in WORLD coordinates.
 *
 * setOpen(false): a woven thorny barrier covers the swirl and its collider blocks the opening.
 * setOpen(true):  the barrier retracts into the pillars (animated in update) and its collider collapses in place.
 * The very first setOpen call snaps (no animation).
 */
import { Mesh, TransformNode, Vector3, Color3, type Scene } from "@babylonjs/core";
import { Batch, scallopRug } from "../render/Shapes";
import { col, jitterCol, rng } from "../render/Palette";
import { toonMat } from "../render/Toon";
import { elb } from "./props";
import type { Collider } from "../core/types";
import { TAU, smooth01, at, tubeMesh, alignY, rawMesh, thornMesh, addTwistedTree, addGloomShroom, addIconSign } from "./thornwild_kit";

export interface ThornGate {
  root: TransformNode;
  /** pillars, hedges, back wall + the barrier (barrier entries collapse in place while open) */
  colliders: Collider[];
  /** the barrier collider(s) alone (also inside `colliders`), if you prefer to add/remove them yourself */
  barrier: Collider[];
  /** walk-into trigger point at the swirl (world); only reachable while open */
  entrance: Vector3;
  update(dt: number, t: number): void;
  setOpen(open: boolean): void;
  isOpen(): boolean;
}

const PLUM_TOP = "#9474b6";
const PLUM_BOT = "#56407a";

export function buildThornGate(scene: Scene, pos: Vector3, rotY: number): ThornGate {
  const r = rng(9091);
  const rand = (a: number, b: number) => a + (b - a) * r();
  const root = new TransformNode("thornGate", scene);
  root.position.copyFrom(pos);
  root.rotation.y = rotY;
  const cR = Math.cos(rotY),
    sR = Math.sin(rotY);
  const wx = (lx: number, lz: number) => pos.x + lx * cR + lz * sR;
  const wz = (lx: number, lz: number) => pos.z - lx * sR + lz * cR;
  const toWorld = (c: Collider): Collider => (c.kind === "circle" ? { kind: "circle", x: wx(c.x, c.z), z: wz(c.x, c.z), r: c.r } : c);

  const frame = new Batch(scene, "thornGateFrame");
  const thorns = new Batch(scene, "thornGateThorns");
  const glow = new Batch(scene, "thornGateGlow");
  const shroomStems = new Batch(scene, "thornGateStems");
  const bark = new Batch(scene, "thornGateBark");
  const canopy = new Batch(scene, "thornGateCanopy");
  const colliders: Collider[] = [];

  const thorn = (b: Batch, x: number, y: number, z: number, nx: number, ny: number, nz: number, s: number) => {
    const m = thornMesh(scene);
    at(m, x, y, z, alignY(nx, ny, nz));
    m.scaling.setAll(s);
    b.add(m);
  };

  // ------------------------------------------------------------------ arch: three twisted strands around a centreline
  const PH = 2.5, // pillar height
    RX = 2.05, // centreline half-width
    RY = 1.95; // arch rise
  const arcLen = Math.PI * Math.sqrt((RX * RX + RY * RY) / 2);
  const total = PH * 2 + arcLen;
  const centre = (s: number): Vector3 => {
    if (s < PH) return new Vector3(-RX - 0.1 * Math.sin((s / PH) * Math.PI), s - 0.15, 0);
    if (s > PH + arcLen) {
      const q = total - s;
      return new Vector3(RX + 0.1 * Math.sin((q / PH) * Math.PI), q - 0.15, 0);
    }
    const a = Math.PI * (1 - (s - PH) / arcLen);
    return new Vector3(Math.cos(a) * RX, PH - 0.15 + Math.sin(a) * RY, 0);
  };
  const N = 56;
  for (let k = 0; k < 3; k++) {
    const pts: Vector3[] = [];
    for (let i = 0; i <= N; i++) {
      const s = (i / N) * total;
      const p = centre(s);
      const p2 = centre(Math.min(total, s + 0.05));
      const p1 = centre(Math.max(0, s - 0.05));
      const tx = p2.x - p1.x,
        ty = p2.y - p1.y;
      const tl = Math.hypot(tx, ty) || 1;
      // in-plane normal & z axis
      const nx = -ty / tl,
        ny = tx / tl;
      const phi = (k * TAU) / 3 + s * 2.1;
      const foot = Math.max(0, 1 - Math.min(s, total - s) / 1.0);
      const off = 0.2 + foot * 0.25;
      pts.push(new Vector3(p.x + nx * Math.cos(phi) * off, p.y + ny * Math.cos(phi) * off, Math.sin(phi) * off));
    }
    frame.add(
      tubeMesh(
        scene,
        pts,
        (u) => {
          const e = Math.min(u, 1 - u);
          return 0.17 + Math.max(0, 0.12 - e) * 1.6 - (k === 2 ? 0.03 : 0);
        },
        jitterCol(PLUM_TOP, 0.03, r),
        PLUM_BOT,
        7,
      ),
    );
    // thorns along each strand (outward-ish & toward the camera)
    for (let i = 3; i < N - 2; i += 3) {
      const p = pts[i];
      const c = centre((i / N) * total);
      const ox = p.x - c.x,
        oy = p.y - c.y;
      thorn(thorns, p.x, p.y, p.z - 0.05, ox * 2, oy * 2 + 0.2, -0.8 + p.z, rand(0.9, 1.3));
    }
  }
  // chunky root clumps at the feet
  for (const sx of [-1, 1]) {
    for (let j = 0; j < 3; j++) {
      const a = (j / 3) * TAU + rand(0, 1);
      frame.add(at(elb(scene, 0.45, 0.3, 0.38, { color: PLUM_TOP, bottom: PLUM_BOT }, 6), sx * RX + Math.cos(a) * 0.45, 0.1, Math.sin(a) * 0.4));
    }
    colliders.push(toWorld({ kind: "circle", x: sx * RX, z: 0, r: 0.62 }));
  }
  // curly tendrils sprouting from the top of the arch
  for (let k = 0; k < 4; k++) {
    const s = PH + arcLen * (0.15 + k * 0.23);
    const b0 = centre(s);
    const dir = k < 2 ? -1 : 1;
    const pts: Vector3[] = [];
    for (let j = 0; j <= 5; j++) {
      const u = j / 5;
      pts.push(new Vector3(b0.x + dir * u * 0.45, b0.y + 0.1 + u * 0.7, -0.1 + u * 0.1));
    }
    const tp = pts[5];
    for (let j = 1; j <= 6; j++) {
      const q = (j / 6) * Math.PI * 1.7;
      pts.push(new Vector3(tp.x + dir * Math.sin(q) * 0.2, tp.y + (1 - Math.cos(q)) * 0.18, tp.z));
    }
    frame.add(tubeMesh(scene, pts, (u) => 0.07 * (1 - 0.7 * u), PLUM_TOP, PLUM_BOT, 5));
    frame.add(at(elb(scene, 0.14, 0.035, 0.08, { color: "#a98ccc" }, 5), pts[3].x - dir * 0.08, pts[3].y, pts[3].z, [0.3, dir * 0.6, dir * 0.5]));
  }
  // two lantern-berries dangling under the apex
  for (const sx of [-0.55, 0.6]) {
    const top = PH - 0.15 + RY * Math.sqrt(Math.max(0, 1 - (sx / RX) ** 2)) - 0.15;
    const len = rand(0.35, 0.55);
    frame.add(at(elb(scene, 0.012, len / 2, 0.012, { color: "#d8cfe2" }, 4), sx, top - len / 2, -0.25));
    glow.add(at(elb(scene, 0.11, 0.13, 0.11, { color: "#fff0b8", bottom: "#ffb35c" }, 6), sx, top - len - 0.1, -0.25));
  }

  // ------------------------------------------------------------------ the glowing swirl (portal disc + rotating arms)
  {
    const pos: number[] = [],
      ref: number[] = [],
      idx: number[] = [],
      cols: number[] = [];
    const IX = 1.72,
      cy = 1.9;
    const boundary: [number, number][] = [];
    for (let i = 0; i <= 6; i++) boundary.push([-IX, (i / 6) * (PH - 0.15)]);
    for (let i = 1; i < 20; i++) {
      const a = Math.PI * (1 - i / 20);
      boundary.push([Math.cos(a) * IX, PH - 0.15 + Math.sin(a) * (RY - 0.28)]);
    }
    for (let i = 6; i >= 0; i--) boundary.push([IX, (i / 6) * (PH - 0.15)]);
    // close the bottom edge through (0, 0)
    const ring = [...boundary, [0, 0] as [number, number]];
    const cIn = col("#2b1450"),
      cMid = col("#6a32b4"),
      cOut = col("#d494ff");
    const push = (x: number, y: number, c: Color3) => {
      pos.push(x, y, 0.32);
      ref.push(0, 0, -1);
      cols.push(c.r, c.g, c.b, 1);
      return pos.length / 3 - 1;
    };
    const c0 = push(0, cy, cIn);
    const mids: number[] = [],
      outs: number[] = [];
    for (const [x, y] of ring) {
      mids.push(push(x * 0.55, cy + (y - cy) * 0.55, cMid));
      outs.push(push(x, y, cOut));
    }
    const n = ring.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      idx.push(c0, mids[i], mids[j]);
      idx.push(mids[i], outs[i], outs[j], mids[i], outs[j], mids[j]);
    }
    glow.add(rawMesh(scene, "thornPortal", pos, ref, idx, cols));
  }
  const swirlNode = new TransformNode("thornGateSwirl", scene);
  swirlNode.parent = root;
  swirlNode.position.set(0, 1.9, 0.26);
  const swirl = new Batch(scene, "thornGateSwirlArms");
  for (let k = 0; k < 3; k++) {
    const pts: Vector3[] = [];
    const M = 30;
    for (let i = 0; i <= M; i++) {
      const u = i / M;
      const th = u * Math.PI * 2.4 + (k * TAU) / 3;
      const rr = 0.06 + 1.42 * u;
      pts.push(new Vector3(Math.cos(th) * rr, Math.sin(th) * rr, 0));
    }
    swirl.add(tubeMesh(scene, pts, (u) => 0.035 + 0.035 * Math.sin(u * Math.PI), k === 1 ? "#ffd2f6" : "#efd2ff", undefined, 5));
    for (let i = 0; i < 4; i++) {
      const p = pts[6 + i * 6];
      swirl.add(at(elb(scene, 0.06, 0.06, 0.03, { color: "#ffffff" }, 4), p.x * 1.08, p.y * 1.08, -0.02));
    }
  }
  swirl.add(at(elb(scene, 0.16, 0.16, 0.04, { color: "#f6e6ff" }, 6), 0, 0, -0.02));

  // ------------------------------------------------------------------ flanking hedges, back wall, trees
  for (const sx of [-1, 1]) {
    for (let j = 0; j < 4; j++) {
      const u = j / 3;
      const x = sx * (2.95 + u * 2.9);
      const z = 0.15 + u * u * 1.8 + rand(-0.15, 0.15);
      const rad = rand(0.9, 1.15) * (1 - u * 0.15);
      const h = rand(1.5, 2.0) * (1 - u * 0.25);
      frame.add(at(elb(scene, rad, h * 0.6, rad * 0.95, { color: jitterCol(PLUM_TOP, 0.03, r), bottom: PLUM_BOT }, 7), x, h * 0.4, z));
      if (r() < 0.7) frame.add(at(elb(scene, rad * 0.7, h * 0.35, rad * 0.7, { color: jitterCol("#a084c2", 0.03, r), bottom: PLUM_TOP }, 6), x + rand(-0.2, 0.2), h * 0.85, z + 0.15));
      for (let t = 0; t < 4; t++) {
        const a = -Math.PI / 2 + rand(-1.2, 1.2),
          el = rand(0.0, 0.9);
        const ux = Math.cos(a) * Math.cos(el),
          uy = Math.sin(el),
          uz = Math.sin(a) * Math.cos(el);
        thorn(thorns, x + ux * rad * 0.95, h * 0.4 + uy * h * 0.58, z + uz * rad * 0.9, ux, uy, uz, rand(0.9, 1.3));
      }
      colliders.push(toWorld({ kind: "circle", x, z, r: rad * 0.9 }));
    }
  }
  for (const [x, z, rr] of [
    [-1.1, 1.5, 1.05],
    [0, 1.6, 1.1],
    [1.1, 1.5, 1.05],
  ] as [number, number, number][]) {
    frame.add(at(elb(scene, rr, 1.4, rr * 0.85, { color: "#7a5c9c", bottom: PLUM_BOT }, 7), x, 1.0, z + 0.2));
    colliders.push(toWorld({ kind: "circle", x, z, r: rr }));
  }
  const trees = { bark, canopy: [canopy], glow };
  colliders.push(toWorld(addTwistedTree(scene, trees, -4.4, 0, 2.6, 1.15, r)));
  colliders.push(toWorld(addTwistedTree(scene, trees, 4.9, 0, 2.2, 1.0, r)));
  colliders.push(toWorld(addTwistedTree(scene, trees, 0.6, 0, 3.6, 1.3, r)));

  // ------------------------------------------------------------------ gloomy ground patch, roots, shrooms, warning sign
  {
    const patch = scallopRug(scene, 3.4, 11, { color: "#6e5d8c", bottom: "#56477a" }, 0.03);
    patch.position.set(0, 0.0, -0.4);
    patch.scaling.set(1.45, 1, 0.75);
    frame.add(patch);
    const inner = scallopRug(scene, 2.2, 9, { color: "#8a77a8" }, 0.04);
    inner.position.set(0, 0.005, -0.5);
    inner.scaling.set(1.2, 1, 0.6);
    frame.add(inner);
    for (let i = 0; i < 6; i++) {
      const sx = i < 3 ? -1 : 1;
      const a = rand(-0.6, 0.6);
      frame.add(at(elb(scene, 0.16, 0.09, 0.6, { color: PLUM_TOP, bottom: PLUM_BOT }, 5), sx * (RX - 0.3) + Math.sin(a) * 0.7, 0.04, -0.75 - Math.cos(a) * 0.3, [0, a + sx * 0.5, 0]));
    }
    addGloomShroom(scene, shroomStems, glow, -2.9, 0, -0.9, 1.0, "amber", r);
    addGloomShroom(scene, shroomStems, glow, 3.0, 0, -0.8, 0.9, "magenta", r);
    addGloomShroom(scene, shroomStems, glow, 4.4, 0, -0.2, 0.8, "amber", r);
    addGloomShroom(scene, shroomStems, glow, -5.2, 0, 0.6, 0.85, "magenta", r);
    colliders.push(toWorld(addIconSign(scene, shroomStems, -3.6, 0, -1.9, 0.3, "warning")));
  }

  // ------------------------------------------------------------------ barrier (two halves that retract into the pillars)
  const halves: TransformNode[] = [];
  const barrierMat = toonMat(scene, { name: "thornGateBarrierMat", rim: 0.28 });
  const thornMat = toonMat(scene, { name: "thornGateThornMat", rim: 0.3 });
  for (const sx of [-1, 1]) {
    const node = new TransformNode("thornGateBarrier", scene);
    node.parent = root;
    node.position.set(sx * (RX - 0.1), 0, -0.42);
    const vb = new Batch(scene, "thornGateBarrierVines");
    const tb = new Batch(scene, "thornGateBarrierThorns");
    const heights = [0.45, 1.1, 1.75, 2.4, 3.05];
    heights.forEach((h, k) => {
      const pts: Vector3[] = [];
      const L = RX + 0.25;
      const M = 12;
      for (let j = 0; j <= M; j++) {
        const u = j / M;
        const lx = -sx * u * L;
        const y = h + (k % 2 ? 0.45 : -0.3) * u + Math.sin(u * Math.PI * 2 + k) * 0.08;
        pts.push(new Vector3(lx, Math.min(y, 3.65), Math.sin(u * Math.PI * 3 + k * 1.7) * 0.09));
      }
      // curl at the inner end
      const e = pts[M];
      for (let j = 1; j <= 4; j++) {
        const q = (j / 4) * Math.PI * 1.4;
        pts.push(new Vector3(e.x - sx * Math.sin(q) * 0.18, e.y + (1 - Math.cos(q)) * 0.16 * (k % 2 ? -1 : 1), e.z));
      }
      vb.add(tubeMesh(scene, pts, (u) => 0.12 * (1 - 0.55 * u), "#9a7abd", "#6b4f8f", 6));
      for (let j = 1; j < M; j += 2) {
        const p = pts[j];
        const up = j % 4 === 1 ? 1 : -1;
        thorn(tb, p.x, p.y, p.z - 0.06, 0, up * 0.7, -1, rand(1.0, 1.35));
      }
    });
    const vm = vb.build({ material: barrierMat, outline: 0.04 });
    const tm = tb.build({ material: thornMat, outline: 0.03 });
    for (const m of [vm, tm]) {
      if (!m) continue;
      m.parent = node;
      m.isPickable = false;
    }
    halves.push(node);
  }

  // ------------------------------------------------------------------ build
  const mats = {
    frame: toonMat(scene, { name: "thornGateFrameMat", rim: 0.28 }),
    glow: toonMat(scene, { name: "thornGateGlowMat", emissive: "#d8d8d8", rim: 0.3 }),
    swirl: toonMat(scene, { name: "thornGateSwirlMat", emissive: "#f0f0f0", rim: 0.2 }),
    bark: toonMat(scene, { name: "thornGateBarkMat", rim: 0.25 }),
    canopy: toonMat(scene, { name: "thornGateCanopyMat", rim: 0.32 }),
  };
  mats.bark.diffuseColor = col("#8f80a6");
  mats.canopy.diffuseColor = col("#5e4b88");
  const built: (Mesh | null)[] = [
    frame.build({ material: mats.frame, outline: 0.045 }),
    thorns.build({ material: thornMat, outline: 0.03 }),
    glow.build({ material: mats.glow, outline: 0.03, outlineColor: "#5b3f86", castShadow: false }),
    shroomStems.build({ outline: 0.035 }),
    bark.build({ material: mats.bark, outline: 0.04 }),
    canopy.build({ material: mats.canopy, outline: 0.045 }),
  ];
  for (const m of built) {
    if (!m) continue;
    m.parent = root;
    m.isPickable = false;
  }
  const swirlM = swirl.build({ material: mats.swirl, outline: false, castShadow: false });
  if (swirlM) {
    swirlM.parent = swirlNode;
    swirlM.isPickable = false;
  }

  // ------------------------------------------------------------------ barrier collider
  const axisAligned = Math.abs(sR) < 0.02 || Math.abs(cR) < 0.02;
  const barrier: Collider[] = [];
  const barrierShape: Collider[] = [];
  if (axisAligned) {
    const xs = [wx(-RX, -0.75), wx(RX, -0.15)],
      zs = [wz(-RX, -0.75), wz(RX, -0.15)];
    const b: Collider = { kind: "box", minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
    barrier.push(b);
    barrierShape.push({ ...b });
  } else {
    for (let x = -RX + 0.3; x <= RX - 0.29; x += 0.42) {
      const c: Collider = { kind: "circle", x: wx(x, -0.45), z: wz(x, -0.45), r: 0.34 };
      barrier.push(c);
      barrierShape.push({ ...c });
    }
  }
  colliders.push(...barrier);
  const postX = wx(-RX, 0),
    postZ = wz(-RX, 0);
  const setBarrierSolid = (solid: boolean) => {
    barrier.forEach((c, i) => {
      const src = barrierShape[i];
      if (c.kind === "box" && src.kind === "box") {
        if (solid) Object.assign(c, src);
        else {
          // collapse to a point inside the left pillar (stays in the same spatial-hash cells)
          const px = Math.max(src.minX, Math.min(src.maxX, postX)),
            pz = Math.max(src.minZ, Math.min(src.maxZ, postZ));
          c.minX = c.maxX = px;
          c.minZ = c.maxZ = pz;
        }
      } else if (c.kind === "circle" && src.kind === "circle") {
        if (solid) Object.assign(c, src);
        else {
          c.x = postX;
          c.z = postZ;
          c.r = 0.01;
        }
      }
    });
  };

  let openK = 0,
    target = 0,
    first = true;
  const place = () => {
    const e = 1 - smooth01(openK);
    for (const h of halves) {
      h.scaling.set(Math.max(0.02, e), 0.55 + 0.45 * e, 1);
      h.setEnabled(e > 0.02);
    }
  };
  place();
  setBarrierSolid(true);

  const portalBase = new Color3(0.85, 0.85, 0.85);
  return {
    root,
    colliders,
    barrier,
    entrance: new Vector3(wx(0, 0.05), pos.y, wz(0, 0.05)),
    isOpen: () => target === 1,
    setOpen(open: boolean) {
      target = open ? 1 : 0;
      setBarrierSolid(!open);
      if (first) {
        openK = target;
        first = false;
        place();
      }
    },
    update(dt: number, t: number) {
      swirlNode.rotation.z = -t * 0.9;
      const s = 1 + 0.04 * Math.sin(t * 2.2);
      swirlNode.scaling.set(s, s, 1);
      mats.glow.emissiveColor.copyFrom(portalBase).scaleInPlace(0.9 + 0.15 * Math.sin(t * 1.6));
      if (openK !== target) {
        openK = target > openK ? Math.min(1, openK + dt * 0.9) : Math.max(0, openK - dt * 1.4);
        place();
      }
    },
  };
}
