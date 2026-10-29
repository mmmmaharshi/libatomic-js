// GCC libatomic's integer builtins, ported to JavaScript. See README for the
// C differences that are not visible from a single call.
//
// The typed array carries the size (1/2/4/8 bytes) and guarantees the alignment
// the C API only assumes, so libatomic's (size, ptr) pair collapses into it.

export type AtomicArray =
  | Int8Array<SharedArrayBuffer>
  | Uint8Array<SharedArrayBuffer>
  | Int16Array<SharedArrayBuffer>
  | Uint16Array<SharedArrayBuffer>
  | Int32Array<SharedArrayBuffer>
  | Uint32Array<SharedArrayBuffer>
  | BigInt64Array<SharedArrayBuffer>
  | BigUint64Array<SharedArrayBuffer>;

// C's flag operations address a single byte, so only byte views are accepted.
export type FlagArray = Int8Array<SharedArrayBuffer> | Uint8Array<SharedArrayBuffer>;

// Atomics accepts any buffer and its overloads reject a union of number and
// BigInt views, so each ported name is that function with the shared-buffer
// type pinned once instead of a hand-written wrapper per operation.
type Load = <T extends AtomicArray>(ta: T, i: number) => T[number];
type Store = <T extends AtomicArray>(ta: T, i: number, val: T[number]) => void;
type Fetch = <T extends AtomicArray>(ta: T, i: number, val: T[number]) => T[number];

const compareExchange = Atomics.compareExchange as <T extends AtomicArray>(
  ta: T,
  i: number,
  expected: T[number],
  desired: T[number],
) => T[number];

export const __atomic_load_n = Atomics.load as Load;
export const __atomic_store_n = Atomics.store as Store;
export const __atomic_exchange_n = Atomics.exchange as Fetch;

// No `weak` argument: a single attempt can never fail spuriously. The result is
// discriminated instead of being written back into `expected` like C does.
export function __atomic_compare_exchange_n<T extends AtomicArray>(
  ta: T,
  i: number,
  expected: T[number],
  desired: T[number],
): { ok: true } | { ok: false; expected: T[number] } {
  const got = compareExchange(ta, i, expected, desired);
  return got === expected ? { ok: true } : { ok: false, expected: got };
}

export const __atomic_fetch_add = Atomics.add as Fetch;
export const __atomic_fetch_sub = Atomics.sub as Fetch;
export const __atomic_fetch_and = Atomics.and as Fetch;
export const __atomic_fetch_or = Atomics.or as Fetch;
export const __atomic_fetch_xor = Atomics.xor as Fetch;

// No Atomics.nand, so read-modify-write by hand: ptr = ~(old & val).
export function __atomic_fetch_nand<T extends AtomicArray>(ta: T, i: number, val: T[number]): T[number] {
  const isBig = ta instanceof BigInt64Array || ta instanceof BigUint64Array;
  if (isBig !== (typeof val === 'bigint')) {
    throw new TypeError('__atomic_fetch_nand: value type must match the view');
  }
  for (let old = __atomic_load_n(ta, i); ; ) {
    const next = (
      isBig ? ~((old as bigint) & (val as bigint)) : ~((old as number) & (val as number))
    ) as T[number];
    const got = compareExchange(ta, i, old, next);
    if (got === old) return old;
    old = got;
  }
}

// Returns true when the flag was already set, matching C.
export function __atomic_test_and_set(ta: FlagArray, i: number): boolean {
  return Atomics.exchange(ta, i, 1) !== 0;
}

export function __atomic_clear(ta: FlagArray, i: number): void {
  Atomics.store(ta, i, 0);
}

// C's fences have no JS equivalent, and per-operation seq_cst makes them
// redundant, so they are deliberately absent rather than exported as no-ops.

export function __atomic_is_lock_free(size: number): boolean {
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError(`invalid size: ${size}`);
  }
  return size === 1 || size === 2 || size === 4 || size === 8;
}
