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
just an index. The module ships JSDoc types; `npm run typecheck` checks them with `tsc`.

## API

| Ported | Notes |
| --- | --- |
| `__atomic_load_n`, `__atomic_store_n`, `__atomic_exchange_n` | |
| `__atomic_compare_exchange_n` | returns `{ ok: true }`, or `{ ok: false, expected }` with the value found. No `weak` argument: one attempt never fails spuriously |
| `__atomic_fetch_add` / `_sub` / `_and` / `_or` / `_xor` | return the previous value |
| `__atomic_fetch_nand` | CAS loop, since `Atomics` has no `nand` |
| `__atomic_test_and_set`, `__atomic_clear` | flag-byte helpers |
| `__atomic_is_lock_free` | true for sizes 1/2/4/8; throws on a non-positive or non-integer size |
| `__ATOMIC_RELAXED` … `__ATOMIC_SEQ_CST` | `0`…`5` |

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

- **Sequentially consistent only.** Every `Atomics` operation is seq_cst, so a `memorder` is
  checked for validity and then ignored rather than pretending to be weaker.
- **Values follow the typed array.** Use `Uint8Array`/`Uint16Array`/`Uint32Array`/`BigUint64Array`
  for the unsigned bit patterns libatomic returns; signed views give two's complement.
  8-byte operations need `BigInt` values.
- **Not ported:**
  - 16-byte (`__int128`) operations — JS has no 16-byte atomic.
  - `__atomic_thread_fence` / `__atomic_signal_fence` — no JS equivalent, and per-operation
    seq_cst makes them redundant. Absent rather than exported as silent no-ops.
  - `__atomic_always_lock_free` (a compile-time constant) and the generic memory-buffer forms
    (`__atomic_load`, `__atomic_store`, `__atomic_compare_exchange`), which add nothing once
    the typed array carries the size.

## Verify

```
npm test
npm run typecheck
```
