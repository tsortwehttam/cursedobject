import { camel, capFirst, kebab, Method, num, P, snake, toArr, toStr, unCapFirst } from "./FunctionHelpers";

function str(v: unknown): string {
  return toStr(v as P);
}

export const stringFunctions: Record<string, Method> = {
  /**
   * Returns the length of the given string.
   * @name strLength
   * @param v Value.
   * @returns The length of the given string.
   * @example strLength("bear") //=> 4
   */
  strLength: (v: P) => toStr(v).length,
  /**
   * Returns a capitalized form of the given string.
   * @name toCapitals
   * @param v Value.
   * @returns A capitalized form of the given string.
   * @example toCapitals("bear") //=> "Bear"
   */
  toCapitals: (v: P) => capFirst(toStr(v).toLowerCase()),
  /**
   * Returns an uncapitalized form of the given string.
   * @name toUncapitals
   * @param v Value.
   * @returns An uncapitalized form of the given string.
   * @example toUncapitals("Bear") //=> "bear"
   */
  toUncapitals: (v: P) => unCapFirst(toStr(v)),
  /**
   * Returns title case form of the given string.
   * @name toTitle
   * @param v Value.
   * @returns Title case form of the given string.
   * @example toTitle("hello world") //=> "Hello World"
   */
  toTitle: (v: P) => toStr(v).replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase()),
  /**
   * Returns kebab-case form of the given string.
   * @name toKebabCase
   * @param v Value.
   * @returns Kebab-case form of the given string.
   * @example toKebabCase("helloWorld") //=> "hello-world"
   */
  toKebabCase: (v: P) => kebab(toStr(v)),
  /**
   * Returns snake_case form of the given string.
   * @name toSnakeCase
   * @param v Value.
   * @returns Snake_case form of the given string.
   * @example toSnakeCase("helloWorld") //=> "hello_world"
   */
  toSnakeCase: (v: P) => snake(toStr(v)),
  /**
   * Returns camelCase form of the given string.
   * @name toCamelCase
   * @param v Value.
   * @returns CamelCase form of the given string.
   * @example toCamelCase("hello-world") //=> "helloWorld"
   */
  toCamelCase: (v: P) => camel(toStr(v)),
  /**
   * Converts an array to a natural language list.
   * @name toList
   * @param arr Array.
   * @param sep Separator.
   * @param lastSep Final separator.
   * @returns Converted value.
   * @example toList(["a", "b", "c"]) //=> "a, b and c"
   */
  toList: (arr: P[], sep?: P, lastSep?: P) => {
    const t = toArr(arr).map(toStr);
    if (!t.length) return "";
    if (t.length === 1) return t[0];
    const s = toStr(sep ?? ", ");
    const l = toStr(lastSep ?? " and ");
    return t.slice(0, -1).join(s) + l + t[t.length - 1];
  },
  /**
   * Returns plural form of a word based on count.
   * @name toPlural
   * @param word Word.
   * @param count Count.
   * @param pluralForm Plural form.
   * @returns Plural form of a word based on count.
   * @example toPlural("cat", 2) //=> "cats"
   */
  toPlural: (word: P, count: P, pluralForm?: P) => {
    const w = toStr(word);
    const n = num(count);
    if (n === 1) return w;
    return pluralForm == null ? w + "s" : toStr(pluralForm);
  },
  /**
   * Returns ordinal form of a number.
   * @name toOrdinal
   * @param n Count.
   * @returns Ordinal form of a number.
   * @example toOrdinal(21) //=> "21st"
   */
  toOrdinal: (n: P) => {
    const v = Math.abs(num(n));
    const s = ["th", "st", "nd", "rd"];
    const v10 = v % 100;
    return v + (s[(v10 - 20) % 10] || s[v10] || s[0]);
  },
  /**
   * Returns the character at the specified index.
   * @name strCharAt
   * @param v Value.
   * @param index Index.
   * @returns The character at the specified index.
   * @example strCharAt("bear", 1) //=> "e"
   */
  strCharAt: (v: P, index: P) => str(v).charAt(num(index) | 0),
  /**
   * Returns the UTF-16 code unit at the specified index.
   * @name strCharCodeAt
   * @param v Value.
   * @param index Index.
   * @returns The UTF-16 code unit at the specified index.
   * @example strCharCodeAt("A", 0) //=> 65
   */
  strCharCodeAt: (v: P, index: P) => str(v).charCodeAt(num(index) | 0),
  /**
   * Returns the Unicode code point at the specified index.
   * @name strCodePointAt
   * @param v Value.
   * @param index Index.
   * @returns The Unicode code point at the specified index.
   * @example strCodePointAt("B", 0) //=> 66
   */
  strCodePointAt: (v: P, index: P) => str(v).codePointAt(num(index) | 0) ?? null,
  /**
   * Concatenates the string with the given arguments.
   * @name strConcat
   * @param v Value.
   * @param args Additional values.
   * @returns Result.
   * @example strConcat("a", "b", "c") //=> "abc"
   */
  strConcat: (v: P, ...args: unknown[]) => str(v).concat(...args.map(str)),
  /**
   * Returns true if the string ends with the search string.
   * @name strEndsWith
   * @param v Value.
   * @param search Search value.
   * @param length Length.
   * @returns True if the string ends with the search string.
   * @example strEndsWith("hello", "lo") //=> true
   */
  strEndsWith: (v: P, search: P, length?: P) =>
    str(v).endsWith(str(search), length == null ? undefined : num(length) | 0),
  /**
   * Returns true if the string includes the search string.
   * @name strIncludes
   * @param v Value.
   * @param search Search value.
   * @param position Position.
   * @returns True if the string includes the search string.
   * @example strIncludes("hello", "ell") //=> true
   */
  strIncludes: (v: P, search: P, position?: P) =>
    str(v).includes(str(search), position == null ? undefined : num(position) | 0),
  /**
   * Returns the index of the search string, or -1.
   * @name strIndexOf
   * @param v Value.
   * @param search Search value.
   * @param position Position.
   * @returns The index of the search string, or -1.
   * @example strIndexOf("hello", "l") //=> 2
   */
  strIndexOf: (v: P, search: P, position?: P) =>
    str(v).indexOf(str(search), position == null ? undefined : num(position) | 0),
  /**
   * Returns true if the string is well-formed.
   * @name strIsWellFormed
   * @param v Value.
   * @returns True if the string is well-formed.
   * @example strIsWellFormed("hello") //=> true
   */
  strIsWellFormed: (v: P) => (str(v) as unknown as { isWellFormed(): boolean }).isWellFormed(),
  /**
   * Returns the last index of the search string, or -1.
   * @name strLastIndexOf
   * @param v Value.
   * @param search Search value.
   * @param position Position.
   * @returns The last index of the search string, or -1.
   * @example strLastIndexOf("hello", "l") //=> 3
   */
  strLastIndexOf: (v: P, search: P, position?: P) =>
    position == null ? str(v).lastIndexOf(str(search)) : str(v).lastIndexOf(str(search), num(position) | 0),
  /**
   * Compares two strings using locale-sensitive order.
   * @name strLocaleCompare
   * @param v Value.
   * @param that Other string.
   * @param args Additional values.
   * @returns Result.
   * @example strLocaleCompare("a", "b") //=> -1
   */
  strLocaleCompare: (v: P, that: P, ...args: unknown[]) =>
    str(v).localeCompare(
      str(that),
      ...(args as Parameters<string["localeCompare"]> extends [string, ...infer R] ? R : [])
    ),
  /**
   * Matches a string against a regular expression.
   * @name strMatch
   * @param v Value.
   * @param regexp Regular expression.
   * @returns Result.
   * @example strMatch("abc123", "\\d+") //=> ["123"]
   */
  strMatch: (v: P, regexp: P) => str(v).match(regexp as string | RegExp),
  /**
   * Returns all matches for a regular expression.
   * @name strMatchAll
   * @param v Value.
   * @param regexp Regular expression.
   * @returns All matches for a regular expression.
   * @example strMatchAll("a1b2", "\\d") //=> [["1"], ["2"]]
   */
  strMatchAll: (v: P, regexp: P) => Array.from(str(v).matchAll(regexp as unknown as RegExp)),
  /**
   * Returns a normalized Unicode string.
   * @name strNormalize
   * @param v Value.
   * @param form Normalization form.
   * @returns A normalized Unicode string.
   * @example strNormalize("hello") //=> "hello"
   */
  strNormalize: (v: P, form?: P) =>
    str(v).normalize(form == null ? undefined : (str(form) as Parameters<string["normalize"]>[0])),
  /**
   * Pads the string on the end to the given length.
   * @name strPadEnd
   * @param v Value.
   * @param length Length.
   * @param fillStr Fill string.
   * @returns Result.
   * @example strPadEnd("hi", 5, ".") //=> "hi..."
   */
  strPadEnd: (v: P, length: P, fillStr?: P) =>
    str(v).padEnd(num(length) | 0, fillStr == null ? undefined : str(fillStr)),
  /**
   * Pads the string on the start to the given length.
   * @name strPadStart
   * @param v Value.
   * @param length Length.
   * @param fillStr Fill string.
   * @returns Result.
   * @example strPadStart("hi", 5, ".") //=> "...hi"
   */
  strPadStart: (v: P, length: P, fillStr?: P) =>
    str(v).padStart(num(length) | 0, fillStr == null ? undefined : str(fillStr)),
  /**
   * Repeats the string count times.
   * @name strRepeat
   * @param v Value.
   * @param count Count.
   * @returns Result.
   * @example strRepeat("ha", 3) //=> "hahaha"
   */
  strRepeat: (v: P, count: P) => str(v).repeat(num(count) | 0),
  /**
   * Replaces the first match.
   * @name strReplace
   * @param v Value.
   * @param search Search value.
   * @param replace Value.
   * @returns Result.
   * @example strReplace("hello", "l", "x") //=> "hexlo"
   */
  strReplace: (v: P, search: P, replace: P) => str(v).replace(search as string | RegExp, str(replace)),
  /**
   * Replaces all matches.
   * @name strReplaceAll
   * @param v Value.
   * @param search Search value.
   * @param replace Value.
   * @returns Result.
   * @example strReplaceAll("hello", "l", "x") //=> "hexxo"
   */
  strReplaceAll: (v: P, search: P, replace: P) => str(v).replaceAll(search as string | RegExp, str(replace)),
  /**
   * Searches for a match and returns the index, or -1.
   * @name strSearch
   * @param v Value.
   * @param regexp Regular expression.
   * @returns Result.
   * @example strSearch("hello", "l") //=> 2
   */
  strSearch: (v: P, regexp: P) => str(v).search(regexp as string | RegExp),
  /**
   * Returns a slice of the string.
   * @name strSlice
   * @param v Value.
   * @param start Start index.
   * @param end End index.
   * @returns A slice of the string.
   * @example strSlice("hello", 1, 4) //=> "ell"
   */
  strSlice: (v: P, start?: P, end?: P) =>
    str(v).slice(start == null ? undefined : num(start) | 0, end == null ? undefined : num(end) | 0),
  /**
   * Returns the string in a small HTML tag.
   * @name strSmall
   * @param v Value.
   * @returns The string in a small HTML tag.
   * @example strSmall("hi") //=> "<small>hi</small>"
   */
  strSmall: (v: P) => str(v).small(),
  /**
   * Splits a string by the separator.
   * @name strSplit
   * @param v Value.
   * @param separator Separator.
   * @param limit Limit.
   * @returns Result.
   * @example strSplit("a-b-c", "-") //=> ["a","b","c"]
   */
  strSplit: (v: P, separator?: P, limit?: P) =>
    separator == null
      ? [str(v)]
      : str(v).split(separator as string | RegExp, limit == null ? undefined : num(limit) | 0),
  /**
   * Returns a substring using start and length.
   * @name strSubstr
   * @param v Value.
   * @param start Start index.
   * @param length Length.
   * @returns A substring using start and length.
   * @example strSubstr("hello", 1, 3) //=> "ell"
   */
  strSubstr: (v: P, start: P, length?: P) =>
    str(v).substr(num(start) | 0, length == null ? undefined : num(length) | 0),
  /**
   * Returns a substring using start and end.
   * @name strSubstring
   * @param v Value.
   * @param start Start index.
   * @param end End index.
   * @returns A substring using start and end.
   * @example strSubstring("hello", 1, 4) //=> "ell"
   */
  strSubstring: (v: P, start: P, end?: P) => str(v).substring(num(start) | 0, end == null ? undefined : num(end) | 0),
  /**
   * Returns true if the string starts with the search string.
   * @name strStartsWith
   * @param v Value.
   * @param search Search value.
   * @param position Position.
   * @returns True if the string starts with the search string.
   * @example strStartsWith("hello", "he") //=> true
   */
  strStartsWith: (v: P, search: P, position?: P) =>
    str(v).startsWith(str(search), position == null ? undefined : num(position) | 0),
  /**
   * Returns the string value.
   * @name toString
   * @param v Value.
   * @returns The string value.
   * @example toString("hi") //=> "hi"
   */
  toString: (v: P) => str(v).toString(),
  /**
   * Returns the string normalized to well-formed Unicode.
   * @name toWellFormed
   * @param v Value.
   * @returns The string normalized to well-formed Unicode.
   * @example toWellFormed("hello") //=> "hello"
   */
  toWellFormed: (v: P) => (str(v) as unknown as { toWellFormed(): string }).toWellFormed(),
  /**
   * Trims whitespace from both ends of the string.
   * @name strTrim
   * @param v Value.
   * @returns Result.
   * @example strTrim("  hi  ") //=> "hi"
   */
  strTrim: (v: P) => str(v).trim(),
  /**
   * Trims whitespace from the start of the string.
   * @name strTrimStart
   * @param v Value.
   * @returns Result.
   * @example strTrimStart("  hi") //=> "hi"
   */
  strTrimStart: (v: P) => str(v).trimStart(),
  /**
   * Trims whitespace from the start of the string.
   * @name strTrimLeft
   * @param v Value.
   * @returns Result.
   * @example strTrimLeft("  hi") //=> "hi"
   */
  strTrimLeft: (v: P) => str(v).trimLeft(),
  /**
   * Trims whitespace from the end of the string.
   * @name strTrimEnd
   * @param v Value.
   * @returns Result.
   * @example strTrimEnd("hi  ") //=> "hi"
   */
  strTrimEnd: (v: P) => str(v).trimEnd(),
  /**
   * Trims whitespace from the end of the string.
   * @name strTrimRight
   * @param v Value.
   * @returns Result.
   * @example strTrimRight("hi  ") //=> "hi"
   */
  strTrimRight: (v: P) => str(v).trimRight(),
  /**
   * Returns the primitive string value.
   * @name strValueOf
   * @param v Value.
   * @returns The primitive string value.
   * @example strValueOf("hi") //=> "hi"
   */
  strValueOf: (v: P) => str(v).valueOf(),
  /**
   * Returns a locale-aware lowercase string.
   * @name toLocaleLowerCase
   * @param v Value.
   * @param args Additional values.
   * @returns A locale-aware lowercase string.
   * @example toLocaleLowerCase("HELLO", "en-US") //=> "hello"
   */
  toLocaleLowerCase: (v: P, ...args: unknown[]) =>
    str(v).toLocaleLowerCase(...(args as Parameters<string["toLocaleLowerCase"]>)),
  /**
   * Returns a locale-aware uppercase string.
   * @name toLocaleUpperCase
   * @param v Value.
   * @param args Additional values.
   * @returns A locale-aware uppercase string.
   * @example toLocaleUpperCase("hello", "en-US") //=> "HELLO"
   */
  toLocaleUpperCase: (v: P, ...args: unknown[]) =>
    str(v).toLocaleUpperCase(...(args as Parameters<string["toLocaleUpperCase"]>)),
  /**
   * Returns a lowercase string.
   * @name toLowerCase
   * @param v Value.
   * @returns A lowercase string.
   * @example toLowerCase("HELLO") //=> "hello"
   */
  toLowerCase: (v: P) => str(v).toLowerCase(),
  /**
   * Returns an uppercase string.
   * @name toUpperCase
   * @param v Value.
   * @returns An uppercase string.
   * @example toUpperCase("hello") //=> "HELLO"
   */
  toUpperCase: (v: P) => str(v).toUpperCase(),
};
