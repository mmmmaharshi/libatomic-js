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

/**
 * Stores `~(old & val)` and returns the previous value, using a CAS loop
 * because `Atomics` has no `nand`.
 *
 * @throws {TypeError} when `val` is a BigInt for a number view, or the reverse.
 */
export function fetchNand<T extends AtomicArray>(ta: T, i: number, val: T[number]): T[number] {
  const isBig = ta instanceof BigInt64Array || ta instanceof BigUint64Array;
  if (isBig !== (typeof val === 'bigint')) {
    throw new TypeError('fetchNand: value type must match the view');
  }
  for (let old = load(ta, i); ; ) {
    const next = (
      isBig ? ~((old as bigint) & (val as bigint)) : ~((old as number) & (val as number))
    ) as T[number];
    const got = cas(ta, i, old, next);
    if (got === old) return old;
    old = got;
  }
}

/** Sets the flag byte at `i` to 1 and reports whether it was already set. */
export function testAndSet(ta: FlagArray, i: number): boolean {
  return Atomics.exchange(ta, i, 1) !== 0;
}

/** Sets the flag byte at `i` to 0. */
export function clear(ta: FlagArray, i: number): void {
  Atomics.store(ta, i, 0);
}

// C's fences have no JS equivalent, and per-operation seq_cst makes them
// redundant, so they are deliberately absent rather than exported as no-ops.

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
