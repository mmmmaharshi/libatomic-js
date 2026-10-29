// @ts-check
// GCC libatomic's integer builtins, ported to JavaScript. See README for the
// C differences that are not visible from a single call.
//
// The typed array carries the size (1/2/4/8 bytes) and guarantees the alignment
// the C API only assumes, so libatomic's (size, ptr) pair collapses into it.

export const __ATOMIC_RELAXED = 0;
export const __ATOMIC_CONSUME = 1;
export const __ATOMIC_ACQUIRE = 2;
export const __ATOMIC_RELEASE = 3;
export const __ATOMIC_ACQ_REL = 4;
export const __ATOMIC_SEQ_CST = 5;

/** @typedef {Int8Array | Uint8Array | Int16Array | Uint16Array | Int32Array | Uint32Array | BigInt64Array | BigUint64Array} AtomicArray */

// Atomics' overloads reject a union of number and BigInt views, so the shared
// signatures are asserted once here instead of at every call site.
const ops = /** @type {{
  load(ta: AtomicArray, i: number): number | bigint,
  store(ta: AtomicArray, i: number, val: number | bigint): void,
  exchange(ta: AtomicArray, i: number, val: number | bigint): number | bigint,
  compareExchange(ta: AtomicArray, i: number, expected: number | bigint, desired: number | bigint): number | bigint,
  add(ta: AtomicArray, i: number, val: number | bigint): number | bigint,
  sub(ta: AtomicArray, i: number, val: number | bigint): number | bigint,
  and(ta: AtomicArray, i: number, val: number | bigint): number | bigint,
  or(ta: AtomicArray, i: number, val: number | bigint): number | bigint,
  xor(ta: AtomicArray, i: number, val: number | bigint): number | bigint,
}} */ (Atomics);

/** @param {number} order */
function checkOrder(order) {
  if (!Number.isInteger(order) || order < __ATOMIC_RELAXED || order > __ATOMIC_SEQ_CST) {
    throw new RangeError(`invalid memory order: ${order}`);
  }
}

/**
 * @param {AtomicArray} ta
 * @param {number} i
 * @param {number} [order]
 * @returns {number | bigint}
 */
export function __atomic_load_n(ta, i, order = __ATOMIC_SEQ_CST) {
  checkOrder(order);
  return ops.load(ta, i);
}

/**
 * @param {AtomicArray} ta
 * @param {number} i
 * @param {number | bigint} val
 * @param {number} [order]
 */
export function __atomic_store_n(ta, i, val, order = __ATOMIC_SEQ_CST) {
  checkOrder(order);
  ops.store(ta, i, val);
}

/**
 * @param {AtomicArray} ta
 * @param {number} i
 * @param {number | bigint} val
 * @param {number} [order]
 * @returns {number | bigint}
 */
export function __atomic_exchange_n(ta, i, val, order = __ATOMIC_SEQ_CST) {
  checkOrder(order);
  return ops.exchange(ta, i, val);
}

// No `weak` argument: a single attempt can never fail spuriously. The result is
// discriminated instead of being written back into `expected` like C does.
/**
 * @param {AtomicArray} ta
 * @param {number} i
 * @param {number | bigint} expected
 * @param {number | bigint} desired
 * @param {number} [order]
 * @returns {{ ok: true } | { ok: false, expected: number | bigint }}
 */
export function __atomic_compare_exchange_n(ta, i, expected, desired, order = __ATOMIC_SEQ_CST) {
  checkOrder(order);
  const got = ops.compareExchange(ta, i, expected, desired);
  return got === expected ? { ok: true } : { ok: false, expected: got };
}

/**
 * @param {AtomicArray} ta
 * @param {number} i
 * @param {number | bigint} val
 * @param {number} [order]
 * @returns {number | bigint}
 */
export function __atomic_fetch_add(ta, i, val, order = __ATOMIC_SEQ_CST) {
  checkOrder(order);
  return ops.add(ta, i, val);
}

/**
 * @param {AtomicArray} ta
 * @param {number} i
 * @param {number | bigint} val
 * @param {number} [order]
 * @returns {number | bigint}
 */
export function __atomic_fetch_sub(ta, i, val, order = __ATOMIC_SEQ_CST) {
  checkOrder(order);
  return ops.sub(ta, i, val);
}

/**
 * @param {AtomicArray} ta
 * @param {number} i
 * @param {number | bigint} val
 * @param {number} [order]
 * @returns {number | bigint}
 */
export function __atomic_fetch_and(ta, i, val, order = __ATOMIC_SEQ_CST) {
  checkOrder(order);
  return ops.and(ta, i, val);
}

/**
 * @param {AtomicArray} ta
 * @param {number} i
 * @param {number | bigint} val
 * @param {number} [order]
 * @returns {number | bigint}
 */
export function __atomic_fetch_or(ta, i, val, order = __ATOMIC_SEQ_CST) {
  checkOrder(order);
  return ops.or(ta, i, val);
}

/**
 * @param {AtomicArray} ta
 * @param {number} i
 * @param {number | bigint} val
 * @param {number} [order]
 * @returns {number | bigint}
 */
export function __atomic_fetch_xor(ta, i, val, order = __ATOMIC_SEQ_CST) {
  checkOrder(order);
  return ops.xor(ta, i, val);
}

// No Atomics.nand, so read-modify-write by hand: ptr = ~(old & val).
/**
 * @param {AtomicArray} ta
 * @param {number} i
 * @param {number | bigint} val
 * @param {number} [order]
 * @returns {number | bigint}
 */
export function __atomic_fetch_nand(ta, i, val, order = __ATOMIC_SEQ_CST) {
  checkOrder(order);
  for (let old = ops.load(ta, i); ; ) {
    const next = typeof old === 'bigint' ? ~(old & BigInt(val)) : ~(old & Number(val));
    const got = ops.compareExchange(ta, i, old, next);
    if (got === old) return old;
    old = got;
  }
}

// Returns true when the flag was already set, matching C.
/**
 * @param {AtomicArray} ta
 * @param {number} i
 * @param {number} [order]
 * @returns {boolean}
 */
export function __atomic_test_and_set(ta, i, order = __ATOMIC_SEQ_CST) {
  checkOrder(order);
  return ops.exchange(ta, i, 1) !== 0;
}

/**
 * @param {AtomicArray} ta
 * @param {number} i
 * @param {number} [order]
 */
export function __atomic_clear(ta, i, order = __ATOMIC_SEQ_CST) {
  checkOrder(order);
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
