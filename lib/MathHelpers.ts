export function clamp(n: number, min: number = 0, max: number = 1) {
  if (n < min) {
    return min;
  }
  if (n > max) {
    return max;
  }
  return n;
}

export function pcToValue(pc: number, min: number, max: number): number {
  // Convert a percentage (0..1) to a value in the range [min, max].
  if (min === max) return min; // Avoid division by zero
  return min + pc * (max - min);
}

export function norm(x: number, min: number, max: number): number {
  // Normalize x to the range [0, 1] based on min and max.
  if (min === max) return 0; // Avoid division by zero
  return (x - min) / (max - min);
}

export const sum = (numbers: number[]): number =>
  numbers.reduce((acc, curr) => acc + curr, 0);

export const avg = (numbers: number[]): number => {
  if (numbers.length === 0) return 0;
  return sum(numbers) / numbers.length;
};

export function prec(v: number, p: number = 100) {
  return Math.round(v * p) / p;
}

export function modArr<T>(a: T[], i: number) {
  return a[i % a.length];
}

export function roundToNearest(value: number, multiple: number): number {
  if (multiple <= 0) {
    return value;
  }
  return Math.round(value / multiple) * multiple;
}

export function toInt(value: string): number {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function parseNumberOrNull(value: string): number | null {
  const parsed = Number(value);
  if (
    typeof parsed !== "number" ||
    Number.isNaN(parsed) ||
    !Number.isFinite(parsed)
  ) {
    return null;
  }
  return parsed;
}

export const stringToHash32 = (s: string): number => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash;
};

export const stringToHash64 = (s: string): bigint => {
  let hash = 0xcbf29ce484222325n; // FNV offset basis (64-bit)
  const prime = 0x100000001b3n; // FNV prime (64-bit)
  for (let i = 0; i < s.length; i++) {
    hash ^= BigInt(s.charCodeAt(i));
    hash = (hash * prime) & 0xffffffffffffffffn; // mask to 64 bits
  }
  return hash;
};

export const hash32 = (x: number): number => {
  x = ((x >>> 16) ^ x) * 0x45d9f3b;
  x = ((x >>> 16) ^ x) * 0x45d9f3b;
  return (x >>> 16) ^ x;
};

export const offset32tri = (pid: number): number => {
  const h = hash32(pid);
  const v = (h & 7) - ((h >>> 3) & 7); // −7…7 triangular-ish
  return Math.max(-6, Math.min(6, v));
};

export function ceilToNearest(value: number, multiple: number): number {
  if (multiple <= 0) {
    return value;
  }
  return Math.ceil(value / multiple) * multiple;
}

export function floorToNearest(value: number, multiple: number): number {
  if (multiple <= 0) {
    return value;
  }
  return Math.floor(value / multiple) * multiple;
}

export function bellCurve(
  x: number,
  min: number,
  max: number,
  steepness: number = 1
): number {
  // Clamp x to [-1, 1]
  const clampedX = Math.max(-1, Math.min(1, x));
  // Map [-1, 1] to a normal-like curve using a polynomial approximation
  // The "steepness" controls the spread: higher = more peaked
  const s = Math.max(0.01, Math.min(10, steepness));
  // Bell curve: center at 0, falloff controlled by steepness
  const bell = Math.exp(-0.5 * Math.pow(clampedX * s, 2));
  // Normalize bell to [0,1]
  const normalized =
    (bell - Math.exp(-0.5 * Math.pow(s, 2))) /
    (1 - Math.exp(-0.5 * Math.pow(s, 2)));
  // Map to [min, max]
  const val = Math.round(min + normalized * (max - min));
  return Math.max(min, Math.min(max, val));
}

export function mortalityCurve(
  x: number,
  min: number,
  max: number,
  skew: number = 2
): number {
  // Clamp x to [-1, 1]
  const clampedX = Math.max(-1, Math.min(1, x));
  // Map [-1,1] to [0,1]
  const t = (clampedX + 1) / 2;
  // Mortality curve: high at t=0, low in middle, high at t=1
  // Use a sum of two logistic functions for "U" shape
  const k = Math.max(0.01, Math.min(10, skew));
  const left = 1 / (1 + Math.exp((t - 0.15) * 10 * k));
  const right = 1 / (1 + Math.exp((-t + 0.85) * 10 * k));
  // Normalize to [0,1]
  const mortality = (left + right - 1) / (1 + right - 1);
  // Map to [min, max]
  const val = Math.round(min + mortality * (max - min));
  return Math.max(min, Math.min(max, val));
}
export function modInRange(value: number, min: number, max: number): number {
  const range = max - min;
  return ((((value - min) % range) + range) % range) + min;
}

