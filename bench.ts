import { load, store, fetchAdd, addFetch, compareExchange, fetchNand, nandFetch } from './src/libatomic.ts';

const N = 2_000_000;
const a = new Uint32Array(new SharedArrayBuffer(4));
store(a, 0, 0);

function bench(name: string, fn: () => void) {
  // warmup
  for (let i = 0; i < 10000; i++) fn();
  const t0 = performance.now();
  for (let i = 0; i < N; i++) fn();
  const ms = performance.now() - t0;
  const ops = (N / ms) * 1000;
  console.log(`${name.padEnd(24)} ${ms.toFixed(1).padStart(7)} ms   ${(ops / 1e6).toFixed(2)} M ops/s`);
}

bench('load', () => { load(a, 0); });
bench('fetchAdd', () => { fetchAdd(a, 0, 1); });
bench('addFetch', () => { addFetch(a, 0, 1); });
bench('compareExchange ok', () => { compareExchange(a, 0, a[0], a[0] + 1); });
bench('fetchNand', () => { fetchNand(a, 0, 0b1010); });
bench('nandFetch', () => { nandFetch(a, 0, 0b1010); });
