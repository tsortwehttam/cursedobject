import { A, cmp, eq, flatDeep, Method, num, P, toArr, uniq } from "./FunctionHelpers";

function arr(v: unknown): P[] {
  if (Array.isArray(v)) return v;
  if (v == null) return [];
  return toArr(v as A);
}

export const arrayFunctions: Record<string, Method> = {
  /**
   * Returns the array length.
   * @name arrayLength
   * @param v Value.
   * @returns The array length.
   * @example arrayLength([1,2,3]) //=> 3
   */
  arrayLength: (v: P) => toArr(v).length,
  /**
   * Creates an array from the given arguments.
   * @name arrayCreate
   * @param args Additional values.
   * @returns Created value.
   * @example arrayCreate(1, 2, 3) //=> [1, 2, 3]
   */
  arrayCreate: (...args: A[]) => {
    return args;
  },
  /**
   * Returns the first element of the array, or null if empty.
   * @name arrayFirst
   * @param a Array.
   * @returns The first element of the array, or null if empty.
   * @example arrayFirst([1,2,3]) //=> 1
   */
  arrayFirst: (a: A) => toArr(a)[0] ?? null,
  /**
   * Returns the last element of the array, or null if empty.
   * @name arrayLast
   * @param a Array.
   * @returns The last element of the array, or null if empty.
   * @example arrayLast([1,2,3]) //=> 3
   */
  arrayLast: (a: A) => {
    const t = toArr(a);
    return t[t.length - 1] ?? null;
  },
  /**
   * Returns the element at index n, or null if out of bounds.
   * @name arrayArrayNth
   * @param a Array.
   * @param i Index.
   * @returns The element at index n, or null if out of bounds.
   * @example arrayArrayNth([1,2,3], 1) //=> 2
   */
  arrayArrayNth: (a: A, i: P) => toArr(a)[num(i) | 0] ?? null,
  /**
   * Returns the first n elements of the array.
   * @name arrayArrayTake
   * @param a Array.
   * @param n Count.
   * @returns The first n elements of the array.
   * @example arrayArrayTake([1,2,3,4], 2) //=> [1,2]
   */
  arrayArrayTake: (a: A, n: P) => toArr(a).slice(0, num(n) | 0),
  /**
   * Returns the array with the first n elements removed.
   * @name arrayArrayDrop
   * @param a Array.
   * @param n Count.
   * @returns The array with the first n elements removed.
   * @example arrayArrayDrop([1,2,3,4], 2) //=> [3,4]
   */
  arrayArrayDrop: (a: A, n: P) => toArr(a).slice(num(n) | 0),
  /**
   * Returns a copy of the array sorted in descending order.
   * @name arraySortDesc
   * @param a Array.
   * @returns A copy of the array sorted in descending order.
   * @example arraySortDesc([3,1,2]) //=> [3,2,1]
   */
  arraySortDesc: (a: A) =>
    toArr(a)
      .slice()
      .sort((x, y) => -cmp(x, y)),
  /**
   * Returns the array with duplicate values removed.
   * @name arrayUniq
   * @param a Array.
   * @returns The array with duplicate values removed.
   * @example arrayUniq([1,2,2,3]) //=> [1,2,3]
   */
  arrayUniq: (a: A) => uniq(toArr(a)),
  /**
   * Returns the array flattened one level deep.
   * @name arrayFlatten
   * @param a Array.
   * @returns The array flattened one level deep.
   * @example arrayFlatten([1,[2,3],4]) //=> [1,2,3,4]
   */
  arrayFlatten: (a: A) => toArr(a).reduce<P[]>((r, v) => r.concat(Array.isArray(v) ? v : [v]), []),
  /**
   * Returns the array flattened to the specified depth.
   * @name arrayFlattenDeep
   * @param a Array.
   * @param depth Depth.
   * @returns The array flattened to the specified depth.
   * @example arrayFlattenDeep([1,[2,[3]]], 2) //=> [1,2,3]
   */
  arrayFlattenDeep: (a: A, depth?: P) => flatDeep(toArr(a) as any[], depth == null ? 1 / 0 : num(depth) | 0),
  /**
   * Returns true if the array contains the value.
   * @name arrayContains
   * @param a Array.
   * @param v Value.
   * @returns True if the array contains the value.
   * @example arrayContains([1,2,3], 2) //=> true
   */
  arrayContains: (a: A, v: A) => toArr(a).some((x) => eq(x, v)),
  /**
   * Returns the number of times the value appears in the array.
   * @name arrayCount
   * @param a Array.
   * @param v Value.
   * @returns The number of times the value appears in the array.
   * @example arrayCount([1,2,2,3], 2) //=> 2
   */
  arrayCount: (a: A, v: A) => toArr(a).reduce((c, x) => (c as number) + (eq(x, v) ? 1 : 0), 0),
  /**
   * Returns the array with falsy values removed.
   * @name arrayCompact
   * @param a Array.
   * @returns The array with falsy values removed.
   * @example arrayCompact([1,0,2,null,3]) //=> [1,2,3]
   */
  arrayCompact: (a: A) => toArr(a).filter((x) => !!x),
  /**
   * Returns the sum of numeric values in the array.
   * @name arraySum
   * @param a Array.
   * @returns The sum of numeric values in the array.
   * @example arraySum([1,2,3]) //=> 6
   */
  arraySum: (a: A) => toArr(a).reduce((s, x) => (s as number) + num(x ?? 0), 0),
  /**
   * Returns the arithmetic mean of numeric values in the array.
   * @name arrayMean
   * @param a Array.
   * @returns The arithmetic mean of numeric values in the array.
   * @example arrayMean([1,2,3]) //=> 2
   */
  arrayMean: (a: A) => {
    const t = toArr(a);
    return t.length ? (t.reduce((s, x) => (s as number) + num(x ?? 0), 0) as number) / t.length : 0;
  },
  /**
   * Returns the median value of the array.
   * @name arrayMedian
   * @param a Array.
   * @returns The median value of the array.
   * @example arrayMedian([1,2,3]) //=> 2
   */
  arrayMedian: (a: A) => {
    const t = toArr(a).slice().sort(cmp);
    const n = t.length;
    if (!n) return null;
    return n % 2 ? t[(n - 1) / 2] : (num(t[n / 2 - 1]) + num(t[n / 2])) / 2;
  },
  /**
   * Returns the sum of values at the specified index or property.
   * @name arraySumBy
   * @param a Array.
   * @param k Index or key.
   * @returns The sum of values at the specified index or property.
   * @example arraySumBy([[1,2],[3,4]], 1) //=> 6
   */
  arraySumBy: (a: A, k: P) =>
    toArr(a).reduce((s, x) => (s as number) + num(Array.isArray(x) ? ((x[num(k ?? 0) | 0] as P) ?? 0) : (x ?? 0)), 0),
  /**
   * Returns the union of two arrays with duplicates removed.
   * @name arrayUnion
   * @param a Array.
   * @param b Other array.
   * @returns The union of two arrays with duplicates removed.
   * @example arrayUnion([1,2], [2,3]) //=> [1,2,3]
   */
  arrayUnion: (a: A, b: A) => uniq(toArr(a).concat(toArr(b))),
  /**
   * Returns the intersection of two arrays.
   * @name arrayIntersection
   * @param a Array.
   * @param b Other array.
   * @returns The intersection of two arrays.
   * @example arrayIntersection([1,2,3], [2,3,4]) //=> [2,3]
   */
  arrayIntersection: (a: A, b: A) => {
    const tb = toArr(b);
    return uniq(toArr(a).filter((x) => tb.some((y) => eq(x, y))));
  },
  /**
   * Returns elements in the first array that are not in the second.
   * @name arrayDifference
   * @param a Array.
   * @param b Other array.
   * @returns Elements in the first array that are not in the second.
   * @example arrayDifference([1,2,3], [2,3,4]) //=> [1]
   */
  arrayDifference: (a: A, b: A) => {
    const tb = toArr(b);
    return toArr(a).filter((x) => !tb.some((y) => eq(x, y)));
  },
  /**
   * Returns a concatenated array.
   * @name arrayConcat
   * @param v Value.
   * @param args Additional values.
   * @returns A concatenated array.
   * @example arrayConcat([1,2], [3]) //=> [1,2,3]
   */
  arrayConcat: (v: P, ...args: unknown[]) => arr(v).concat(...(args as P[][])),
  /**
   * Returns array entries as [index, value] pairs.
   * @name arrayEntries
   * @param v Value.
   * @returns Array entries as [index, value] pairs.
   * @example arrayEntries(["a", "b"]) //=> [[0,"a"],[1,"b"]]
   */
  arrayEntries: (v: P) => Array.from(arr(v).entries()),
  /**
   * Returns a flattened array to the given depth.
   * @name arrayFlat
   * @param v Value.
   * @param depth Depth.
   * @returns A flattened array to the given depth.
   * @example arrayFlat([1,[2,[3]]], 2) //=> [1,2,3]
   */
  arrayFlat: (v: P, depth?: P) => arr(v).flat(depth == null ? 1 : num(depth) | 0),
  /**
   * Returns true if the array includes the search value.
   * @name arrayIncludes
   * @param v Value.
   * @param search Search value.
   * @param fromIndex Start index.
   * @returns True if the array includes the search value.
   * @example arrayIncludes([1,2,3], 2) //=> true
   */
  arrayIncludes: (v: P, search: P, fromIndex?: P) =>
    arr(v).includes(search, fromIndex == null ? undefined : num(fromIndex) | 0),
  /**
   * Returns the first index of the search value, or -1.
   * @name arrayIndexOf
   * @param v Value.
   * @param search Search value.
   * @param fromIndex Start index.
   * @returns The first index of the search value, or -1.
   * @example arrayIndexOf([1,2,3], 2) //=> 1
   */
  arrayIndexOf: (v: P, search: P, fromIndex?: P) =>
    arr(v).indexOf(search, fromIndex == null ? undefined : num(fromIndex) | 0),
  /**
   * Joins array elements into a string.
   * @name arrayJoin
   * @param v Value.
   * @param sep Separator.
   * @returns Result.
   * @example arrayJoin(["a","b"], "-") //=> "a-b"
   */
  arrayJoin: (v: P, sep?: P) => arr(v).join(sep == null ? "," : String(sep)),
  /**
   * Returns the array indices.
   * @name arrayKeys
   * @param v Value.
   * @returns The array indices.
   * @example arrayKeys(["a","b"]) //=> [0,1]
   */
  arrayKeys: (v: P) => Array.from(arr(v).keys()),
  /**
   * Returns the last index of the search value, or -1.
   * @name arrayLastIndexOf
   * @param v Value.
   * @param search Search value.
   * @param fromIndex Start index.
   * @returns The last index of the search value, or -1.
   * @example arrayLastIndexOf([1,2,1], 1) //=> 2
   */
  arrayLastIndexOf: (v: P, search: P, fromIndex?: P) =>
    fromIndex == null ? arr(v).lastIndexOf(search) : arr(v).lastIndexOf(search, num(fromIndex) | 0),
  /**
   * Returns a slice of the array.
   * @name arraySlice
   * @param v Value.
   * @param start Start index.
   * @param end End index.
   * @returns A slice of the array.
   * @example arraySlice([1,2,3,4], 1, 3) //=> [2,3]
   */
  arraySlice: (v: P, start?: P, end?: P) =>
    arr(v).slice(start == null ? undefined : num(start) | 0, end == null ? undefined : num(end) | 0),
  /**
   * Returns the array values.
   * @name arrayValues
   * @param v Value.
   * @returns The array values.
   * @example arrayValues(["a","b"]) //=> ["a","b"]
   */
  arrayValues: (v: P) => Array.from(arr(v).values()),
  /**
   * Returns the locale-aware string for the array.
   * @name toLocaleString
   * @param v Value.
   * @returns The locale-aware string for the array.
   * @example toLocaleString([1,2,3]) //=> "1,2,3"
   */
  toLocaleString: (v: P) => arr(v).toLocaleString(),
  /**
   * Returns a reversed copy of the array.
   * @name toReversed
   * @param v Value.
   * @returns A reversed copy of the array.
   * @example toReversed([1,2,3]) //=> [3,2,1]
   */
  toReversed: (v: P) => arr(v).toReversed(),
  /**
   * Returns a sorted copy of the array.
   * @name toSorted
   * @param v Value.
   * @param cmpFn Value.
   * @returns A sorted copy of the array.
   * @example toSorted([3,1,2]) //=> [1,2,3]
   */
  toSorted: (v: P, cmpFn?: P) =>
    typeof cmpFn === "function" ? arr(v).toSorted(cmpFn as (a: P, b: P) => number) : arr(v).toSorted(),
  /**
   * Returns a spliced copy of the array.
   * @name toSpliced
   * @param v Value.
   * @param start Start index.
   * @param deleteCount Value.
   * @param items Items to insert.
   * @returns A spliced copy of the array.
   * @example toSpliced([1,2,3], 1, 1, 9) //=> [1,9,3]
   */
  toSpliced: (v: P, start: P, deleteCount?: P, ...items: P[]) =>
    deleteCount == null
      ? arr(v).toSpliced(num(start) | 0)
      : arr(v).toSpliced(num(start) | 0, num(deleteCount) | 0, ...items),
  /**
   * Returns the array as a string.
   * @name toString
   * @param v Value.
   * @returns The array as a string.
   * @example toString([1,2,3]) //=> "1,2,3"
   */
  toString: (v: P) => arr(v).toString(),
};
