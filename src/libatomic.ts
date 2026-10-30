/**
 * GCC libatomic's integer builtins, ported to JavaScript. See the README for the
 * C differences that are not visible from a single call.
 *
 * The typed array carries the size (1/2/4/8 bytes) and guarantees the alignment
 * the C API only assumes, so libatomic's (size, ptr) pair collapses into it.
 *
 * @module
 */

import {
  f32Bits, bitsToF32, f64Bits, bitsToF64,
  floatAdd32, floatSub32, floatAdd64, floatSub64,
} from './float.ts';

/**
 * A view over a `SharedArrayBuffer` whose elements can be operated on
 * atomically. The element type sets the width.
 */
export type IntegerArray =
  | Int8Array<SharedArrayBuffer>
  | Uint8Array<SharedArrayBuffer>
  | Int16Array<SharedArrayBuffer>
  | Uint16Array<SharedArrayBuffer>
  | Int32Array<SharedArrayBuffer>
  | Uint32Array<SharedArrayBuffer>
  | BigInt64Array<SharedArrayBuffer>
  | BigUint64Array<SharedArrayBuffer>;

/**
 * Floating-point views, which `Atomics` does not accept directly. They are
 * handled by reinterpreting the bits through an integer view and a CAS loop.
 */
export type FloatArray =
  | Float32Array<SharedArrayBuffer>
  | Float64Array<SharedArrayBuffer>;

export type AtomicArray = IntegerArray | FloatArray;

/**
 * A byte view, for the flag helpers. C's flag operations address a single byte,
 * so a wider view is rejected even though it is atomic.
 */
export type FlagArray = Int8Array<SharedArrayBuffer> | Uint8Array<SharedArrayBuffer>;

// Atomics accepts any buffer and its overloads reject a union of number and
// BigInt views, so each ported name is that function with the shared-buffer
// type pinned once instead of a hand-written wrapper per operation.
type LoadInt = <T extends IntegerArray>(ta: T, i: number) => T[number];
type StoreInt = <T extends IntegerArray>(ta: T, i: number, val: T[number]) => void;
type FetchInt = <T extends IntegerArray>(ta: T, i: number, val: T[number]) => T[number];

const isBigIntView = (ta: AtomicArray): ta is BigInt64Array<SharedArrayBuffer> | BigUint64Array<SharedArrayBuffer> =>
  ta instanceof BigInt64Array || ta instanceof BigUint64Array;

const isFloatView = (ta: AtomicArray): ta is FloatArray =>
  ta instanceof Float32Array || ta instanceof Float64Array;

