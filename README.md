# libatomic-js

TypeScript port of GCC libatomic's integer builtins. It runs on `SharedArrayBuffer` and `Atomics`,
and Bun strips the types at run time, so there is no build step and no `dist`.

```
bunx jsr add @maharshi/libatomic-js
```

```ts
import { fetchAdd, load } from '@maharshi/libatomic-js';

const counter = new Uint32Array(new SharedArrayBuffer(4));
fetchAdd(counter, 0, 1);
load(counter, 0); // 1
```

A typed array replaces libatomic's `(size, ptr)` pair. Its element type gives the width, 1, 2, 4
or 8 bytes, and its construction fixes the alignment that C only assumes, so the second argument
is an index. Types follow the element through. A `BigUint64Array` load returns `bigint`, passing
a number to it fails to compile, and a view over a plain `ArrayBuffer` fails to compile because
it would share nothing with another thread. `tsc --noEmit` checks these rules.

## Runtimes

Deno, Node.js and Bun need no setup. In a browser, `SharedArrayBuffer` only exists on a
cross-origin isolated page, so serve it with `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp`. Cloudflare Workers has no `SharedArrayBuffer`, so it
is marked unsupported on JSR.

## API

The names are camelCase instead of GCC's `__atomic_*`, so the library reads like a JS library.
The right column is the whole mapping you need when porting a C call site.

| JavaScript | C builtin | Notes |
| --- | --- | --- |
| `load` | `__atomic_load_n` | |
| `store` | `__atomic_store_n` | |
| `exchange` | `__atomic_exchange_n` | returns the previous value |
| `compareExchange` | `__atomic_compare_exchange_n` | returns `{ ok: true }`, or `{ ok: false, expected }` with the value it found. No `weak` argument, because one attempt never fails spuriously |
| `fetchAdd` / `fetchSub` / `fetchAnd` / `fetchOr` / `fetchXor` | `__atomic_fetch_add`, `_sub`, `_and`, `_or`, `_xor` | return the previous value |
| `fetchNand` | `__atomic_fetch_nand` | a CAS loop, because `Atomics` has no `nand` |
| `testAndSet` / `clear` | `__atomic_test_and_set`, `__atomic_clear` | byte views only, `Int8Array` or `Uint8Array`, because C addresses one byte |
| `addFetch` / `subFetch` / `andFetch` / `orFetch` / `xorFetch` | `__atomic_add_fetch`, `_sub_fetch`, `_and_fetch`, `_or_fetch`, `_xor_fetch` | return the new value |
| `nandFetch` | `__atomic_nand_fetch` | return the new value; a CAS loop |
| `threadFence`, `signalFence` | `__atomic_thread_fence`, `__atomic_signal_fence` | no-ops: every operation is already sequentially consistent, so a fence has nothing left to order |
| `isLockFree` | `__atomic_is_lock_free` | true for 1, 2, 4 and 8 byte sizes. Throws on a non-positive or non-integer size |
| `alwaysLockFree` | `__atomic_always_lock_free` | same answer as `isLockFree`; JS has no compile-time variant to offer |

Retrying a compare-exchange reads the value it observed. C writes that value back through
`T *expected` instead.

```ts
for (let expected = 0; ;) {
  const r = compareExchange(counter, 0, expected, 7);
  if (r.ok) break;
  expected = r.expected;
}
```

## Differences from C

- Operations are sequentially consistent and take no `memorder` argument. `Atomics` is seq_cst,
  so there was nothing for that argument to tune. C call sites that still pass one keep working,
  because JS ignores extra arguments.
- Values must match the view. `store(bigUint64, 0, 5)` fails to compile and throws a
  runtime `TypeError`. Pass `5n` instead.
- Stores wrap and compare-exchanges do not. `store(u8, 0, 256)` stores `0`, while
  `compareExchange(u8, 0, 256, 1)` compares exactly and reports `ok: false` with
  `expected: 0`. Signed views work the same way. `255` and `-1` are one bit pattern, and only
  `-1` matches. Compare against the value a load returned and the difference never comes up.
- Not ported:
  - 16-byte `__int128` operations, because JS has no 16-byte atomic.
  - The generic memory-buffer forms `__atomic_load`, `__atomic_store` and `__atomic_compare_exchange`.
    They take a `(size, ptr)` pair and work on any data type, but the typed array already carries
    the size and the element type, so those are the same call with the size removed.
  - `__atomic_thread_fence` and `__atomic_signal_fence` are exported as no-ops, because every
    operation here is sequentially consistent and there is nothing left for a fence to order.

## Verify

```
bun test              # behaviour, including cross-thread atomicity
bun run typecheck     # tsc --noEmit over src and the type-only checks
```
