/** Area-weighted modal color cluster for the actual visible thumbnail.
 * A perceptual radius joins compression/lighting variants of one color;
 * near-black, near-white and grayscale pixels are excluded before voting.
 * Eligible colors still vote only by visible area; no saturation weighting.
 */
export type OrigamiRgb = readonly [number, number, number];

const RADIUS = .075;
type Bin = { count: number; r: number; g: number; b: number; };
type Sample = Bin & { lab: OrigamiRgb; total: Bin; };
const linear = (value: number) => {
    const v = value / 255;
    return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
};
function oklab(r: number, g: number, b: number): OrigamiRgb {
    const x = linear(r), y = linear(g), z = linear(b);
    const l = Math.cbrt(.4122214708 * x + .5363325363 * y + .0514459929 * z);
    const m = Math.cbrt(.2119034982 * x + .6806995451 * y + .1073969566 * z);
    const s = Math.cbrt(.0883024619 * x + .2817188376 * y + .6299787005 * z);
    return [
        .2104542553 * l + .7936177850 * m - .0040720468 * s,
        1.9779984951 * l - 2.4285922050 * m + .4505937099 * s,
        .0259040371 * l + .7827717662 * m - .8086757660 * s
    ];
}
const RADIUS_SQUARED = RADIUS * RADIUS;
// Conservative floating-point margin only for bounding-box pruning. Leaf
// comparisons retain the original exact squared-distance predicate.
const BOUND_MARGIN = 1e-14;
interface Node {
    min: OrigamiRgb;
    max: OrigamiRgb;
    sum: Bin;
    lazy: Bin;
    size: number;
    samples?: Sample[];
    children?: readonly [Node, Node];
}

function emptyBin(): Bin { return { count: 0, r: 0, g: 0, b: 0 }; }

function add(target: Bin, source: Bin): void {
    target.count += source.count;
    target.r += source.r;
    target.g += source.g;
    target.b += source.b;
}

function* buildTree(samples: Sample[]): Generator<void, Node> {
    const min: [number, number, number] = [Infinity, Infinity, Infinity];
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    const sum = emptyBin();
    for (const sample of samples) {
        for (let axis = 0; axis < 3; axis++) {
            min[axis] = Math.min(min[axis], sample.lab[axis]);
            max[axis] = Math.max(max[axis], sample.lab[axis]);
        }
        add(sum, sample);
    }
    const common = { min, max, sum, lazy: emptyBin(), size: samples.length };
    yield;
    if (samples.length <= 16) return { ...common, samples };
    let axis = 0;
    for (let i = 1; i < 3; i++) if (max[i] - min[i] > max[axis] - min[axis]) axis = i;
    samples.sort((a, b) => a.lab[axis] - b.lab[axis]);
    const middle = samples.length >>> 1;
    yield;
    const left = yield* buildTree(samples.slice(0, middle));
    const right = yield* buildTree(samples.slice(middle));
    return { ...common, children: [left, right] };
}

/** Visit pairs of disjoint subtrees once. Fully enclosed node pairs add the
 * aggregate to all members lazily, instead of enumerating their pixels. */
