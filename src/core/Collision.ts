import type { Collider } from "./types";

/**
 * Tiny 2D (XZ) collision world with a uniform spatial hash.
 * Static colliders only; the player/critters are circles pushed out of them.
 */
export class CollisionWorld {
  private cells = new Map<number, Collider[]>();
  private all: Collider[] = [];
  /** extra blocking test (e.g. deep water) */
  blockers: ((x: number, z: number) => boolean)[] = [];
  bounds = { minX: -1e9, maxX: 1e9, minZ: -1e9, maxZ: 1e9 };

  constructor(private cell = 6) {}

  private key(ix: number, iz: number) {
    return ((ix + 4096) << 13) ^ (iz + 4096);
  }

  clear() {
    this.cells.clear();
    this.all = [];
    this.blockers = [];
  }

  add(c: Collider | Collider[] | undefined | null) {
    if (!c) return;
    if (Array.isArray(c)) {
      c.forEach((x) => this.add(x));
      return;
    }
    this.all.push(c);
    let minX: number, maxX: number, minZ: number, maxZ: number;
    if (c.kind === "circle") {
      minX = c.x - c.r;
      maxX = c.x + c.r;
      minZ = c.z - c.r;
      maxZ = c.z + c.r;
    } else {
      ({ minX, maxX, minZ, maxZ } = c);
    }
    const s = this.cell;
    for (let ix = Math.floor(minX / s); ix <= Math.floor(maxX / s); ix++)
      for (let iz = Math.floor(minZ / s); iz <= Math.floor(maxZ / s); iz++) {
        const k = this.key(ix, iz);
        let arr = this.cells.get(k);
        if (!arr) this.cells.set(k, (arr = []));
        arr.push(c);
      }
  }

  remove(c: Collider | Collider[] | undefined | null) {
    if (!c) return;
    const list = Array.isArray(c) ? c : [c];
    for (const x of list) {
      const i = this.all.indexOf(x);
      if (i >= 0) this.all.splice(i, 1);
      for (const arr of this.cells.values()) {
        const j = arr.indexOf(x);
        if (j >= 0) arr.splice(j, 1);
      }
    }
  }

  private nearby(x: number, z: number, r: number, out: Set<Collider>) {
    const s = this.cell;
    for (let ix = Math.floor((x - r) / s); ix <= Math.floor((x + r) / s); ix++)
      for (let iz = Math.floor((z - r) / s); iz <= Math.floor((z + r) / s); iz++) {
        const arr = this.cells.get(this.key(ix, iz));
        if (arr) for (const c of arr) out.add(c);
      }
  }

  private tmp = new Set<Collider>();

  /** Move a circle from (x,z) by (dx,dz), sliding along obstacles. */
  move(x: number, z: number, dx: number, dz: number, r: number): { x: number; z: number; hit: boolean } {
    let nx = x + dx,
      nz = z + dz;
    let hit = false;
    // blockers: try axis-separated slide
    if (this.blockers.length && this.isBlocked(nx, nz)) {
      hit = true;
      if (!this.isBlocked(x + dx, z)) nz = z;
      else if (!this.isBlocked(x, z + dz)) nx = x;
      else {
        nx = x;
        nz = z;
      }
    }
    for (let iter = 0; iter < 3; iter++) {
      this.tmp.clear();
      this.nearby(nx, nz, r + 0.5, this.tmp);
      let moved = false;
      for (const c of this.tmp) {
        if (c.kind === "circle") {
          const ddx = nx - c.x,
            ddz = nz - c.z;
          const d = Math.hypot(ddx, ddz);
          const min = r + c.r;
          if (d < min) {
            const k = d > 1e-5 ? (min - d) / d : 1;
            nx += ddx * k;
            nz += ddz * k;
            moved = hit = true;
          }
        } else {
          const cx = Math.max(c.minX, Math.min(nx, c.maxX));
          const cz = Math.max(c.minZ, Math.min(nz, c.maxZ));
          const ddx = nx - cx,
            ddz = nz - cz;
          const d = Math.hypot(ddx, ddz);
          if (d < r) {
            if (d > 1e-5) {
              nx += (ddx / d) * (r - d);
              nz += (ddz / d) * (r - d);
            } else {
              // centre inside box: push out along shortest axis
              const pl = nx - c.minX,
                pr = c.maxX - nx,
                pd = nz - c.minZ,
                pu = c.maxZ - nz;
              const m = Math.min(pl, pr, pd, pu);
              if (m === pl) nx = c.minX - r;
              else if (m === pr) nx = c.maxX + r;
              else if (m === pd) nz = c.minZ - r;
              else nz = c.maxZ + r;
            }
            moved = hit = true;
          }
        }
      }
      if (!moved) break;
    }
    if (this.blockers.length && this.isBlocked(nx, nz)) {
      nx = x;
      nz = z;
      hit = true;
    }
    const b = this.bounds;
    nx = Math.max(b.minX + r, Math.min(b.maxX - r, nx));
    nz = Math.max(b.minZ + r, Math.min(b.maxZ - r, nz));
    return { x: nx, z: nz, hit };
  }

  isBlocked(x: number, z: number) {
    for (const b of this.blockers) if (b(x, z)) return true;
    return false;
  }

  /** Is a circle at (x,z) free of obstacles? */
  free(x: number, z: number, r: number): boolean {
    if (this.isBlocked(x, z)) return false;
    const b = this.bounds;
    if (x < b.minX + r || x > b.maxX - r || z < b.minZ + r || z > b.maxZ - r) return false;
    this.tmp.clear();
    this.nearby(x, z, r + 0.5, this.tmp);
    for (const c of this.tmp) {
      if (c.kind === "circle") {
        if (Math.hypot(x - c.x, z - c.z) < r + c.r) return false;
      } else {
        const cx = Math.max(c.minX, Math.min(x, c.maxX));
        const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
        if (Math.hypot(x - cx, z - cz) < r) return false;
      }
    }
    return true;
  }

  get count() {
    return this.all.length;
  }
}