export function midpoint(a: number, b: number): number {
  return a + (b - a) / 2;
}

export function midpointCirc(
  a: number,
  b: number,
  min: number,
  max: number
): number {
  // Wrap a and b around the range [min, max] and find the midpoint.
  const na = modInRange(a, min, max);
  const nb = modInRange(b, min, max);
  const range = max - min;
  let diff = nb - na;
  if (diff < 0) diff += range;
  if (diff > range / 2) {
    return modInRange(na - (range - diff) / 2, min, max);
  } else {
    return modInRange(na + diff / 2, min, max);
  }
}

export function midpointMod(
  a: number,
  b: number,
  min: number,
  max: number
): number {
  // Find the midpoint of a and b, then wrap it around the range [min, max].
  return modInRange(midpoint(a, b), min, max);
}

export function pcToKey<T extends string>(
  pc: number,
  ranges: Record<T, [number, number]>
): T {
  // Given pc between 0..1, selects a key from the ranges object based on the defined intervals.
  // The ranges object must define non-overlapping intervals [start, end] for each key.
  pc = clamp(pc, 0, 1);
  for (const key in ranges) {
    const [start, end] = ranges[key];
    if (pc >= start && pc < end) {
      return key;
    }
  }
  return Object.keys(ranges)[0] as T;
}

export function pcToElement<T>(pc: number, arr: T[]): T | null {
  // Given pc between 0..1, selects a value from the array T by mapping pc to the range of the array.
  const index = Math.floor(pc * arr.length);
  return arr[index % arr.length];
}

export function pickMod(i: number, l: number, r: number): number {
  return l + (i % (r - l));
}

export function sampleFromBellCurve(
  x: number,
  steepness: number = 2,
  center: number = 0.5
): number {
  x = clamp(x, 0, 1);
  // Use Box-Muller-like transformation for bell curve sampling
  if (x === 0.5) return center;
  // Map [0,1] to a normal-like distribution
  const u1 = x;
  const u2 = 0.5; // Fixed second value for simplicity
  // Box-Muller transformation (simplified)
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  // Scale and center
  const sample = center + z / (steepness * 4); // Adjust divisor to control spread
  return clamp(sample, 0, 1);
}

// Logarithmic distribution - favors lower values
export function sampleFromLog(
  x: number,
  base: number = Math.E,
  bias: number = 1
): number {
  x = clamp(x, 0.001, 1); // Avoid log(0)
  // Inverse of logarithmic CDF
  const sample = Math.pow(base, (x * Math.log(bias)) / Math.log(base)) - 1;
  return clamp(sample / bias, 0, 1);
}

// Exponential distribution - favors higher values
export function sampleFromExp(x: number, rate: number = 2): number {
  x = clamp(x, 0.001, 0.999);
  // Inverse exponential CDF: -ln(1-x) / rate
  const sample = -Math.log(1 - x) / rate;
  // Normalize to [0,1] range
  const maxVal = -Math.log(0.001) / rate;
  return clamp(sample / maxVal, 0, 1);
}

// Parabolic distribution - can be U-shaped or inverted-U
export function sampleFromParabolic(
  x: number,
  shape: number = 2,
  invert: boolean = false
): number {
  x = clamp(x, 0, 1);

  if (invert) {
    // Inverted parabola (higher values in middle)
    const sample = 1 - Math.pow(2 * Math.abs(x - 0.5), 1 / shape);
    return clamp(sample, 0, 1);
  } else {
    // Regular parabola (higher values at edges)
    if (x < 0.5) {
      return Math.pow(2 * x, shape) / 2;
    } else {
      return 1 - Math.pow(2 * (1 - x), shape) / 2;
    }
  }
}

