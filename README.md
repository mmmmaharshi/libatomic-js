# libatomic-js

TypeScript port of GCC libatomic's integer builtins. It runs on `SharedArrayBuffer` and `Atomics`,
and Bun strips the types at run time, so there is no build step and no `dist`.

```ts
import { __atomic_fetch_add, __atomic_load_n } from './src/libatomic.ts';

const counter = new Uint32Array(new SharedArrayBuffer(4));
__atomic_fetch_add(counter, 0, 1);
__atomic_load_n(counter, 0); // 1
```

A typed array replaces libatomic's `(size, ptr)` pair. Its element type gives the width, 1, 2, 4
or 8 bytes, and its construction fixes the alignment that C only assumes, so the second argument
is an index. Types follow the element through. A `BigUint64Array` load returns `bigint`, passing
a number to it fails to compile, and a view over a plain `ArrayBuffer` fails to compile because
it would share nothing with another thread. `tsc --noEmit` checks these rules.

## API

| Ported | Notes |
| --- | --- |
| `__atomic_load_n`, `__atomic_store_n`, `__atomic_exchange_n` | |
| `__atomic_compare_exchange_n` | returns `{ ok: true }`, or `{ ok: false, expected }` with the value it found. No `weak` argument, because one attempt never fails spuriously |
| `__atomic_fetch_add` / `_sub` / `_and` / `_or` / `_xor` | return the previous value |
| `__atomic_fetch_nand` | a CAS loop, because `Atomics` has no `nand` |
| `__atomic_test_and_set`, `__atomic_clear` | byte views only, `Int8Array` or `Uint8Array`, because C addresses one byte |
| `__atomic_is_lock_free` | true for 1, 2, 4 and 8 byte sizes. Throws on a non-positive or non-integer size |

Retrying a compare-exchange reads the value it observed. C writes that value back through
`T *expected` instead.

```ts
for (let expected = 0; ;) {
  const r = __atomic_compare_exchange_n(counter, 0, expected, 7);
  if (r.ok) break;
  expected = r.expected;
}
```

## Differences from C

- Operations are sequentially consistent and take no `memorder` argument. `Atomics` is seq_cst,
  so there was nothing for that argument to tune. C call sites that still pass one keep working,
  because JS ignores extra arguments.
- Values must match the view. `__atomic_store_n(bigUint64, 0, 5)` fails to compile and throws a
  runtime `TypeError`. Pass `5n` instead.
- Stores wrap and compare-exchanges do not. `__atomic_store_n(u8, 0, 256)` stores `0`, while
  `__atomic_compare_exchange_n(u8, 0, 256, 1)` compares exactly and reports `ok: false` with
  `expected: 0`. Signed views work the same way. `255` and `-1` are one bit pattern, and only
  `-1` matches. Compare against the value a load returned and the difference never comes up.
- Not ported:
  - 16-byte `__int128` operations, because JS has no 16-byte atomic.
  - `__atomic_thread_fence` and `__atomic_signal_fence`. They have no JS equivalent, and
    operation-level seq_cst makes them redundant. Leaving them out beats exporting no-ops.
  - `__atomic_always_lock_free`, a compile-time constant, and the generic memory-buffer forms
    `__atomic_load`, `__atomic_store` and `__atomic_compare_exchange`. They add nothing once the
    typed array carries the size.

## Verify

```
bun test              # behaviour, including cross-thread atomicity
bun run typecheck     # tsc --noEmit over src and the type-only checks
```
