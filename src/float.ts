// Floating-point bit reinterpretation and CAS helpers. `Atomics` does not accept
// float views, so floats go through an integer view and a compare-and-swap loop.
// The scratch buffers are module-private and single-threaded within a worker.

const f32Buf = new ArrayBuffer(4);
const f32i = new Int32Array(f32Buf);
const f32f = new Float32Array(f32Buf);
const f64Buf = new ArrayBuffer(8);
const f64i = new BigInt64Array(f64Buf);
const f64f = new Float64Array(f64Buf);

export function f32Bits(v: number): number { f32f[0] = v; return f32i[0]; }
export function bitsToF32(b: number): number { f32i[0] = b; return f32f[0]; }
export function f64Bits(v: number): bigint { f64f[0] = v; return f64i[0]; }
export function bitsToF64(b: bigint): number { f64i[0] = b; return f64f[0]; }

export function floatAdd32(iv: Int32Array<SharedArrayBuffer>, i: number, val: number): { old: number; next: number } {
  return floatRmw32(iv, i, val, (a, b) => a + b);
}
export function floatSub32(iv: Int32Array<SharedArrayBuffer>, i: number, val: number): { old: number; next: number } {
  return floatRmw32(iv, i, val, (a, b) => a - b);
}
export function floatAdd64(iv: BigInt64Array<SharedArrayBuffer>, i: number, val: number): { old: number; next: number } {
  return floatRmw64(iv, i, val, (a, b) => a + b);
}
export function floatSub64(iv: BigInt64Array<SharedArrayBuffer>, i: number, val: number): { old: number; next: number } {
  return floatRmw64(iv, i, val, (a, b) => a - b);
}

function floatRmw32(iv: Int32Array<SharedArrayBuffer>, i: number, val: number, op: (a: number, b: number) => number): { old: number; next: number } {
  for (let oldBits = Atomics.load(iv, i); ; ) {
    const oldVal = bitsToF32(oldBits);
    const nextVal = op(oldVal, val);
    const nextBits = f32Bits(nextVal);
    const got = Atomics.compareExchange(iv, i, oldBits, nextBits);
    if (got === oldBits) return { old: oldVal, next: nextVal };
  }
}
function floatRmw64(iv: BigInt64Array<SharedArrayBuffer>, i: number, val: number, op: (a: number, b: number) => number): { old: number; next: number } {
  for (let oldBits = Atomics.load(iv, i); ; ) {
    const oldVal = bitsToF64(oldBits);
    const nextVal = op(oldVal, val);
    const nextBits = f64Bits(nextVal);
    const got = Atomics.compareExchange(iv, i, oldBits, nextBits);
    if (got === oldBits) return { old: oldVal, next: nextVal };
  }
}
