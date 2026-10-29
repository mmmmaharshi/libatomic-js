// @ts-check
// GCC libatomic's integer builtins, ported to JavaScript. See README for the
// C differences that are not visible from a single call.
//
// The typed array carries the size (1/2/4/8 bytes) and guarantees the alignment
// the C API only assumes, so libatomic's (size, ptr) pair collapses into it.

/** @typedef {Int8Array | Uint8Array | Int16Array | Uint16Array | Int32Array | Uint32Array | BigInt64Array | BigUint64Array} AtomicArray */
/** @typedef {Exclude<AtomicArray, BigInt64Array | BigUint64Array>} FlagArray */

// Atomics' overloads reject a union of number and BigInt views, so the shared
// signatures are asserted once here and keep the element type of the view.
const ops = /** @type {{
  load<T extends AtomicArray>(ta: T, i: number): T[number],
  store<T extends AtomicArray>(ta: T, i: number, val: T[number]): T[number],
  exchange<T extends AtomicArray>(ta: T, i: number, val: T[number]): T[number],
  compareExchange<T extends AtomicArray>(ta: T, i: number, expected: T[number], desired: T[number]): T[number],
  add<T extends AtomicArray>(ta: T, i: number, val: T[number]): T[number],
  sub<T extends AtomicArray>(ta: T, i: number, val: T[number]): T[number],
  and<T extends AtomicArray>(ta: T, i: number, val: T[number]): T[number],
  or<T extends AtomicArray>(ta: T, i: number, val: T[number]): T[number],
  xor<T extends AtomicArray>(ta: T, i: number, val: T[number]): T[number],
}} */ (Atomics);

/**
 * @template {AtomicArray} T
 * @param {T} ta
 * @param {number} i
 * @returns {T[number]}
 */
export function __atomic_load_n(ta, i) {
  return ops.load(ta, i);
}

/**
 * @template {AtomicArray} T
 * @param {T} ta
 * @param {number} i
 * @param {T[number]} val
 */
export function __atomic_store_n(ta, i, val) {
  ops.store(ta, i, val);
}

/**
 * @template {AtomicArray} T
 * @param {T} ta
 * @param {number} i
 * @param {T[number]} val
 * @returns {T[number]}
 */
export function __atomic_exchange_n(ta, i, val) {
  return ops.exchange(ta, i, val);
}

// No `weak` argument: a single attempt can never fail spuriously. The result is
// discriminated instead of being written back into `expected` like C does.
/**
 * @template {AtomicArray} T
 * @param {T} ta
 * @param {number} i
 * @param {T[number]} expected
 * @param {T[number]} desired
 * @returns {{ ok: true } | { ok: false, expected: T[number] }}
 */
export function __atomic_compare_exchange_n(ta, i, expected, desired) {
  const got = ops.compareExchange(ta, i, expected, desired);
  return got === expected ? { ok: true } : { ok: false, expected: got };
}

/**
 * @template {AtomicArray} T
 * @param {T} ta
 * @param {number} i
 * @param {T[number]} val
 * @returns {T[number]}
 */
export function __atomic_fetch_add(ta, i, val) {
  return ops.add(ta, i, val);
}

/**
 * @template {AtomicArray} T
 * @param {T} ta
 * @param {number} i
 * @param {T[number]} val
 * @returns {T[number]}
 */
export function __atomic_fetch_sub(ta, i, val) {
  return ops.sub(ta, i, val);
}

/**
 * @template {AtomicArray} T
 * @param {T} ta
 * @param {number} i
 * @param {T[number]} val
 * @returns {T[number]}
 */
export function __atomic_fetch_and(ta, i, val) {
  return ops.and(ta, i, val);
}

/**
 * @template {AtomicArray} T
 * @param {T} ta
 * @param {number} i
 * @param {T[number]} val
 * @returns {T[number]}
 */
export function __atomic_fetch_or(ta, i, val) {
  return ops.or(ta, i, val);
}

/**
 * @template {AtomicArray} T
 * @param {T} ta
 * @param {number} i
 * @param {T[number]} val
 * @returns {T[number]}
 */
export function __atomic_fetch_xor(ta, i, val) {
  return ops.xor(ta, i, val);
}

// No Atomics.nand, so read-modify-write by hand: ptr = ~(old & val).
/**
 * @template {AtomicArray} T
 * @param {T} ta
 * @param {number} i
 * @param {T[number]} val
 * @returns {T[number]}
 */
export function __atomic_fetch_nand(ta, i, val) {
  for (let old = ops.load(ta, i); ; ) {
    // The assertions and casts only satisfy tsc: a val of the wrong type still
    // throws, because JS will not mix number and bigint in one operator.
    const next = /** @type {T[number]} */ (
      typeof old === 'bigint' ? ~(old & /** @type {bigint} */ (val)) : ~(old & /** @type {number} */ (val))
    );
    const got = ops.compareExchange(ta, i, old, next);
    if (got === old) return old;
    old = got;
  }
}

// Returns true when the flag was already set, matching C.
/**
 * @param {FlagArray} ta
 * @param {number} i
 * @returns {boolean}
 */
export function __atomic_test_and_set(ta, i) {
  return ops.exchange(ta, i, 1) !== 0;
}

/**
 * @param {FlagArray} ta
 * @param {number} i
 */
export function __atomic_clear(ta, i) {
  ops.store(ta, i, 0);
}

// C's fences have no JS equivalent, and per-operation seq_cst makes them
// redundant, so they are deliberately absent rather than exported as no-ops.

/** @param {number} size @returns {boolean} */
export function __atomic_is_lock_free(size) {
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError(`invalid size: ${size}`);
  }
  return size === 1 || size === 2 || size === 4 || size === 8;
}
