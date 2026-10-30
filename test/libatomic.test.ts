import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import {
  load,
  store,
  exchange,
  compareExchange,
  fetchAdd,
  fetchSub,
  fetchAnd,
  fetchOr,
  fetchXor,
  fetchNand,
  addFetch,
  subFetch,
  andFetch,
  orFetch,
  xorFetch,
  nandFetch,
  testAndSet,
  clear,
  threadFence,
  signalFence,
  isLockFree,
  alwaysLockFree,
  load128,
  store128,
  exchange128,
  compareExchange128,
  fetchAdd128,
  addFetch128,
} from '../src/libatomic.ts';

const bytes = (n: number) => new Uint8Array(new SharedArrayBuffer(n));
const moduleUrl = new URL('../src/libatomic.ts', import.meta.url).href;

// The worker source is a string, so the names it calls are checked here instead.
type Api = typeof import('../src/libatomic.ts');
const LOAD = 'load' satisfies keyof Api;
const FETCH_ADD = 'fetchAdd' satisfies keyof Api;
const COMPARE_EXCHANGE = 'compareExchange' satisfies keyof Api;

const counterWorker = (body: string) => `
  const { parentPort, workerData } = require('node:worker_threads');
  (async () => {
    const m = await import(${JSON.stringify(moduleUrl)});
    const a = new Uint32Array(workerData);
    ${body}
    parentPort.postMessage('done');
  })();`;

async function runWorkers(source: string, workerData: SharedArrayBuffer, count: number): Promise<void> {
  await Promise.all(Array.from({ length: count }, () => new Promise<void>((resolve, reject) => {
    const worker = new Worker(source, { eval: true, workerData });
    let reported = false;
    worker.once('message', () => {
      reported = true;
      resolve();
    });
    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (!reported) reject(new Error(`worker exited (${code}) without reporting`));
    });
  })));
}

test('load and store', () => {
  const a = bytes(1);
  store(a, 0, 42);
  assert.equal(load(a, 0), 42);

  const big = new BigUint64Array(new SharedArrayBuffer(8));
  store(big, 0, 9007199254740993n);
  assert.equal(load(big, 0), 9007199254740993n);
});

test('exchange returns the previous value', () => {
  const a = bytes(4);
  store(a, 0, 7);
  assert.equal(exchange(a, 0, 9), 7);
  assert.equal(load(a, 0), 9);
});

test('compareExchange reports success and the observed value', () => {
  const a = bytes(1);
  store(a, 0, 5);

  assert.deepEqual(compareExchange(a, 0, 5, 6), { ok: true });
  assert.equal(load(a, 0), 6);

  assert.deepEqual(compareExchange(a, 0, 5, 7), { ok: false, expected: 6 });
  assert.equal(load(a, 0), 6);
});

test('fetch operations return the old value and wrap at the element width', () => {
  const a = bytes(1);
  store(a, 0, 250);
  assert.equal(fetchAdd(a, 0, 10), 250);
  assert.equal(load(a, 0), 4);
  assert.equal(fetchSub(a, 0, 6), 4);
  assert.equal(load(a, 0), 254);

  store(a, 0, 0b1100);
  assert.equal(fetchAnd(a, 0, 0b1010), 12);
  assert.equal(load(a, 0), 0b1000);
  assert.equal(fetchOr(a, 0, 0b0011), 8);
  assert.equal(fetchXor(a, 0, 0b1111), 11);
  assert.equal(load(a, 0), 4);
});

test('fetchNand computes ~(old & val)', () => {
  const a = bytes(1);
  store(a, 0, 0b1100);
  assert.equal(fetchNand(a, 0, 0b1010), 12);
  assert.equal(load(a, 0), 0b11110111);
});

test('fetchNand carries 64-bit values', () => {
  const a = new BigUint64Array(new SharedArrayBuffer(8));
  store(a, 0, 0b1100n);
  assert.equal(fetchNand(a, 0, 0b1010n), 12n);
  assert.equal(load(a, 0), 0xfffffffffffffff7n);
});

test('fetchNand rejects a value of the wrong type', () => {
  const a = new Uint32Array(new SharedArrayBuffer(4));
  // @ts-expect-error a BigInt value is not allowed on a number view
  assert.throws(() => fetchNand(a, 0, 1n), { name: 'TypeError', message: /must match the view/ });
});

test('addFetch and friends return the new value and wrap at the width', () => {
  const a = bytes(1);
  store(a, 0, 250);
  assert.equal(addFetch(a, 0, 10), 4);
  assert.equal(subFetch(a, 0, 6), 254);
  assert.equal(load(a, 0), 254);

  store(a, 0, 0b1100);
  assert.equal(andFetch(a, 0, 0b1010), 0b1000);
  assert.equal(orFetch(a, 0, 0b0011), 0b1011);
  assert.equal(xorFetch(a, 0, 0b1111), 0b0100);

  const s = new Int8Array(new SharedArrayBuffer(1));
  store(s, 0, 120);
  assert.equal(addFetch(s, 0, 10), -126);
});

