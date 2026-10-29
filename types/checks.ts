// Type-only checks, never run. `bun run typecheck` fails if a line marked as an
// expected error starts compiling cleanly, so these assertions cannot rot.
import {
  addFetch,
  subFetch,
  andFetch,
  orFetch,
  xorFetch,
  nandFetch,
  fetchNand,
  load,
  store,
  testAndSet,
} from '../src/libatomic.ts';

const counter = new Uint32Array(new SharedArrayBuffer(4));
const wide = new BigUint64Array(new SharedArrayBuffer(8));

// @ts-expect-error a number cannot go into a BigInt view
store(wide, 0, 5);
// @ts-expect-error a BigInt cannot go into a number view
store(counter, 0, 5n);
// @ts-expect-error the nand value follows the view too
fetchNand(counter, 0, 5n);
// @ts-expect-error the new-value nand follows the view too
nandFetch(counter, 0, 5n);
// @ts-expect-error flag helpers take byte views, not BigInt views
testAndSet(wide, 0);
// @ts-expect-error a 32-bit flag view would clobber the rest of the word
testAndSet(new Uint32Array(new SharedArrayBuffer(4)), 0);
// @ts-expect-error the new-value add follows the view too
addFetch(counter, 0, 5n);
// @ts-expect-error the new-value sub follows the view too
subFetch(counter, 0, 5n);
// @ts-expect-error the new-value and follows the view too
andFetch(counter, 0, 5n);
// @ts-expect-error the new-value or follows the view too
orFetch(counter, 0, 5n);
// @ts-expect-error the new-value xor follows the view too
xorFetch(counter, 0, 5n);

// The element type flows back out, so arithmetic needs no narrowing.
const small = load(counter, 0) + 1;
const large = load(wide, 0) + 1n;
export const sums = [small, large];
