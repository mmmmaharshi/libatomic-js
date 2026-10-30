/**
 * GCC libatomic's integer builtins, ported to JavaScript. See the README for the
 * C differences that are not visible from a single call.
 *
 * The typed array carries the size (1/2/4/8 bytes) and guarantees the alignment
 * the C API only assumes, so libatomic's (size, ptr) pair collapses into it.
 *
 * @module
 */

/**
 * A view over a `SharedArrayBuffer` whose elements can be operated on
 * atomically. The element type sets the width.
 */
export type AtomicArray =
  | Int8Array<SharedArrayBuffer>
  | Uint8Array<SharedArrayBuffer>
  | Int16Array<SharedArrayBuffer>
  | Uint16Array<SharedArrayBuffer>
  | Int32Array<SharedArrayBuffer>
  | Uint32Array<SharedArrayBuffer>
  | BigInt64Array<SharedArrayBuffer>
  | BigUint64Array<SharedArrayBuffer>;

/**
 * A byte view, for the flag helpers. C's flag operations address a single byte,
 * so a wider view is rejected even though it is atomic.
 */
export type FlagArray = Int8Array<SharedArrayBuffer> | Uint8Array<SharedArrayBuffer>;

// Atomics accepts any buffer and its overloads reject a union of number and
// BigInt views, so each ported name is that function with the shared-buffer
// type pinned once instead of a hand-written wrapper per operation.
type Load = <T extends AtomicArray>(ta: T, i: number) => T[number];
type Store = <T extends AtomicArray>(ta: T, i: number, val: T[number]) => void;
type Fetch = <T extends AtomicArray>(ta: T, i: number, val: T[number]) => T[number];

const isBig = (ta: AtomicArray): ta is BigInt64Array<SharedArrayBuffer> | BigUint64Array<SharedArrayBuffer> =>
  ta instanceof BigInt64Array || ta instanceof BigUint64Array;

// Atomics wraps what it stores to the element width but hands back the old
// value, so the new one needs the same wrap to match what was kept.
function wrap<T extends AtomicArray>(ta: T, v: number | bigint): T[number] {
  if (typeof v === 'bigint') {
    return (ta instanceof BigInt64Array ? BigInt.asIntN(64, v) : BigInt.asUintN(64, v)) as T[number];
  }
  // Fast path: most values already fit, so skip the modulo.
  const signed = ta instanceof Int8Array || ta instanceof Int16Array || ta instanceof Int32Array;
  const width = 2 ** (ta.BYTES_PER_ELEMENT * 8);
  const half = width / 2;
  if (signed) {
    if (v >= -half && v < half) return v as T[number];
  } else {
    if (v >= 0 && v < width) return v as T[number];
  }
  const u = ((v % width) + width) % width;
  return (signed && u >= half ? u - width : u) as T[number];
}

const cas = Atomics.compareExchange as <T extends AtomicArray>(
  ta: T,
  i: number,
  expected: T[number],
  desired: T[number],
) => T[number];

/** Reads the element at `i`. */
export const load = Atomics.load as Load;

/** Writes `val` to `i`. */
export const store = Atomics.store as Store;

/** Writes `val` to `i` and returns the value it replaced. */
export const exchange = Atomics.exchange as Fetch;

/**
 * Writes `desired` to `i` only if the element still holds `expected`.
 *
 * No `weak` argument: a single attempt can never fail spuriously. The result is
 * discriminated instead of being written back into `expected` like C does.
 *
 * @returns `{ ok: true }`, or `{ ok: false, expected }` with the value found.
 */
export function compareExchange<T extends AtomicArray>(
  ta: T,
  i: number,
  expected: T[number],
  desired: T[number],
): { ok: true } | { ok: false; expected: T[number] } {
  const got = cas(ta, i, expected, desired);
  return got === expected ? { ok: true } : { ok: false, expected: got };
}

/** Adds `val` and returns the previous value. */
export const fetchAdd = Atomics.add as Fetch;

/** Subtracts `val` and returns the previous value. */
export const fetchSub = Atomics.sub as Fetch;

/** Bitwise ANDs `val` and returns the previous value. */
export const fetchAnd = Atomics.and as Fetch;

/** Bitwise ORs `val` and returns the previous value. */
export const fetchOr = Atomics.or as Fetch;