test('nandFetch returns the stored value', () => {
  const a = bytes(1);
  store(a, 0, 0b1100);
  assert.equal(nandFetch(a, 0, 0b1010), 0b11110111);
  assert.equal(load(a, 0), 0b11110111);
});

test('*_fetch carry 64-bit values', () => {
  const a = new BigUint64Array(new SharedArrayBuffer(8));
  store(a, 0, 1n);
  assert.equal(addFetch(a, 0, 2n), 3n);
  assert.equal(nandFetch(a, 0, 0n), 0xffffffffffffffffn);
});

test('*_fetch wrap at 32 bits too', () => {
  const a = new Int32Array(new SharedArrayBuffer(4));
  store(a, 0, 2147483647);
  assert.equal(addFetch(a, 0, 1), -2147483648);
  assert.equal(subFetch(a, 0, 1), 2147483647);
});

test('fences and alwaysLockFree exist for parity', () => {
  threadFence();
  signalFence();
  assert.equal(alwaysLockFree(8), isLockFree(8));
  assert.equal(alwaysLockFree(16), false);
});

test('float views load, store and exchange atomically', () => {
  const a = new Float32Array(new SharedArrayBuffer(4));
  store(a, 0, 1.5);
  assert.equal(load(a, 0), 1.5);
  assert.equal(exchange(a, 0, 2.25), 1.5);
  assert.equal(load(a, 0), 2.25);
  assert.deepEqual(compareExchange(a, 0, 2.25, 3.0), { ok: true });
  assert.deepEqual(compareExchange(a, 0, 99.0, 4.0), { ok: false, expected: 3.0 });
});

test('float fetchAdd and addFetch return old and new values', () => {
  const a = new Float64Array(new SharedArrayBuffer(8));
  store(a, 0, 1.0);
  assert.equal(fetchAdd(a, 0, 2.0), 1.0);
  assert.equal(load(a, 0), 3.0);
  assert.equal(addFetch(a, 0, 4.0), 7.0);
  assert.equal(load(a, 0), 7.0);
});

test('128-bit values load, store and exchange', () => {
  const buf = new Uint8Array(new SharedArrayBuffer(32));
  store128(buf, 0, 1n);
  assert.equal(load128(buf, 0), 1n);
  assert.equal(exchange128(buf, 0, 2n), 1n);
  assert.equal(load128(buf, 0), 2n);
  assert.deepEqual(compareExchange128(buf, 0, 2n, 3n), { ok: true });
  assert.equal(load128(buf, 0), 3n);
});

test('128-bit fetch and new-value ops wrap at 128 bits', () => {
  const buf = new Uint8Array(new SharedArrayBuffer(32));
  store128(buf, 0, (1n << 127n));
  assert.equal(fetchAdd128(buf, 0, (1n << 127n)), 1n << 127n);
  assert.equal(load128(buf, 0), 0n);
  assert.equal(addFetch128(buf, 0, 5n), 5n);
  assert.equal(load128(buf, 0), 5n);
});

test('testAndSet and clear drive a flag byte', () => {
  const a = bytes(1);
  assert.equal(testAndSet(a, 0), false);
  assert.equal(testAndSet(a, 0), true);
  clear(a, 0);
  assert.equal(load(a, 0), 0);
});

test('reports which widths are lock-free and rejects invalid sizes', () => {
  assert.equal(isLockFree(8), true);
  assert.equal(isLockFree(16), false);
  assert.throws(() => isLockFree(0), RangeError);
  // @ts-expect-error a string is not a size
  assert.throws(() => isLockFree('8'), RangeError);
});

test('fetch_add is atomic across worker threads', async () => {
  const sab = new SharedArrayBuffer(4);
  const source = counterWorker(`for (let i = 0; i < 20000; i++) m.${FETCH_ADD}(a, 0, 1);`);

  await runWorkers(source, sab, 4);

  assert.equal(new Uint32Array(sab)[0], 80000);
});

test('compareExchange retry loop converges across worker threads', async () => {
  const sab = new SharedArrayBuffer(4);
  const source = counterWorker(`
    for (let n = 0; n < 5000; n++) {
      for (let expected = m.${LOAD}(a, 0); ;) {
        const r = m.${COMPARE_EXCHANGE}(a, 0, expected, expected + 1);
        if (r.ok) break;
        expected = r.expected;
      }
    }`);

  await runWorkers(source, sab, 4);

  assert.equal(new Uint32Array(sab)[0], 20000);
});
