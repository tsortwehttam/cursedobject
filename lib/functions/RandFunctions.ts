import { PRNG } from "../RandHelpers";
import { A, Method, num, P, toArr } from "./FunctionHelpers";

export const createRandFunctions = (prng: PRNG): Record<string, Method> => ({
  /**
   * Returns a float between 0 and 1 using the seeded PRNG.
   * @name getRandom
   * @returns A float between 0 and 1 using the seeded PRNG.
   * @example getRandom() //=> 0.23489210239
   */
  getRandom: () => prng.next(),
  /**
   * Returns a random integer between min and max (inclusive).
   * @name getRandInt
   * @param min Minimum value.
   * @param max Maximum value.
   * @returns A random integer between min and max (inclusive).
   * @example getRandInt(1, 10) //=> 7
   */
  getRandInt: (min: P, max: P) => prng.getRandomInt(num(min), num(max)),
  /**
   * Returns a random float between min and max.
   * @name getRandFloat
   * @param min Minimum value.
   * @param max Maximum value.
   * @returns A random float between min and max.
   * @example getRandFloat(1.0, 10.0) //=> 7.234
   */
  getRandFloat: (min: P, max: P) => prng.getRandomFloat(num(min), num(max)),
  /**
   * Returns a random float using a normal distribution between min and max.
   * @name getRandNormal
   * @param min Minimum value.
   * @param max Maximum value.
   * @returns A random float using a normal distribution between min and max.
   * @example getRandNormal(1.0, 10.0) //=> 5.123
   */
  getRandNormal: (min: P, max: P) => prng.getRandomFloatNormal(num(min), num(max)),
  /**
   * Returns a random integer using a normal distribution between min and max.
   * @name getRandIntNormal
   * @param min Minimum value.
   * @param max Maximum value.
   * @returns A random integer using a normal distribution between min and max.
   * @example getRandIntNormal(1, 10) //=> 6
   */
  getRandIntNormal: (min: P, max: P) => prng.getRandomIntNormal(num(min), num(max)),
  /**
   * Returns true/false based on probability (default 0.5).
   * @name getCoinToss
   * @param prob Value.
   * @returns True/false based on probability (default 0.
   * @example getCoinToss(0.7) //=> true
   */
  getCoinToss: (prob?: P) => prng.coinToss(prob == null ? 0.5 : num(prob)),
  /**
   * Returns a random element from the array.
   * @name getRandElement
   * @param arr Array.
   * @returns A random element from the array.
   * @example getRandElement([1, 2, 3]) //=> 2
   */
  getRandElement: (arr: A) => {
    const t = toArr(arr);
    return t.length ? prng.randomElement(t) : null;
  },
  /**
   * Rolls a die with the specified number of sides (default 6).
   * @name randDice
   * @param sides Side count.
   * @returns Result.
   * @example randDice(20) //=> 15
   */
  randDice: (sides?: P) => prng.dice(sides == null ? 6 : num(sides)),
  /**
   * Rolls multiple dice and returns an array of results.
   * @name randRollDice
   * @param rolls Roll count.
   * @param sides Side count.
   * @returns Result.
   * @example randRollDice(3, 6) //=> [4, 2, 6]
   */
  randRollDice: (rolls: P, sides?: P) => prng.rollMultipleDice(num(rolls), sides == null ? 6 : num(sides)),
  /**
   * Returns a shuffled copy of the array.
   * @name randShuffle
   * @param arr Array.
   * @returns A shuffled copy of the array.
   * @example randShuffle([1, 2, 3]) //=> [3, 1, 2]
   */
  randShuffle: (arr: A) => prng.shuffle(toArr(arr)),
  /**
   * Returns a random alphanumeric string of the specified length.
   * @name randAlphaNum
   * @param len Length.
   * @returns A random alphanumeric string of the specified length.
   * @example randAlphaNum(8) //=> "A7b9X2m1"
   */
  randAlphaNum: (len: P) => prng.randAlphaNum(num(len)),
  /**
   * Returns an index based on weighted probabilities.
   * @name randWeighted
   * @param weights Weights array.
   * @returns An index based on weighted probabilities.
   * @example randWeighted([0.1, 0.7, 0.2]) //=> 1
   */
  randWeighted: (weights: P[]) => {
    const w = toArr(weights);
    if (!w.length) return null;
    const obj: Record<string, number> = {};
    w.forEach((v, i) => {
      obj[i.toString()] = num(v ?? 0);
    });
    return Number(prng.weightedRandomKey(obj));
  },
  /**
   * Returns n random elements from the array without replacement.
   * @name randSample
   * @param arr Array.
   * @param n Count.
   * @returns N random elements from the array without replacement.
   * @example randSample([1, 2, 3, 4, 5], 3) //=> [2, 5, 1]
   */
  randSample: (arr: A, n: P) => {
    const t = toArr(arr);
    const size = Math.min(num(n), t.length);
    const shuffled = prng.shuffle(t);
    return shuffled.slice(0, size);
  },
  /**
   * Returns a random element from the array, with optional exclusion.
   * Exclusion accepts a single value or an array of values to skip.
   * Returns null if no candidates remain after exclusion.
   * @name randDraw
   * @param arr Array.
   * @param exclude Optional value or array of values to exclude.
   * @returns A random element from the filtered array, or null.
   * @example randDraw(['a','b','c'], 'a') //=> 'b'
   */
  randDraw: (arr: A, exclude?: A) => {
    const pool = toArr(arr);
    if (!pool.length) return null;
    const excludeSet = new Set((exclude == null ? [] : toArr(exclude)).map((v) => (v == null ? "" : String(v))));
    const filtered = pool.filter((v) => !excludeSet.has(v == null ? "" : String(v)));
    if (!filtered.length) return null;
    return prng.randomElement(filtered);
  },
  /**
   * Returns a random element from the array using parallel weights, with optional exclusion.
   * weights[i] is the weight of arr[i]. Missing/non-numeric weights treated as 0.
   * Returns null if no candidates remain after exclusion or all weights are zero.
   * @name randWeightedPick
   * @param arr Array of candidates.
   * @param weights Parallel array of weights.
   * @param exclude Optional value or array of values to exclude.
   * @returns A weighted-random element, or null.
   * @example randWeightedPick(['a','b','c'], [1,3,1]) //=> 'b' (most often)
   */
  randWeightedPick: (arr: A, weights: A, exclude?: A) => {
    const pool = toArr(arr);
    const w = toArr(weights);
    if (!pool.length) return null;
    const excludeSet = new Set((exclude == null ? [] : toArr(exclude)).map((v) => (v == null ? "" : String(v))));
    const obj: Record<string, number> = {};
    let total = 0;
    pool.forEach((v, i) => {
      if (excludeSet.has(v == null ? "" : String(v))) return;
      const weight = num(w[i] ?? 0);
      if (weight <= 0) return;
      obj[String(i)] = weight;
      total += weight;
    });
    if (total <= 0) return null;
    const idx = Number(prng.weightedRandomKey(obj));
    return pool[idx];
  },
});
