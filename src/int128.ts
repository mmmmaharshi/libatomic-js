// 128-bit atomics. JS has no 128-bit atomic, so these use a spinlock in the
// four bytes immediately after the value: bytes 0-15 are the value, bytes 16-19
// are the lock word (must be zero-initialised). A caller allocates 24 bytes per
// value and passes the byte offset of the value. Values must be 8-byte aligned
// and the view must start at a 4-byte-aligned offset.

const MASK128 = (1n << 128n) - 1n;

const read128 = (bytes: Uint8Array<SharedArrayBuffer>, offset: number): bigint => {
  const v = new BigInt64Array(bytes.buffer, bytes.byteOffset + offset, 2);
  return (BigInt.asUintN(64, v[1]) << 64n) | BigInt.asUintN(64, v[0]);
};
const write128 = (bytes: Uint8Array<SharedArrayBuffer>, offset: number, value: bigint): void => {
  const v = new BigInt64Array(bytes.buffer, bytes.byteOffset + offset, 2);
  v[0] = BigInt.asIntN(64, value);
  v[1] = BigInt.asIntN(64, value >> 64n);
};

function check128(bytes: Uint8Array<SharedArrayBuffer>, offset: number): void {
  if (offset % 8 !== 0) throw new RangeError('128-bit operation: offset must be 8-aligned');
  if (bytes.byteOffset % 4 !== 0) throw new RangeError('128-bit operation: view must be 4-byte aligned');
  if (bytes.byteLength < offset + 20) throw new RangeError('128-bit operation: buffer too small');
}

const lock128 = (bytes: Uint8Array<SharedArrayBuffer>, offset: number): void => {
  const slot = new Int32Array(bytes.buffer, bytes.byteOffset + offset + 16, 1);
  while (Atomics.compareExchange(slot, 0, 0, 1) !== 0) { /* spin */ }
};
const unlock128 = (bytes: Uint8Array<SharedArrayBuffer>, offset: number): void => {
  const slot = new Int32Array(bytes.buffer, bytes.byteOffset + offset + 16, 1);
  Atomics.store(slot, 0, 0);
};

// Single read-modify-write driver. `compute(old, val)` returns the value to store.
function rmw128(
  bytes: Uint8Array<SharedArrayBuffer>,
  offset: number,
  val: bigint,
  compute: (old: bigint, val: bigint) => bigint,
  returnNew: boolean,
): bigint {
  check128(bytes, offset);
  lock128(bytes, offset);
  try {
    const old = read128(bytes, offset);
    const next = compute(old, val) & MASK128;
    write128(bytes, offset, next);
    return returnNew ? next : old;
  } finally {
    unlock128(bytes, offset);
  }
}

/** Reads the 128-bit value at `offset`. */
export function load128(bytes: Uint8Array<SharedArrayBuffer>, offset: number): bigint {
  check128(bytes, offset);
  lock128(bytes, offset);
  try {
    return read128(bytes, offset);
  } finally {
    unlock128(bytes, offset);
  }
}

/** Writes `val` to `offset`. */
export function store128(bytes: Uint8Array<SharedArrayBuffer>, offset: number, val: bigint): void {
  check128(bytes, offset);
  lock128(bytes, offset);
  try {
    write128(bytes, offset, val);
  } finally {
    unlock128(bytes, offset);
  }
}

/** Writes `val` and returns the value it replaced. */
export function exchange128(bytes: Uint8Array<SharedArrayBuffer>, offset: number, val: bigint): bigint {
  check128(bytes, offset);
  lock128(bytes, offset);
  try {
    const old = read128(bytes, offset);
    write128(bytes, offset, val);
    return old;
  } finally {
    unlock128(bytes, offset);
  }
}

/** Writes `desired` only if the slot still holds `expected`. */
export function compareExchange128(
  bytes: Uint8Array<SharedArrayBuffer>,
  offset: number,
  expected: bigint,
  desired: bigint,
): { ok: true } | { ok: false; expected: bigint } {
  check128(bytes, offset);
  lock128(bytes, offset);
  try {
    const got = read128(bytes, offset);
    if (got === expected) write128(bytes, offset, desired);
    return got === expected ? { ok: true } : { ok: false, expected: got };
  } finally {
    unlock128(bytes, offset);
  }
}

/** Adds `val` and returns the previous value. */
export function fetchAdd128(bytes: Uint8Array<SharedArrayBuffer>, offset: number, val: bigint): bigint {
  return rmw128(bytes, offset, val, (old, v) => old + v, false);
}

/** Subtracts `val` and returns the previous value. */
export function fetchSub128(bytes: Uint8Array<SharedArrayBuffer>, offset: number, val: bigint): bigint {
  return rmw128(bytes, offset, val, (old, v) => old - v, false);
}

/** Bitwise ANDs `val` and returns the previous value. */
export function fetchAnd128(bytes: Uint8Array<SharedArrayBuffer>, offset: number, val: bigint): bigint {
  return rmw128(bytes, offset, val, (old, v) => old & v, false);
}

/** Bitwise ORs `val` and returns the previous value. */
export function fetchOr128(bytes: Uint8Array<SharedArrayBuffer>, offset: number, val: bigint): bigint {
  return rmw128(bytes, offset, val, (old, v) => old | v, false);
}

/** Bitwise XORs `val` and returns the previous value. */
export function fetchXor128(bytes: Uint8Array<SharedArrayBuffer>, offset: number, val: bigint): bigint {
  return rmw128(bytes, offset, val, (old, v) => old ^ v, false);
}

/** Stores `~(old & val)` and returns the previous value. */
export function fetchNand128(bytes: Uint8Array<SharedArrayBuffer>, offset: number, val: bigint): bigint {
  return rmw128(bytes, offset, val, (old, v) => ~ (old & v), false);
}

/** Adds `val` and returns the new value. */
export function addFetch128(bytes: Uint8Array<SharedArrayBuffer>, offset: number, val: bigint): bigint {
  return rmw128(bytes, offset, val, (old, v) => old + v, true);
}

/** Subtracts `val` and returns the new value. */
export function subFetch128(bytes: Uint8Array<SharedArrayBuffer>, offset: number, val: bigint): bigint {
  return rmw128(bytes, offset, val, (old, v) => old - v, true);
}

/** Bitwise ANDs `val` and returns the new value. */
export function andFetch128(bytes: Uint8Array<SharedArrayBuffer>, offset: number, val: bigint): bigint {
  return rmw128(bytes, offset, val, (old, v) => old & v, true);
}

/** Bitwise ORs `val` and returns the new value. */
export function orFetch128(bytes: Uint8Array<SharedArrayBuffer>, offset: number, val: bigint): bigint {
  return rmw128(bytes, offset, val, (old, v) => old | v, true);
}

/** Bitwise XORs `val` and returns the new value. */
export function xorFetch128(bytes: Uint8Array<SharedArrayBuffer>, offset: number, val: bigint): bigint {
  return rmw128(bytes, offset, val, (old, v) => old ^ v, true);
}

/** Stores `~(old & val)` and returns the new value. */
export function nandFetch128(bytes: Uint8Array<SharedArrayBuffer>, offset: number, val: bigint): bigint {
  return rmw128(bytes, offset, val, (old, v) => ~ (old & v), true);
}
