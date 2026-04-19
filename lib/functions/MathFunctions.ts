import { Method, num, P } from "./FunctionHelpers";

function clampMethod(v: P, min: P, max: P): number {
  return Math.max(num(min), Math.min(num(max), num(v)));
}

function avgMethod(...args: P[]): number {
  if (!args.length) return 0;
  return args.reduce<number>((s, x) => s + num(x), 0) / args.length;
}

function gcdMethod(a: P, b: P): number {
  let x = Math.abs(num(a));
  let y = Math.abs(num(b));
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

function factorialMethod(n: P): number {
  const v = Math.floor(num(n));
  if (v < 0) return NaN;
  if (v === 0 || v === 1) return 1;
  let result = 1;
  for (let i = 2; i <= v; i++) result *= i;
  return result;
}

function varianceMethod(...args: P[]): number {
  if (!args.length) return 0;
  const mean = avgMethod(...args);
  return (
    args.reduce<number>((s, x) => {
      const d = num(x) - mean;
      return s + d * d;
    }, 0) / args.length
  );
}

export const mathFunctions: Record<string, Method> = {
  /**
   * Returns number clamped within the given min and max range.
   * @name clamp
   * @returns Number clamped within the given min and max range.
   * @example clamp(10, 0, 5) //=> 5
   */
  clamp: clampMethod,
  /**
   * Returns the average of the given numbers.
   * @name getAvg
   * @returns The average of the given numbers.
   * @example getAvg(1, 2, 3) //=> 2
   */
  getAvg: avgMethod,
  /**
   * Returns the average of the given numbers.
   * @name getAverage
   * @returns The average of the given numbers.
   * @example getAverage(1, 2, 3) //=> 2
   */
  getAverage: avgMethod,
  /**
   * Returns the greatest common divisor of two numbers.
   * @name getGcd
   * @returns The greatest common divisor of two numbers.
   * @example getGcd(12, 18) //=> 6
   */
  getGcd: gcdMethod,
  /**
   * Returns the least common multiple of two numbers.
   * @name getLcm
   * @param a First value.
   * @param b Second value.
   * @returns The least common multiple of two numbers.
   * @example getLcm(6, 8) //=> 24
   */
  getLcm: (a: P, b: P) => {
    const na = num(a);
    const nb = num(b);
    return Math.abs(na * nb) / gcdMethod(na, nb);
  },
  /**
   * Returns the factorial of a number.
   * @name getFactorial
   * @returns The factorial of a number.
   * @example getFactorial(5) //=> 120
   */
  getFactorial: factorialMethod,
  /**
   * Returns the number of combinations (n choose r).
   * @name getNCr
   * @param n Count.
   * @param r Count.
   * @returns The number of combinations (n choose r).
   * @example getNCr(5, 2) //=> 10
   */
  getNCr: (n: P, r: P) => {
    const nn = Math.floor(num(n));
    const rr = Math.floor(num(r));
    if (rr > nn || rr < 0) return 0;
    return factorialMethod(nn) / (factorialMethod(rr) * factorialMethod(nn - rr));
  },
  /**
   * Returns the number of permutations (n permute r).
   * @name getNPr
   * @param n Count.
   * @param r Count.
   * @returns The number of permutations (n permute r).
   * @example getNPr(5, 2) //=> 20
   */
  getNPr: (n: P, r: P) => {
    const nn = Math.floor(num(n));
    const rr = Math.floor(num(r));
    if (rr > nn || rr < 0) return 0;
    return factorialMethod(nn) / factorialMethod(nn - rr);
  },
  /**
   * Converts degrees to radians.
   * @name getDegToRad
   * @param deg Degrees.
   * @returns Converted value.
   * @example getDegToRad(180) //=> 3.141592653589793
   */
  getDegToRad: (deg: P) => num(deg) * (Math.PI / 180),
  /**
   * Converts radians to degrees.
   * @name getRadToDeg
   * @param rad Radians.
   * @returns Converted value.
   * @example getRadToDeg(3.141592653589793) //=> 180
   */
  getRadToDeg: (rad: P) => num(rad) * (180 / Math.PI),
  /**
   * Linearly interpolates between two values.
   * @name getLerp
   * @param a First value.
   * @param b Second value.
   * @param t Time value.
   * @returns Result.
   * @example getLerp(0, 10, 0.5) //=> 5
   */
  getLerp: (a: P, b: P, t: P) => {
    const na = num(a);
    const nb = num(b);
    const nt = num(t);
    return na + (nb - na) * nt;
  },
  /**
   * Returns the interpolation factor for a value between two bounds.
   * @name getInverseLerp
   * @param a First value.
   * @param b Second value.
   * @param v Value.
   * @returns The interpolation factor for a value between two bounds.
   * @example getInverseLerp(0, 10, 5) //=> 0.5
   */
  getInverseLerp: (a: P, b: P, v: P) => {
    const na = num(a);
    const nb = num(b);
    const nv = num(v);
    return (nv - na) / (nb - na);
  },
  /**
   * Smooth interpolation with an ease-in-out curve.
   * @name getSmoothstep
   * @param edge0 Lower edge.
   * @param edge1 Upper edge.
   * @param x X value.
   * @returns Result.
   * @example getSmoothstep(0, 1, 0.5) //=> 0.5
   */
  getSmoothstep: (edge0: P, edge1: P, x: P) => {
    const t = clampMethod((num(x) - num(edge0)) / (num(edge1) - num(edge0)), 0, 1);
    return t * t * (3 - 2 * t);
  },
  /**
   * Returns 0 if x < edge, otherwise 1.
   * @name getStep
   * @param edge Edge value.
   * @param x X value.
   * @returns 0 if x < edge, otherwise 1.
   * @example getStep(0.5, 0.3) //=> 0
   */
  getStep: (edge: P, x: P) => (num(x) < num(edge) ? 0 : 1),
  /**
   * Returns the fractional part of a number.
   * @name getFract
   * @param v Value.
   * @returns The fractional part of a number.
   * @example getFract(2.5) //=> 0.5
   */
  getFract: (v: P) => {
    const n = num(v);
    return n - Math.floor(n);
  },
  /**
   * Returns true if the number is prime.
   * @name isPrime
   * @param n Count.
   * @returns True if the number is prime.
   * @example isPrime(7) //=> true
   */
  isPrime: (n: P) => {
    const v = Math.floor(num(n));
    if (v <= 1) return false;
    if (v <= 3) return true;
    if (v % 2 === 0 || v % 3 === 0) return false;
    for (let i = 5; i * i <= v; i += 6) {
      if (v % i === 0 || v % (i + 2) === 0) return false;
    }
    return true;
  },
  /**
   * Returns the variance of the given numbers.
   * @name getVariance
   * @returns The variance of the given numbers.
   * @example getVariance(1, 2, 3) //=> 0.6666666666666666
   */
  getVariance: varianceMethod,
  /**
   * Returns the standard deviation of the given numbers.
   * @name getStdDev
   * @param args Additional values.
   * @returns The standard deviation of the given numbers.
   * @example getStdDev(1, 2, 3, 4) //=> 1.118033988749895
   */
  getStdDev: (...args: P[]) => Math.sqrt(varianceMethod(...args)),
  /**
   * Returns the standard deviation of the given numbers.
   * @name getStandardDeviation
   * @param args Additional values.
   * @returns The standard deviation of the given numbers.
   * @example getStandardDeviation(1, 2, 3, 4) //=> 1.118033988749895
   */
  getStandardDeviation: (...args: P[]) => Math.sqrt(varianceMethod(...args)),
  /**
   * Returns the Euclidean distance between two points.
   * @name getDistance
   * @param x1 First X value.
   * @param y1 First Y value.
   * @param x2 Second X value.
   * @param y2 Second Y value.
   * @returns The Euclidean distance between two points.
   * @example getDistance(0, 0, 3, 4) //=> 5
   */
  getDistance: (x1: P, y1: P, x2: P, y2: P) => Math.hypot(num(x2) - num(x1), num(y2) - num(y1)),
  /**
   * Returns the Manhattan distance between two points.
   * @name getManhattan
   * @param x1 First X value.
   * @param y1 First Y value.
   * @param x2 Second X value.
   * @param y2 Second Y value.
   * @returns The Manhattan distance between two points.
   * @example getManhattan(0, 0, 3, 4) //=> 7
   */
  getManhattan: (x1: P, y1: P, x2: P, y2: P) => Math.abs(num(x2) - num(x1)) + Math.abs(num(y2) - num(y1)),
  /**
   * Normalizes a value to a 0-1 range.
   * @name getNormalize
   * @param v Value.
   * @param min Minimum value.
   * @param max Maximum value.
   * @returns Result.
   * @example getNormalize(5, 0, 10) //=> 0.5
   */
  getNormalize: (v: P, min: P, max: P) => (num(v) - num(min)) / (num(max) - num(min)),
  /**
   * Converts a normalized value back to the original range.
   * @name getDenormalize
   * @param v Value.
   * @param min Minimum value.
   * @param max Maximum value.
   * @returns Converted value.
   * @example getDenormalize(0.5, 0, 10) //=> 5
   */
  getDenormalize: (v: P, min: P, max: P) => num(v) * (num(max) - num(min)) + num(min),
  /**
   * Rounds a number to the specified precision.
   * @name getRoundTo
   * @param v Value.
   * @param precision Value.
   * @returns Result.
   * @example getRoundTo(3.14159, 2) //=> 3.14
   */
  getRoundTo: (v: P, precision: P) => {
    const p = Math.pow(10, num(precision));
    return Math.round(num(v) * p) / p;
  },
  /**
   * Floors a number to the specified precision.
   * @name getFloorTo
   * @param v Value.
   * @param precision Value.
   * @returns Result.
   * @example getFloorTo(3.14159, 2) //=> 3.14
   */
  getFloorTo: (v: P, precision: P) => {
    const p = Math.pow(10, num(precision));
    return Math.floor(num(v) * p) / p;
  },
  /**
   * Ceils a number to the specified precision.
   * @name getCeilTo
   * @param v Value.
   * @param precision Value.
   * @returns Result.
   * @example getCeilTo(3.14159, 2) //=> 3.15
   */
  getCeilTo: (v: P, precision: P) => {
    const p = Math.pow(10, num(precision));
    return Math.ceil(num(v) * p) / p;
  },
  /**
   * Increments a number by the specified amount.
   * @name numIncr
   * @param v Value.
   * @param by Value.
   * @returns Result.
   * @example numIncr(5, 2) //=> 7
   */
  numIncr: (v: P, by?: P) => num(v) + num(by ?? 1),
  /**
   * Decrements a number by the specified amount.
   * @name numDecr
   * @param v Value.
   * @param by Value.
   * @returns Result.
   * @example numDecr(5, 2) //=> 3
   */
  numDecr: (v: P, by?: P) => num(v) - num(by ?? 1),
  /**
   * Wraps a value within the specified range.
   * @name numWrap
   * @param v Value.
   * @param min Minimum value.
   * @param max Maximum value.
   * @returns Result.
   * @example numWrap(7, 0, 5) //=> 2
   */
  numWrap: (v: P, min: P, max: P) => {
    const nv = num(v);
    const nmin = num(min);
    const nmax = num(max);
    const range = nmax - nmin;
    if (range <= 0) return nmin;
    let result = nv - nmin;
    result = ((result % range) + range) % range;
    return result + nmin;
  },
  /**
   * Moves a value toward a target by a fixed step.
   * @name getApproach
   * @param current Current value.
   * @param target Target value.
   * @param step Step size.
   * @returns Result.
   * @example getApproach(0, 10, 3) //=> 3
   */
  getApproach: (current: P, target: P, step: P) => {
    const c = num(current);
    const t = num(target);
    const s = Math.abs(num(step));
    if (c < t) return Math.min(c + s, t);
    if (c > t) return Math.max(c - s, t);
    return c;
  },
  /**
   * Moves a value toward a target with a maximum delta.
   * @name getMoveToward
   * @param current Current value.
   * @param target Target value.
   * @param maxDelta Maximum delta.
   * @returns Result.
   * @example getMoveToward(0, 10, 3) //=> 3
   */
  getMoveToward: (current: P, target: P, maxDelta: P) => {
    const c = num(current);
    const t = num(target);
    const d = num(maxDelta);
    if (Math.abs(t - c) <= d) return t;
    return c + Math.sign(t - c) * d;
  },
  /**
   * Creates a ping-pong pattern that bounces between 0 and length.
   * @name getPingPong
   * @param t Time value.
   * @param length Length.
   * @returns Created value.
   * @example getPingPong(7, 5) //=> 3
   */
  getPingPong: (t: P, length: P) => {
    const time = num(t);
    const len = num(length);
    if (len <= 0) return 0;
    const cycles = Math.floor(time / len);
    const phase = time % len;
    return cycles % 2 === 0 ? phase : len - phase;
  },
  /**
   * Repeats a value within the specified length.
   * @name getRepeat
   * @param t Time value.
   * @param length Length.
   * @returns Result.
   * @example getRepeat(7, 5) //=> 2
   */
  getRepeat: (t: P, length: P) => {
    const time = num(t);
    const len = num(length);
    if (len <= 0) return 0;
    return time - Math.floor(time / len) * len;
  },
  /**
   * Quantizes a value to the nearest step increment.
   * @name getQuantize
   * @param v Value.
   * @param step Step size.
   * @returns Result.
   * @example getQuantize(5.3, 0.5) //=> 5.5
   */
  getQuantize: (v: P, step: P) => {
    const value = num(v);
    const s = num(step);
    if (s <= 0) return value;
    return Math.round(value / s) * s;
  },
  /**
   * Generates a sine wave oscillation.
   * @name getOscSine
   * @param t Time value.
   * @param frequency Frequency.
   * @param amplitude Amplitude.
   * @param phase Phase offset.
   * @returns Generated value.
   * @example getOscSine(0) //=> 0
   */
  getOscSine: (t: P, frequency?: P, amplitude?: P, phase?: P) => {
    const time = num(t);
    const freq = num(frequency ?? 1);
    const amp = num(amplitude ?? 1);
    const ph = num(phase ?? 0);
    return Math.sin((time * freq + ph) * 2 * Math.PI) * amp;
  },
  /**
   * Generates a triangle wave oscillation.
   * @name getOscTriangle
   * @param t Time value.
   * @param frequency Frequency.
   * @param amplitude Amplitude.
   * @param phase Phase offset.
   * @returns Generated value.
   * @example getOscTriangle(0) //=> -1
   */
  getOscTriangle: (t: P, frequency?: P, amplitude?: P, phase?: P) => {
    const time = num(t);
    const freq = num(frequency ?? 1);
    const amp = num(amplitude ?? 1);
    const ph = num(phase ?? 0);
    const period = 1 / freq;
    const t2 = (time + ph) % period;
    const halfPeriod = period / 2;
    if (t2 < halfPeriod) {
      return ((t2 / halfPeriod) * 2 - 1) * amp;
    } else {
      return ((1 - (t2 - halfPeriod) / halfPeriod) * 2 - 1) * amp;
    }
  },
  /**
   * Generates a square wave oscillation.
   * @name getOscSquare
   * @param t Time value.
   * @param frequency Frequency.
   * @param amplitude Amplitude.
   * @param phase Phase offset.
   * @returns Generated value.
   * @example getOscSquare(0) //=> 1
   */
  getOscSquare: (t: P, frequency?: P, amplitude?: P, phase?: P) => {
    const time = num(t);
    const freq = num(frequency ?? 1);
    const amp = num(amplitude ?? 1);
    const ph = num(phase ?? 0);
    const period = 1 / freq;
    const t2 = (time + ph) % period;
    return t2 < period / 2 ? amp : -amp;
  },
  /**
   * Generates a sawtooth wave oscillation.
   * @name getOscSawtooth
   * @param t Time value.
   * @param frequency Frequency.
   * @param amplitude Amplitude.
   * @param phase Phase offset.
   * @returns Generated value.
   * @example getOscSawtooth(0) //=> -1
   */
  getOscSawtooth: (t: P, frequency?: P, amplitude?: P, phase?: P) => {
    const time = num(t);
    const freq = num(frequency ?? 1);
    const amp = num(amplitude ?? 1);
    const ph = num(phase ?? 0);
    const period = 1 / freq;
    const t2 = (time + ph) % period;
    return ((t2 / period) * 2 - 1) * amp;
  },
  /**
   * Applies exponential decay to a value.
   * @name getDecay
   * @param current Current value.
   * @param rate Rate.
   * @param deltaTime Delta time.
   * @returns Result.
   * @example getDecay(10, 0.1, 1) //=> 9
   */
  getDecay: (current: P, rate: P, deltaTime: P) => {
    const c = num(current);
    const r = num(rate);
    const dt = num(deltaTime);
    return c * Math.pow(1 - r, dt);
  },
  /**
   * Applies exponential decay toward a target value.
   * @name getDecayToward
   * @param current Current value.
   * @param target Target value.
   * @param rate Rate.
   * @param deltaTime Delta time.
   * @returns Result.
   * @example getDecayToward(10, 0, 0.1, 1) //=> 9
   */
  getDecayToward: (current: P, target: P, rate: P, deltaTime: P) => {
    const c = num(current);
    const t = num(target);
    const r = num(rate);
    const dt = num(deltaTime);
    return t + (c - t) * Math.pow(1 - r, dt);
  },
  /**
   * Returns the absolute value.
   * @name calcAbs
   * @param v Value.
   * @returns The absolute value.
   * @example calcAbs(-5) //=> 5
   */
  calcAbs: (v: P) => Math.abs(num(v)),
  /**
   * Returns the arccosine in radians.
   * @name calcAcos
   * @param v Value.
   * @returns The arccosine in radians.
   * @example calcAcos(1) //=> 0
   */
  calcAcos: (v: P) => Math.acos(num(v)),
  /**
   * Returns the hyperbolic arccosine.
   * @name calcAcosh
   * @param v Value.
   * @returns The hyperbolic arccosine.
   * @example calcAcosh(1) //=> 0
   */
  calcAcosh: (v: P) => Math.acosh(num(v)),
  /**
   * Returns the arcsine in radians.
   * @name calcAsin
   * @param v Value.
   * @returns The arcsine in radians.
   * @example calcAsin(0) //=> 0
   */
  calcAsin: (v: P) => Math.asin(num(v)),
  /**
   * Returns the hyperbolic arcsine.
   * @name calcAsinh
   * @param v Value.
   * @returns The hyperbolic arcsine.
   * @example calcAsinh(0) //=> 0
   */
  calcAsinh: (v: P) => Math.asinh(num(v)),
  /**
   * Returns the arctangent in radians.
   * @name calcAtan
   * @param v Value.
   * @returns The arctangent in radians.
   * @example calcAtan(0) //=> 0
   */
  calcAtan: (v: P) => Math.atan(num(v)),
  /**
   * Returns the arctangent of y/x.
   * @name calcAtan2
   * @param y Y value.
   * @param x X value.
   * @returns The arctangent of y/x.
   * @example calcAtan2(0, 1) //=> 0
   */
  calcAtan2: (y: P, x: P) => Math.atan2(num(y), num(x)),
  /**
   * Returns the hyperbolic arctangent.
   * @name calcAtanh
   * @param v Value.
   * @returns The hyperbolic arctangent.
   * @example calcAtanh(0) //=> 0
   */
  calcAtanh: (v: P) => Math.atanh(num(v)),
  /**
   * Returns the cube root.
   * @name calcCbrt
   * @param v Value.
   * @returns The cube root.
   * @example calcCbrt(27) //=> 3
   */
  calcCbrt: (v: P) => Math.cbrt(num(v)),
  /**
   * Returns the smallest integer greater than or equal to value.
   * @name calcCeil
   * @param v Value.
   * @returns The smallest integer greater than or equal to value.
   * @example calcCeil(3.2) //=> 4
   */
  calcCeil: (v: P) => Math.ceil(num(v)),
  /**
   * Returns the count of leading zero bits in the 32-bit integer.
   * @name calcClz32
   * @param v Value.
   * @returns The count of leading zero bits in the 32-bit integer.
   * @example calcClz32(1) //=> 31
   */
  calcClz32: (v: P) => Math.clz32(num(v)),
  /**
   * Returns the cosine in radians.
   * @name calcCos
   * @param v Value.
   * @returns The cosine in radians.
   * @example calcCos(0) //=> 1
   */
  calcCos: (v: P) => Math.cos(num(v)),
  /**
   * Returns the hyperbolic cosine.
   * @name calcCosh
   * @param v Value.
   * @returns The hyperbolic cosine.
   * @example calcCosh(0) //=> 1
   */
  calcCosh: (v: P) => Math.cosh(num(v)),
  /**
   * Returns e to the given power.
   * @name calcExp
   * @param v Value.
   * @returns E to the given power.
   * @example calcExp(0) //=> 1
   */
  calcExp: (v: P) => Math.exp(num(v)),
  /**
   * Returns e to the given power minus 1.
   * @name calcExpm1
   * @param v Value.
   * @returns E to the given power minus 1.
   * @example calcExpm1(0) //=> 0
   */
  calcExpm1: (v: P) => Math.expm1(num(v)),
  /**
   * Returns the largest integer less than or equal to value.
   * @name calcFloor
   * @param v Value.
   * @returns The largest integer less than or equal to value.
   * @example calcFloor(3.9) //=> 3
   */
  calcFloor: (v: P) => Math.floor(num(v)),
  /**
   * Returns the nearest 32-bit float representation.
   * @name calcFround
   * @param v Value.
   * @returns The nearest 32-bit float representation.
   * @example calcFround(1.5) //=> 1.5
   */
  calcFround: (v: P) => Math.fround(num(v)),
  /**
   * Returns the square root of the sum of squares.
   * @name calcHypot
   * @param args Additional values.
   * @returns The square root of the sum of squares.
   * @example calcHypot(3, 4) //=> 5
   */
  calcHypot: (...args: P[]) => Math.hypot(...args.map(num)),
  /**
   * Returns the 32-bit integer multiplication result.
   * @name calcImul
   * @param a First value.
   * @param b Second value.
   * @returns The 32-bit integer multiplication result.
   * @example calcImul(2, 3) //=> 6
   */
  calcImul: (a: P, b: P) => Math.imul(num(a), num(b)),
  /**
   * Returns the natural logarithm.
   * @name calcLog
   * @param v Value.
   * @returns The natural logarithm.
   * @example calcLog(1) //=> 0
   */
  calcLog: (v: P) => Math.log(num(v)),
  /**
   * Returns the natural log of 1 + value.
   * @name calcLog1p
   * @param v Value.
   * @returns The natural log of 1 + value.
   * @example calcLog1p(0) //=> 0
   */
  calcLog1p: (v: P) => Math.log1p(num(v)),
  /**
   * Returns the base-10 logarithm.
   * @name calcLog10
   * @param v Value.
   * @returns The base-10 logarithm.
   * @example calcLog10(1000) //=> 3
   */
  calcLog10: (v: P) => Math.log10(num(v)),
  /**
   * Returns the base-2 logarithm.
   * @name calcLog2
   * @param v Value.
   * @returns The base-2 logarithm.
   * @example calcLog2(8) //=> 3
   */
  calcLog2: (v: P) => Math.log2(num(v)),
  /**
   * Returns the maximum value from the arguments.
   * @name calcMax
   * @param args Additional values.
   * @returns The maximum value from the arguments.
   * @example calcMax(1, 5, 2) //=> 5
   */
  calcMax: (...args: P[]) => Math.max(...args.map(num)),
  /**
   * Returns the minimum value from the arguments.
   * @name calcMin
   * @param args Additional values.
   * @returns The minimum value from the arguments.
   * @example calcMin(1, 5, 2) //=> 1
   */
  calcMin: (...args: P[]) => Math.min(...args.map(num)),
  /**
   * Returns base raised to exp.
   * @name calcPow
   * @param base Base value.
   * @param exp Exponent.
   * @returns Base raised to exp.
   * @example calcPow(2, 3) //=> 8
   */
  calcPow: (base: P, exp: P) => Math.pow(num(base), num(exp)),
  /**
   * Returns a random number between 0 and 1.
   * @name calcRandom
   * @returns A random number between 0 and 1.
   * @example calcRandom() //=> 0.123...
   */
  calcRandom: () => Math.random(),
  /**
   * Returns the nearest integer.
   * @name calcRound
   * @param v Value.
   * @returns The nearest integer.
   * @example calcRound(2.5) //=> 3
   */
  calcRound: (v: P) => Math.round(num(v)),
  /**
   * Returns the sign of the number.
   * @name calcSign
   * @param v Value.
   * @returns The sign of the number.
   * @example calcSign(-5) //=> -1
   */
  calcSign: (v: P) => Math.sign(num(v)),
  /**
   * Returns the sine in radians.
   * @name calcSin
   * @param v Value.
   * @returns The sine in radians.
   * @example calcSin(0) //=> 0
   */
  calcSin: (v: P) => Math.sin(num(v)),
  /**
   * Returns the hyperbolic sine.
   * @name calcSinh
   * @param v Value.
   * @returns The hyperbolic sine.
   * @example calcSinh(0) //=> 0
   */
  calcSinh: (v: P) => Math.sinh(num(v)),
  /**
   * Returns the square root.
   * @name calcSqrt
   * @param v Value.
   * @returns The square root.
   * @example calcSqrt(9) //=> 3
   */
  calcSqrt: (v: P) => Math.sqrt(num(v)),
  /**
   * Returns the tangent in radians.
   * @name calcTan
   * @param v Value.
   * @returns The tangent in radians.
   * @example calcTan(0) //=> 0
   */
  calcTan: (v: P) => Math.tan(num(v)),
  /**
   * Returns the hyperbolic tangent.
   * @name calcTanh
   * @param v Value.
   * @returns The hyperbolic tangent.
   * @example calcTanh(0) //=> 0
   */
  calcTanh: (v: P) => Math.tanh(num(v)),
  /**
   * Returns the integer part of a number.
   * @name calcTrunc
   * @param v Value.
   * @returns The integer part of a number.
   * @example calcTrunc(3.9) //=> 3
   */
  calcTrunc: (v: P) => Math.trunc(num(v)),
};
