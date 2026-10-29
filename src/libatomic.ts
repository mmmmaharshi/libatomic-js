// GCC libatomic's integer builtins, ported to JavaScript. See README for the
// C differences that are not visible from a single call.
//
// The typed array carries the size (1/2/4/8 bytes) and guarantees the alignment
// the C API only assumes, so libatomic's (size, ptr) pair collapses into it.

export type AtomicArray =
  | Int8Array
  | Uint8Array
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | BigInt64Array
  | BigUint64Array;

export type FlagArray = Exclude<AtomicArray, BigInt64Array | BigUint64Array>;

// Atomics' overloads reject a union of number and BigInt views, so the shared
// signatures are asserted once here and keep the element type of the view.
const ops = Atomics as unknown as {
  load<T extends AtomicArray>(ta: T, i: number): T[number];
  store<T extends AtomicArray>(ta: T, i: number, val: T[number]): T[number];
  exchange<T extends AtomicArray>(ta: T, i: number, val: T[number]): T[number];
  compareExchange<T extends AtomicArray>(ta: T, i: number, expected: T[number], desired: T[number]): T[number];
  add<T extends AtomicArray>(ta: T, i: number, val: T[number]): T[number];
  sub<T extends AtomicArray>(ta: T, i: number, val: T[number]): T[number];
  and<T extends AtomicArray>(ta: T, i: number, val: T[number]): T[number];
  or<T extends AtomicArray>(ta: T, i: number, val: T[number]): T[number];
  xor<T extends AtomicArray>(ta: T, i: number, val: T[number]): T[number];
};

export function __atomic_load_n<T extends AtomicArray>(ta: T, i: number): T[number] {
  return ops.load(ta, i);
}

export function __atomic_store_n<T extends AtomicArray>(ta: T, i: number, val: T[number]): void {
  ops.store(ta, i, val);
}

export function __atomic_exchange_n<T extends AtomicArray>(ta: T, i: number, val: T[number]): T[number] {
  return ops.exchange(ta, i, val);
}

// No `weak` argument: a single attempt can never fail spuriously. The result is
// discriminated instead of being written back into `expected` like C does.
export function __atomic_compare_exchange_n<T extends AtomicArray>(
  ta: T,
  i: number,
  expected: T[number],
  desired: T[number],
): { ok: true } | { ok: false; expected: T[number] } {
  const got = ops.compareExchange(ta, i, expected, desired);
  return got === expected ? { ok: true } : { ok: false, expected: got };
}

export function __atomic_fetch_add<T extends AtomicArray>(ta: T, i: number, val: T[number]): T[number] {
  return ops.add(ta, i, val);
}

export function __atomic_fetch_sub<T extends AtomicArray>(ta: T, i: number, val: T[number]): T[number] {
  return ops.sub(ta, i, val);
}

export function __atomic_fetch_and<T extends AtomicArray>(ta: T, i: number, val: T[number]): T[number] {
  return ops.and(ta, i, val);
}

export function __atomic_fetch_or<T extends AtomicArray>(ta: T, i: number, val: T[number]): T[number] {
  return ops.or(ta, i, val);
}

export function __atomic_fetch_xor<T extends AtomicArray>(ta: T, i: number, val: T[number]): T[number] {
  return ops.xor(ta, i, val);
}

// No Atomics.nand, so read-modify-write by hand: ptr = ~(old & val).
export function __atomic_fetch_nand<T extends AtomicArray>(ta: T, i: number, val: T[number]): T[number] {
  for (let old = ops.load(ta, i); ; ) {
    // The assertions only satisfy tsc: a val of the wrong type still throws,
    // because JS will not mix number and bigint in one operator.
    const next = (
      typeof old === 'bigint' ? ~(old & (val as bigint)) : ~(old & (val as number))
    ) as T[number];
    const got = ops.compareExchange(ta, i, old, next);
    if (got === old) return old;
    old = got;
  }
}

// Returns true when the flag was already set, matching C.
export function __atomic_test_and_set(ta: FlagArray, i: number): boolean {
  return ops.exchange(ta, i, 1) !== 0;
}

export function __atomic_clear(ta: FlagArray, i: number): void {
  ops.store(ta, i, 0);
}

// C's fences have no JS equivalent, and per-operation seq_cst makes them
// redundant, so they are deliberately absent rather than exported as no-ops.

export function __atomic_is_lock_free(size: number): boolean {
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError(`invalid size: ${size}`);
  }
  return size === 1 || size === 2 || size === 4 || size === 8;
}