// S-curve (sigmoid) distribution - smooth transition from low to high
export function sampleFromSCurve(
  x: number,
  steepness: number = 6,
  center: number = 0.5
): number {
  x = clamp(x, 0.001, 0.999);

  // Inverse sigmoid using logit function
  // Convert x to logit space, then apply sigmoid
  const logitX = Math.log(x / (1 - x));
  const shifted = logitX / steepness + Math.log(center / (1 - center));
  const sample = 1 / (1 + Math.exp(-shifted));

  return clamp(sample, 0, 1);
}

// Reverse S-curve - smooth transition from high to low
export function sampleFromReverseSCurve(
  x: number,
  steepness: number = 6,
  center: number = 0.5
): number {
  // Just invert the S-curve
  return 1 - sampleFromSCurve(x, steepness, 1 - center);
}

// Power law distribution - great for wealth, city sizes, etc.
export function sampleFromPowerLaw(x: number, alpha: number = 2): number {
  x = clamp(x, 0.001, 0.999);
  // Inverse power law CDF: (1-x)^(-1/(alpha-1))
  const sample = Math.pow(1 - x, -1 / (alpha - 1));
  // Normalize to [0,1]
  const maxVal = Math.pow(0.001, -1 / (alpha - 1));
  return clamp((sample - 1) / (maxVal - 1), 0, 1);
}

// Beta distribution - very flexible, can create many shapes
export function sampleFromBeta(
  x: number,
  alpha: number = 2,
  beta: number = 2
): number {
  x = clamp(x, 0.001, 0.999);

  // Approximate inverse beta using iterative method (simplified)
  // This is a rough approximation - true inverse beta is complex
  let guess = x;
  for (let i = 0; i < 3; i++) {
    const betaVal = Math.pow(guess, alpha - 1) * Math.pow(1 - guess, beta - 1);
    const error = x - betaVal;
    guess += error * 0.1; // Simple adjustment
    guess = clamp(guess, 0, 1);
  }

  return guess;
}

// Triangular distribution - linear ramp up then down (or vice versa)
export function sampleFromTriangular(x: number, peak: number = 0.5): number {
  x = clamp(x, 0, 1);
  peak = clamp(peak, 0, 1);

  if (peak === 0) {
    // Peak at left edge - purely decreasing
    return 1 - x;
  } else if (peak === 1) {
    // Peak at right edge - purely increasing
    return x;
  } else if (x <= peak) {
    // Rising part: from 0 to peak
    return Math.sqrt(x / peak);
  } else {
    // Falling part: from peak to 1
    return Math.sqrt((1 - x) / (1 - peak));
  }
}

// Bimodal distribution - two peaks
export function sampleFromBimodal(
  x: number,
  separation: number = 0.6,
  balance: number = 0.5
): number {
  x = clamp(x, 0, 1);
  separation = clamp(separation, 0.1, 1);
  balance = clamp(balance, 0, 1);

  // Split the input based on balance
  if (x < balance) {
    // First peak (centered around 0.25)
    const localX = x / balance;
    return sampleFromBellCurve(localX, 3, 0.5 - separation / 2);
  } else {
    // Second peak (centered around 0.75)
    const localX = (x - balance) / (1 - balance);
    return sampleFromBellCurve(localX, 3, 0.5 + separation / 2);
  }
}

// Uniform distribution - baseline (though technically just x)
export function sampleFromUniform(x: number): number {
  return clamp(x, 0, 1);
}

// Step/threshold distribution - sharp cutoffs
export function sampleFromStep(
  x: number,
  threshold: number = 0.5,
  lowValue: number = 0,
  highValue: number = 1
): number {
  x = clamp(x, 0, 1);
  threshold = clamp(threshold, 0, 1);
  return x < threshold ? lowValue : highValue;
}

// Sawtooth distribution - repeating linear pattern
export function sampleFromSawtooth(
  x: number,
  frequency: number = 1,
  ascending: boolean = true
): number {
  x = clamp(x, 0, 1);
  const phase = (x * frequency) % 1;
  return ascending ? phase : 1 - phase;
}

// Sine wave distribution - smooth oscillation
export function sampleFromSine(
  x: number,
  frequency: number = 1,
  phase: number = 0,
  amplitude: number = 0.5
): number {
  x = clamp(x, 0, 1);
  const wave = Math.sin(2 * Math.PI * frequency * x + phase);
  return clamp(0.5 + amplitude * wave, 0, 1);
}

