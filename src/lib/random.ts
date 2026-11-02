// Deterministic PRNG (mulberry32) so seeded mock data is identical on every run.
export function createRng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min; // inclusive
  const float = (min: number, max: number) => next() * (max - min) + min;
  const chance = (p: number) => next() < p;
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)];
  const weighted = <T,>(items: readonly T[], weight: (t: T) => number): T => {
    const total = items.reduce((s, i) => s + weight(i), 0);
    let r = next() * total;
    for (const i of items) {
      r -= weight(i);
      if (r < 0) return i;
    }
    return items[items.length - 1];
  };
  const shuffle = <T,>(arr: T[]): T[] => {
    const a2 = [...arr];
    for (let i = a2.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [a2[i], a2[j]] = [a2[j], a2[i]];
    }
    return a2;
  };
  return { next, int, float, chance, pick, weighted, shuffle };
}
export type Rng = ReturnType<typeof createRng>;