function* accumulate(root: Node): Generator<void> {
    const pending: Array<readonly [Node, Node]> = [[root, root]];
    let visited = 0;
    while (pending.length) {
        if (++visited % 64 === 0) yield;
        const [left, right] = pending.pop()!;
        const lmin = left.min, lmax = left.max, rmin = right.min, rmax = right.max;
        const ll = lmin[0] - rmax[0], lr = lmax[0] - rmin[0];
        const al = lmin[1] - rmax[1], ar = lmax[1] - rmin[1];
        const bl = lmin[2] - rmax[2], br = lmax[2] - rmin[2];
        const dl = ll > 0 ? ll : lr < 0 ? lr : 0;
        const da = al > 0 ? al : ar < 0 ? ar : 0;
        const db = bl > 0 ? bl : br < 0 ? br : 0;
        if (dl * dl + da * da + db * db > RADIUS_SQUARED + BOUND_MARGIN) continue;
        const far = Math.max(ll * ll, lr * lr) + Math.max(al * al, ar * ar) + Math.max(bl * bl, br * br);
        if (far < RADIUS_SQUARED - BOUND_MARGIN) {
            add(left.lazy, right.sum);
            if (left !== right) add(right.lazy, left.sum);
            continue;
        }
        if (left === right && left.children) {
            pending.push([left.children[0], left.children[0]], [left.children[0], left.children[1]], [left.children[1], left.children[1]]);
        } else if (left.children && (!right.children || left.size >= right.size)) {
            pending.push([left.children[0], right], [left.children[1], right]);
        } else if (right.children) {
            pending.push([left, right.children[0]], [left, right.children[1]]);
        } else if (left.samples && right.samples) {
            for (let i = 0; i < left.samples.length; i++) {
                const a = left.samples[i];
                const same = left === right;
                if (same) add(a.total, a);
                const l = a.lab[0], u = a.lab[1], v = a.lab[2];
                for (let j = same ? i + 1 : 0; j < right.samples.length; j++) {
                    const b = right.samples[j];
                    const dl = l - b.lab[0], da = u - b.lab[1], db = v - b.lab[2];
                    if (dl * dl + da * da + db * db <= RADIUS_SQUARED) {
                        add(a.total, b);
                        add(b.total, a);
                    }
                }
            }
        }
    }
}

function propagate(node: Node, parent: Bin): void {
    add(node.lazy, parent);
    if (node.children) {
        propagate(node.children[0], node.lazy);
        propagate(node.children[1], node.lazy);
    } else if (node.samples) {
        for (const sample of node.samples) add(sample.total, node.lazy);
    }
}

function* computeColor(pixels: ArrayLike<number>): Generator<void, OrigamiRgb | null> {
    const bins = new Map<number, Bin>();
    for (let i = 0; i + 3 < pixels.length; i += 4) {
        if (i > 0 && i % 16384 === 0) yield;
        const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2], a = pixels[i + 3];
        if (a === 0) continue;
        const low = Math.min(r, g, b), high = Math.max(r, g, b);
        // Reject neutral paper/black backgrounds and compression noise.
        // Keep dark or pastel colors if they have meaningful channel separation.
        if (high <= 32 || low >= 235 || high - low < 24) continue;
        // Eligible pixels vote only by visible coverage.
        const key = (r >> 3) * 1024 + (g >> 3) * 32 + (b >> 3);
        let bin = bins.get(key);
        if (!bin) bins.set(key, bin = { count: 0, r: 0, g: 0, b: 0 });
        bin.count += a;
        bin.r += r * a;
        bin.g += g * a;
        bin.b += b * a;
    }
    if (!bins.size) return null;

    // Preserve original RGB-bucket order for deterministic equal-weight ties.
    const samples: Sample[] = [...bins].sort(([a], [b]) => a - b).map(([, bin]) => ({
        ...bin, lab: oklab(bin.r / bin.count, bin.g / bin.count, bin.b / bin.count), total: emptyBin()
    }));
    yield;
    const tree = yield* buildTree([...samples]);
    yield* accumulate(tree);
    propagate(tree, emptyBin());
    let best = emptyBin();
    for (const sample of samples) if (sample.total.count > best.count) best = sample.total;
    return best.count ? [
        Math.round(best.r / best.count),
        Math.round(best.g / best.count),
        Math.round(best.b / best.count)
    ] : null;
}

/** Synchronous exact reference for deterministic unit tests. */
export function dominantThumbnailColor(pixels: ArrayLike<number>): OrigamiRgb | null {
    const work = computeColor(pixels);
    for (;;) {
        const step = work.next();
        if (step.done) return step.value;
    }
}

/** Cooperative renderer path: no lower-resolution or approximate High mode. */
export async function dominantThumbnailColorAsync(pixels: ArrayLike<number>, cancelled: () => boolean): Promise<OrigamiRgb | null> {
    const work = computeColor(pixels);
    let sliceStarted = performance.now();
    for (;;) {
        if (cancelled()) return null;
        const step = work.next();
        if (step.done) return step.value;
        if (performance.now() - sliceStarted >= 8) {
            await new Promise<void>(resolve => setTimeout(resolve, 0));
            sliceStarted = performance.now();
        }
    }
}