/** Bitwise XORs `val` and returns the previous value. */
export const fetchXor = Atomics.xor as Fetch;

/** Adds `val` and returns the new value. */
export function addFetch<T extends AtomicArray>(ta: T, i: number, val: T[number]): T[number] {
  const old = fetchAdd(ta, i, val);
  return wrap(ta, isBig(ta) ? (old as bigint) + (val as bigint) : (old as number) + (val as number));
}

/** Subtracts `val` and returns the new value. */
export function subFetch<T extends AtomicArray>(ta: T, i: number, val: T[number]): T[number] {
  const old = fetchSub(ta, i, val);
  return wrap(ta, isBig(ta) ? (old as bigint) - (val as bigint) : (old as number) - (val as number));
}

/** Bitwise ANDs `val` and returns the new value. */
export function andFetch<T extends AtomicArray>(ta: T, i: number, val: T[number]): T[number] {
  const old = fetchAnd(ta, i, val);
  return wrap(ta, isBig(ta) ? (old as bigint) & (val as bigint) : (old as number) & (val as number));
}

/** Bitwise ORs `val` and returns the new value. */
export function orFetch<T extends AtomicArray>(ta: T, i: number, val: T[number]): T[number] {
  const old = fetchOr(ta, i, val);
  return wrap(ta, isBig(ta) ? (old as bigint) | (val as bigint) : (old as number) | (val as number));
}

/** Bitwise XORs `val` and returns the new value. */
export function xorFetch<T extends AtomicArray>(ta: T, i: number, val: T[number]): T[number] {
  const old = fetchXor(ta, i, val);
  return wrap(ta, isBig(ta) ? (old as bigint) ^ (val as bigint) : (old as number) ^ (val as number));
}

// No Atomics.nand, so read-modify-write by hand: ptr = ~(old & val).
function nand<T extends AtomicArray>(
  ta: T,
  i: number,
  val: T[number],
): { old: T[number]; next: T[number] } {
  if (isBig(ta) !== (typeof val === 'bigint')) {
    throw new TypeError('nand: value type must match the view');
  }
  for (let old = load(ta, i); ; ) {
    const raw = isBig(ta)
      ? ~((old as bigint) & (val as bigint))
      : ~((old as number) & (val as number));
    const next = wrap(ta, raw);
    const got = cas(ta, i, old, next);
    if (got === old) return { old, next };
    old = got;
  }
}

/**
 * Stores `~(old & val)` and returns the previous value.
 *
 * @throws {TypeError} when `val` is a BigInt for a number view, or the reverse.
 */
export function fetchNand<T extends AtomicArray>(ta: T, i: number, val: T[number]): T[number] {
  return nand(ta, i, val).old;
}

/**
 * Stores `~(old & val)` and returns the new value.
 *
 * @throws {TypeError} when `val` is a BigInt for a number view, or the reverse.
 */
export function nandFetch<T extends AtomicArray>(ta: T, i: number, val: T[number]): T[number] {
  return nand(ta, i, val).next;
}

/** Sets the flag byte at `i` to 1 and reports whether it was already set. */
export function testAndSet(ta: FlagArray, i: number): boolean {
  return Atomics.exchange(ta, i, 1) !== 0;
}

/** Sets the flag byte at `i` to 0. */
export function clear(ta: FlagArray, i: number): void {
  Atomics.store(ta, i, 0);
}

/**
 * A no-op. Every operation here is sequentially consistent, so a `seq_cst` fence
 * has nothing left to order. Exported so a C call site ports unchanged. The
 * `memorder` argument is accepted and ignored, matching the rest of the library.
 */
export function threadFence(_memorder?: number): void {}

/** A no-op, for the reason given on {@link threadFence}. */
export function signalFence(_memorder?: number): void {}

/**
 * Reports whether `size` bytes can be operated on atomically in one step.
 *
 * @throws {RangeError} when `size` is not a positive integer.
 */
export function isLockFree(size: number): boolean {
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError(`invalid size: ${size}`);
  }
  return size === 1 || size === 2 || size === 4 || size === 8;
}

/** C asks this at compile time; JS can only give the {@link isLockFree} answer. */
export const alwaysLockFree = isLockFree;