// Atomics wraps what it stores to the element width but hands back the old
// value, so the new one needs the same wrap to match what was kept.
function wrap<T extends IntegerArray>(ta: T, v: number | bigint): T[number] {
  if (typeof v === 'bigint') {
    return (ta instanceof BigInt64Array ? BigInt.asIntN(64, v) : BigInt.asUintN(64, v)) as T[number];
  }
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

const casInt = Atomics.compareExchange as <T extends IntegerArray>(
  ta: T,
  i: number,
  expected: T[number],
  desired: T[number],
) => T[number];

const loadInt = Atomics.load as LoadInt;
const storeInt = Atomics.store as StoreInt;
const exchangeInt = Atomics.exchange as FetchInt;
const fetchAddInt = Atomics.add as FetchInt;
const fetchSubInt = Atomics.sub as FetchInt;
const fetchAndInt = Atomics.and as FetchInt;
const fetchOrInt = Atomics.or as FetchInt;
const fetchXorInt = Atomics.xor as FetchInt;

// --- public API (integers + float dispatch) ---------------------------------

/** Reads the element at `i`. */
export function load<T extends AtomicArray>(ta: T, i: number): T[number] {
  if (ta instanceof Float32Array) {
    const iv = new Int32Array(ta.buffer, ta.byteOffset, ta.length);
    return bitsToF32(Atomics.load(iv, i)) as T[number];
  }
  if (ta instanceof Float64Array) {
    const iv = new BigInt64Array(ta.buffer, ta.byteOffset, ta.length);
    return bitsToF64(Atomics.load(iv, i)) as T[number];
  }
  return loadInt(ta as unknown as IntegerArray & T, i) as T[number];
}

/** Writes `val` to `i`. */
export function store<T extends AtomicArray>(ta: T, i: number, val: T[number]): void {
  if (ta instanceof Float32Array) {
    const iv = new Int32Array(ta.buffer, ta.byteOffset, ta.length);
    Atomics.store(iv, i, f32Bits(val as number));
    return;
  }
  if (ta instanceof Float64Array) {
    const iv = new BigInt64Array(ta.buffer, ta.byteOffset, ta.length);
    Atomics.store(iv, i, f64Bits(val as number));
    return;
  }
  storeInt(ta as unknown as IntegerArray & T, i, val as (IntegerArray & T)[number]);
}

/** Writes `val` to `i` and returns the value it replaced. */
export function exchange<T extends AtomicArray>(ta: T, i: number, val: T[number]): T[number] {
  if (ta instanceof Float32Array) {
    const iv = new Int32Array(ta.buffer, ta.byteOffset, ta.length);
    return bitsToF32(Atomics.exchange(iv, i, f32Bits(val as number))) as T[number];
  }
  if (ta instanceof Float64Array) {
    const iv = new BigInt64Array(ta.buffer, ta.byteOffset, ta.length);
    return bitsToF64(Atomics.exchange(iv, i, f64Bits(val as number))) as T[number];
  }
  return exchangeInt(ta as unknown as IntegerArray & T, i, val as (IntegerArray & T)[number]) as T[number];
}

/**
 * Writes `desired` to `i` only if the element still holds `expected`.
 *
 * No `weak` argument: a single attempt can never fail spuriously. The result is
 * discriminated instead of being written back into `expected` like C does.
 * Comparison is on the bit pattern, matching libatomic; two NaNs with different
 * bit patterns do not compare equal.
 *
 * @returns `{ ok: true }`, or `{ ok: false, expected }` with the value found.
 */
export function compareExchange<T extends AtomicArray>(
  ta: T,
  i: number,
  expected: T[number],
  desired: T[number],
): { ok: true } | { ok: false; expected: T[number] } {
  if (ta instanceof Float32Array) {
    const iv = new Int32Array(ta.buffer, ta.byteOffset, ta.length);
    const expBits = f32Bits(expected as number);
    const got = Atomics.compareExchange(iv, i, expBits, f32Bits(desired as number));
    const gotF = bitsToF32(got);
    return got === expBits ? { ok: true } : { ok: false, expected: gotF };
  }
  if (ta instanceof Float64Array) {
    const iv = new BigInt64Array(ta.buffer, ta.byteOffset, ta.length);
    const expBits = f64Bits(expected as number);
    const got = Atomics.compareExchange(iv, i, expBits, f64Bits(desired as number));
    const gotF = bitsToF64(got);
    return got === expBits ? { ok: true } : { ok: false, expected: gotF };
  }
  const got = casInt(ta as unknown as IntegerArray & T, i, expected as (IntegerArray & T)[number], desired as (IntegerArray & T)[number]);
  return got === expected ? { ok: true } : { ok: false, expected: got };
}

/** Adds `val` and returns the previous value. */
export function fetchAdd<T extends AtomicArray>(ta: T, i: number, val: T[number]): T[number] {
  if (ta instanceof Float32Array) {
    const iv = new Int32Array(ta.buffer, ta.byteOffset, ta.length);
    return floatAdd32(iv, i, val as number).old as T[number];
  }
  if (ta instanceof Float64Array) {
    const iv = new BigInt64Array(ta.buffer, ta.byteOffset, ta.length);
    return floatAdd64(iv, i, val as number).old as T[number];
  }
  return fetchAddInt(ta as unknown as IntegerArray & T, i, val as (IntegerArray & T)[number]) as T[number];
}

/** Subtracts `val` and returns the previous value. */
export function fetchSub<T extends AtomicArray>(ta: T, i: number, val: T[number]): T[number] {
  if (ta instanceof Float32Array) {
    const iv = new Int32Array(ta.buffer, ta.byteOffset, ta.length);
    return floatSub32(iv, i, val as number).old as T[number];
  }
  if (ta instanceof Float64Array) {
    const iv = new BigInt64Array(ta.buffer, ta.byteOffset, ta.length);
    return floatSub64(iv, i, val as number).old as T[number];
  }
  return fetchSubInt(ta as unknown as IntegerArray & T, i, val as (IntegerArray & T)[number]) as T[number];
}

/** Bitwise ANDs `val` and returns the previous value. (integers only) */
export const fetchAnd = fetchAndInt as <T extends IntegerArray>(ta: T, i: number, val: T[number]) => T[number];

/** Bitwise ORs `val` and returns the previous value. (integers only) */
export const fetchOr = fetchOrInt as <T extends IntegerArray>(ta: T, i: number, val: T[number]) => T[number];

/** Bitwise XORs `val` and returns the previous value. (integers only) */
export const fetchXor = fetchXorInt as <T extends IntegerArray>(ta: T, i: number, val: T[number]) => T[number];

// No Atomics.nand, so read-modify-write by hand: ptr = ~(old & val).
function nand<T extends IntegerArray>(
  ta: T,
  i: number,
  val: T[number],
): { old: T[number]; next: T[number] } {
  const isBig = isBigIntView(ta);
  if (isBig !== (typeof val === 'bigint')) {
    throw new TypeError('fetchNand: value type must match the view');
  }
  for (let old = loadInt(ta, i) as T[number]; ; ) {
    const raw = isBig
      ? ~((old as bigint) & (val as bigint))
      : ~((old as number) & (val as number));
    const next = wrap(ta, raw);
    const got = casInt(ta, i, old, next);
    if (got === old) return { old, next };
    old = got;
  }
}

/**
 * Stores `~(old & val)` and returns the previous value.
 *
 * @throws {TypeError} when `val` is a BigInt for a number view, or the reverse.
 */
export function fetchNand<T extends IntegerArray>(ta: T, i: number, val: T[number]): T[number] {
  return nand(ta, i, val).old;
}

// --- new-value (*_fetch) variants ------------------------------------------

/** Adds `val` and returns the new value. */
export function addFetch<T extends AtomicArray>(ta: T, i: number, val: T[number]): T[number] {
  if (ta instanceof Float32Array) {
    const iv = new Int32Array(ta.buffer, ta.byteOffset, ta.length);
    return floatAdd32(iv, i, val as number).next as T[number];
  }
  if (ta instanceof Float64Array) {
    const iv = new BigInt64Array(ta.buffer, ta.byteOffset, ta.length);
    return floatAdd64(iv, i, val as number).next as T[number];
  }
  const old = fetchAdd(ta as unknown as IntegerArray & T, i, val as (IntegerArray & T)[number]);
  return wrap(ta as unknown as IntegerArray & T, isBigIntView(ta as unknown as IntegerArray & T) ? (old as bigint) + (val as bigint) : (old as number) + (val as number)) as T[number];
}

/** Subtracts `val` and returns the new value. */
export function subFetch<T extends AtomicArray>(ta: T, i: number, val: T[number]): T[number] {
  if (ta instanceof Float32Array) {
    const iv = new Int32Array(ta.buffer, ta.byteOffset, ta.length);
    return floatSub32(iv, i, val as number).next as T[number];
  }
  if (ta instanceof Float64Array) {
    const iv = new BigInt64Array(ta.buffer, ta.byteOffset, ta.length);
    return floatSub64(iv, i, val as number).next as T[number];
  }
  const old = fetchSub(ta as unknown as IntegerArray & T, i, val as (IntegerArray & T)[number]);
  return wrap(ta as unknown as IntegerArray & T, isBigIntView(ta as unknown as IntegerArray & T) ? (old as bigint) - (val as bigint) : (old as number) - (val as number)) as T[number];
}

/** Bitwise ANDs `val` and returns the new value. (integers only) */
export function andFetch<T extends IntegerArray>(ta: T, i: number, val: T[number]): T[number] {
  const old = fetchAnd(ta, i, val);
  return wrap(ta, isBigIntView(ta) ? (old as bigint) & (val as bigint) : (old as number) & (val as number));
}

/** Bitwise ORs `val` and returns the new value. (integers only) */
export function orFetch<T extends IntegerArray>(ta: T, i: number, val: T[number]): T[number] {
  const old = fetchOr(ta, i, val);
  return wrap(ta, isBigIntView(ta) ? (old as bigint) | (val as bigint) : (old as number) | (val as number));
}

/** Bitwise XORs `val` and returns the new value. (integers only) */
export function xorFetch<T extends IntegerArray>(ta: T, i: number, val: T[number]): T[number] {
  const old = fetchXor(ta, i, val);
  return wrap(ta, isBigIntView(ta) ? (old as bigint) ^ (val as bigint) : (old as number) ^ (val as number));
}

/**
 * Stores `~(old & val)` and returns the new value.
 *
 * @throws {TypeError} when `val` is a BigInt for a number view, or the reverse.
 */
export function nandFetch<T extends IntegerArray>(ta: T, i: number, val: T[number]): T[number] {
  return nand(ta, i, val).next;
}

// --- 128-bit (lock-based, since JS has no 128-bit atomic) ------------------
//
// A 128-bit value is stored as two BigInt64 slots. Atomicity is provided by a
// spinlock in the four bytes immediately after the value, so a caller allocates
// 24 bytes per value: bytes 0-15 are the value, bytes 16-19 are the lock word
// (must be zero-initialised). Values must start 8-byte aligned and the view must
// start at a 4-byte-aligned offset.

export * from './int128.ts';

// --- flag helpers -----------------------------------------------------------

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