// Gamma distribution - flexible skewed distribution
export function sampleFromGamma(
  x: number,
  shape: number = 2,
  scale: number = 1
): number {
  x = clamp(x, 0.001, 0.999);

  // Approximate inverse gamma using simple transformation
  // This is a rough approximation for shape > 1
  if (shape < 1) {
    // For shape < 1, use power transformation
    return Math.pow(x, 1 / shape) * scale;
  } else {
    // For shape >= 1, use log-based approximation
    const sample = (-Math.log(1 - x) * scale) / shape;
    return clamp(sample, 0, 1);
  }
}

// Weibull distribution - survival/reliability modeling
export function sampleFromWeibull(
  x: number,
  shape: number = 2,
  scale: number = 1
): number {
  x = clamp(x, 0.001, 0.999);
  // Inverse Weibull: scale * (-ln(1-x))^(1/shape)
  const sample = scale * Math.pow(-Math.log(1 - x), 1 / shape);
  // Normalize to [0,1]
  const maxVal = scale * Math.pow(-Math.log(0.001), 1 / shape);
  return clamp(sample / maxVal, 0, 1);
}

// Laplace (double exponential) - sharp peak with exponential tails
export function sampleFromLaplace(
  x: number,
  center: number = 0.5,
  scale: number = 0.2
): number {
  x = clamp(x, 0.001, 0.999);
  center = clamp(center, 0, 1);

  // Inverse Laplace distribution
  let sample;
  if (x < 0.5) {
    sample = center + scale * Math.log(2 * x);
  } else {
    sample = center - scale * Math.log(2 * (1 - x));
  }

  return clamp(sample, 0, 1);
}

// Cauchy distribution - heavy tails, good for outliers
export function sampleFromCauchy(
  x: number,
  center: number = 0.5,
  scale: number = 0.1
): number {
  x = clamp(x, 0.001, 0.999);
  center = clamp(center, 0, 1);

  // Inverse Cauchy: center + scale * tan(π(x - 0.5))
  const sample = center + scale * Math.tan(Math.PI * (x - 0.5));
  return clamp(sample, 0, 1);
}

// Custom spline - define your own curve with control points
export function sampleFromSpline(
  x: number,
  controlPoints: number[] = [0, 0.3, 0.7, 1]
): number {
  x = clamp(x, 0, 1);

  if (controlPoints.length < 2) return x;

  // Simple linear interpolation between control points
  const segments = controlPoints.length - 1;
  const segmentSize = 1 / segments;
  const segmentIndex = Math.min(Math.floor(x / segmentSize), segments - 1);
  const segmentX = (x - segmentIndex * segmentSize) / segmentSize;

  const y1 = controlPoints[segmentIndex];
  const y2 = controlPoints[segmentIndex + 1];

  return clamp(y1 + segmentX * (y2 - y1), 0, 1);
}

// Logistic distribution - similar to normal but with heavier tails
export function sampleFromLogistic(
  x: number,
  center: number = 0.5,
  scale: number = 0.1
): number {
  x = clamp(x, 0.001, 0.999);
  center = clamp(center, 0, 1);

  // Inverse logistic: center + scale * ln(x/(1-x))
  const sample = center + scale * Math.log(x / (1 - x));
  return clamp(sample, 0, 1);
}

// Quantile-based sampler - define exact percentiles
export function sampleFromQuantiles(
  x: number,
  quantiles: { percentile: number; value: number }[]
): number {
  x = clamp(x, 0, 1);

  // Sort quantiles by percentile
  const sorted = quantiles.sort((a, b) => a.percentile - b.percentile);

  // Find the two quantiles to interpolate between
  for (let i = 0; i < sorted.length - 1; i++) {
    const q1 = sorted[i];
    const q2 = sorted[i + 1];

    if (x >= q1.percentile && x <= q2.percentile) {
      const t = (x - q1.percentile) / (q2.percentile - q1.percentile);
      return clamp(q1.value + t * (q2.value - q1.value), 0, 1);
    }
  }

  // Edge cases
  if (x <= sorted[0].percentile) return sorted[0].value;
  return sorted[sorted.length - 1].value;
}
