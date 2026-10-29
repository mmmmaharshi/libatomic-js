import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import {
  __atomic_load_n,
  __atomic_store_n,
  __atomic_exchange_n,
  __atomic_compare_exchange_n,
  __atomic_fetch_add,
  __atomic_fetch_sub,
  __atomic_fetch_and,
  __atomic_fetch_or,
  __atomic_fetch_xor,
  __atomic_fetch_nand,
  __atomic_test_and_set,
  __atomic_clear,
  __atomic_is_lock_free,
} from '../src/libatomic.ts';

const bytes = (n: number) => new Uint8Array(new SharedArrayBuffer(n));
const moduleUrl = new URL('../src/libatomic.ts', import.meta.url).href;

const workerSource = (body: string) => `
  const { parentPort, workerData } = require('node:worker_threads');
  (async () => {
    const m = await import(${JSON.stringify(moduleUrl)});
    const a = new Uint32Array(workerData);
    ${body}
    parentPort.postMessage('done');
  })();`;

function runWorkers(source: string, workerData: SharedArrayBuffer, count: number): Promise<unknown[]> {
  return Promise.all(Array.from({ length: count }, () => new Promise((resolve, reject) => {
    const worker = new Worker(source, { eval: true, workerData });
    let reported = false;
    worker.once('message', (m) => {
      reported = true;
      resolve(m);
    });
    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (!reported) reject(new Error(`worker exited (${code}) without reporting`));
    });
  })));
}

test('load and store', () => {
  const a = bytes(1);
  __atomic_store_n(a, 0, 42);
  assert.equal(__atomic_load_n(a, 0), 42);

  const big = new BigUint64Array(new SharedArrayBuffer(8));
  __atomic_store_n(big, 0, 9007199254740993n);
  assert.equal(__atomic_load_n(big, 0), 9007199254740993n);
});

test('exchange returns the previous value', () => {
  const a = bytes(4);
  __atomic_store_n(a, 0, 7);
  assert.equal(__atomic_exchange_n(a, 0, 9), 7);
  assert.equal(__atomic_load_n(a, 0), 9);
});

test('compare_exchange reports success and the observed value', () => {
  const a = bytes(1);
  __atomic_store_n(a, 0, 5);

  assert.deepEqual(__atomic_compare_exchange_n(a, 0, 5, 6), { ok: true });
  assert.equal(__atomic_load_n(a, 0), 6);

  assert.deepEqual(__atomic_compare_exchange_n(a, 0, 5, 7), { ok: false, expected: 6 });
  assert.equal(__atomic_load_n(a, 0), 6);
});

test('fetch operations return the old value and wrap at the element width', () => {
  const a = bytes(1);
  __atomic_store_n(a, 0, 250);
  assert.equal(__atomic_fetch_add(a, 0, 10), 250);
  assert.equal(__atomic_load_n(a, 0), 4);
  assert.equal(__atomic_fetch_sub(a, 0, 6), 4);
  assert.equal(__atomic_load_n(a, 0), 254);

  __atomic_store_n(a, 0, 0b1100);
  assert.equal(__atomic_fetch_and(a, 0, 0b1010), 12);
  assert.equal(__atomic_load_n(a, 0), 0b1000);
  assert.equal(__atomic_fetch_or(a, 0, 0b0011), 8);
  assert.equal(__atomic_fetch_xor(a, 0, 0b1111), 11);
  assert.equal(__atomic_load_n(a, 0), 4);
});

test('fetch_nand computes ~(old & val)', () => {
  const a = bytes(1);
  __atomic_store_n(a, 0, 0b1100);
  assert.equal(__atomic_fetch_nand(a, 0, 0b1010), 12);
  assert.equal(__atomic_load_n(a, 0), 0b11110111);
});

test('fetch_nand carries 64-bit values', () => {
  const a = new BigUint64Array(new SharedArrayBuffer(8));
  __atomic_store_n(a, 0, 0b1100n);
  assert.equal(__atomic_fetch_nand(a, 0, 0b1010n), 12n);
  assert.equal(__atomic_load_n(a, 0), 0xfffffffffffffff7n);
});

test('fetch_nand rejects a value of the wrong type', () => {
  const a = new Uint32Array(new SharedArrayBuffer(4));
  assert.throws(() => __atomic_fetch_nand(a, 0, 1n), TypeError);
});

test('test_and_set and clear drive a flag byte', () => {
  const a = bytes(1);
  assert.equal(__atomic_test_and_set(a, 0), false);
  assert.equal(__atomic_test_and_set(a, 0), true);
  __atomic_clear(a, 0);
  assert.equal(__atomic_load_n(a, 0), 0);
});

test('reports which widths are lock-free and rejects invalid sizes', () => {
  assert.equal(__atomic_is_lock_free(8), true);
  assert.equal(__atomic_is_lock_free(16), false);
  assert.throws(() => __atomic_is_lock_free(0), RangeError);
  assert.throws(() => __atomic_is_lock_free('8' as unknown as number), RangeError);
});

test('fetch_add is atomic across worker threads', async () => {
  const sab = new SharedArrayBuffer(4);
  const source = workerSource('for (let i = 0; i < 20000; i++) m.__atomic_fetch_add(a, 0, 1);');

  await runWorkers(source, sab, 4);

  assert.equal(new Uint32Array(sab)[0], 80000);
});

test('compare_exchange retry loop converges across worker threads', async () => {
  const sab = new SharedArrayBuffer(4);
  const source = workerSource(`
    for (let n = 0; n < 5000; n++) {
      for (let expected = m.__atomic_load_n(a, 0); ;) {
        const r = m.__atomic_compare_exchange_n(a, 0, expected, expected + 1);
        if (r.ok) break;
        expected = r.expected;
      }
    }`);

  await runWorkers(source, sab, 4);

  assert.equal(new Uint32Array(sab)[0], 20000);
});
