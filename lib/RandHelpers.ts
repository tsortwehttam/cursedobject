function hashSeed(seed: string | number): number {
  const str = seed.toString();
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

export type PRNG = ReturnType<typeof createPRNG>;

export function createPRNG(seed: string | number, initialCycle: number = 0) {
  let state = hashSeed(seed) || 1;
  let cycle = 0;

  function next(): number {
    cycle++;
    let t = (state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  for (let i = 0; i < initialCycle; i++) {
    next();
  }

  function randAlphaNum(length: number): string {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(next() * chars.length));
    }
    return result;
  }

  function draw<T>(s: T[]): T {
    return shuffle(s)[0];
  }

  function coinToss(prob: number = 0.5): boolean {
    return next() < prob;
  }

  function dice(sides: number = 6): number {
    return getRandomInt(1, sides);
  }

  function rollMultipleDice(rolls: number, sides: number = 6): number[] {
    const results: number[] = [];
    for (let i = 0; i < rolls; i++) {
      results.push(dice(sides));
    }
    return results;
  }

  function randomElement<T>(arr: readonly T[]): T {
    return arr[Math.floor(next() * arr.length)];
  }

  function randomBoolean(): boolean {
    return next() < 0.5;
  }

  function getRandomFloat(min: number, max: number): number {
    return next() * (max - min) + min;
  }

  function getRandomInt(min: number, max: number): number {
    return Math.floor(next() * (max - min + 1)) + min;
  }

  function getRandomFloatNormal(min: number, max: number): number {
    const u1 = next();
    const u2 = next();
    const standardNormal =
      Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const mean = (max + min) / 2;
    const stdDev = (max - min) / 6;
    return standardNormal * stdDev + mean;
  }

  function getRandomIntNormal(min: number, max: number): number {
    const floatNormal = getRandomFloatNormal(min, max);
    return Math.round(floatNormal);
  }

  function weightedRandomKey<T>(obj: { [T: string]: number }): T {
    const keys = Object.keys(obj);
    const total = keys.reduce((sum, k) => sum + obj[k], 0);
    let r = next() * total;
    for (const k of keys) {
      r -= obj[k];
      if (r <= 0) return k as T;
    }
    return keys[0] as T;
  }

  function shuffle<T>(array: readonly T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function getCycle(): number {
    return cycle;
  }

  return {
    next,
    randAlphaNum,
    draw,
    coinToss,
    dice,
    rollMultipleDice,
    randomElement,
    randomBoolean,
    getRandomFloat,
    getRandomInt,
    getRandomFloatNormal,
    getRandomIntNormal,
    weightedRandomKey,
    shuffle,
    getCycle,
  };
}
