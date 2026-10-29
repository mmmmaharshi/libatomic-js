// Type-only checks, never run. `bun run typecheck` fails if a line marked as an
// expected error starts compiling cleanly, so these assertions cannot rot.
import {
  __atomic_fetch_nand,
  __atomic_load_n,
  __atomic_store_n,
  __atomic_test_and_set,
} from '../src/libatomic.ts';

const counter = new Uint32Array(new SharedArrayBuffer(4));
const wide = new BigUint64Array(new SharedArrayBuffer(8));

// @ts-expect-error a number cannot go into a BigInt view
__atomic_store_n(wide, 0, 5);
// @ts-expect-error a BigInt cannot go into a number view
__atomic_store_n(counter, 0, 5n);
// @ts-expect-error the nand value follows the view too
__atomic_fetch_nand(counter, 0, 5n);
// @ts-expect-error flag helpers take byte views, not BigInt views
__atomic_test_and_set(wide, 0);

// The element type flows back out, so arithmetic needs no narrowing.
const small = __atomic_load_n(counter, 0) + 1;
const large = __atomic_load_n(wide, 0) + 1n;
export const sums = [small, large];
