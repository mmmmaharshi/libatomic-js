# libatomic-js

GCC libatomic's integer builtins, ported to JavaScript on top of `SharedArrayBuffer` + `Atomics`.

```js
import { __atomic_fetch_add, __atomic_load_n } from './src/libatomic.js';

const counter = new Uint32Array(new SharedArrayBuffer(4));
__atomic_fetch_add(counter, 0, 1);
__atomic_load_n(counter, 0); // 1
```

The typed array replaces libatomic's `(size, ptr)` pair: its element type gives the width
(1, 2, 4 or 8 bytes) and its construction guarantees the alignment, so the second argument is
just an index. Types are JSDoc, checked by `npm run typecheck` and shipped as
`dist/libatomic.d.ts`.

## API

| Ported | Notes |
| --- | --- |
| `__atomic_load_n`, `__atomic_store_n`, `__atomic_exchange_n` | |
| `__atomic_compare_exchange_n` | returns `{ ok: true }`, or `{ ok: false, expected }` with the value found. No `weak` argument: one attempt never fails spuriously |
| `__atomic_fetch_add` / `_sub` / `_and` / `_or` / `_xor` | return the previous value |
| `__atomic_fetch_nand` | CAS loop, since `Atomics` has no `nand` |
| `__atomic_test_and_set`, `__atomic_clear` | flag-byte helpers; take 8/16/32-bit views, not BigInt views |
| `__atomic_is_lock_free` | true for sizes 1/2/4/8; throws on a non-positive or non-integer size |

Retrying a compare-exchange reads the observed value instead of having it written back the way
C's `T *expected` works:

```js
for (let expected = 0; ;) {
  const r = __atomic_compare_exchange_n(counter, 0, expected, 7);
  if (r.ok) break;
  expected = r.expected;
}
```

## Differences from C

- **Sequentially consistent only, and no `memorder` argument.** Every `Atomics` operation is
  seq_cst, so there is nothing to tune; a dropped argument would only suggest otherwise. Ported
  call sites that still pass one keep working, because JS ignores extra arguments.
- **Values must match the view.** `__atomic_store_n(bigUint64, 0, 5)` is a type error and a
  runtime `TypeError`; use `5n`. The element type flows back out of the loaders.
- **Stores wrap, compare-exchanges do not.** `__atomic_store_n(u8, 0, 256)` stores `0`, but
  `__atomic_compare_exchange_n(u8, 0, 256, 1)` compares exactly and reports `ok: false` with
  `expected: 0`. Signed views behave the same way: `255` and `-1` are one bit pattern, and only
  `-1` matches. Compare against what a load returned and this never comes up.
- **Not ported:**
  - 16-byte (`__int128`) operations — JS has no 16-byte atomic.
  - `__atomic_thread_fence` / `__atomic_signal_fence` — no JS equivalent, and per-operation
    seq_cst makes them redundant. Absent rather than exported as silent no-ops.
  - `__atomic_always_lock_free` (a compile-time constant) and the generic memory-buffer forms
    (`__atomic_load`, `__atomic_store`, `__atomic_compare_exchange`), which add nothing once
    the typed array carries the size.

## Verify

```
npm test        # behaviour, including cross-thread atomicity
npm run typecheck
npm run build   # emits dist/libatomic.d.ts; also runs on install
```
