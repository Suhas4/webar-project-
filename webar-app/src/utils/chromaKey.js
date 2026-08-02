// Green-screen removal for the idle panda, applied per frame in a canvas.
//
// The clip ships as a plain H.264 MP4 with its green backdrop intact rather
// than as a VP9 WebM carrying a baked alpha channel. Baked alpha is far cheaper
// — zero JS, the compositor does the work — but it is not decoded universally:
// Safari/iOS happily plays such a file while ignoring the alpha layer entirely,
// which renders the panda as an opaque rectangle instead of a cutout. Keying
// here costs a couple of ms per frame and behaves identically everywhere.
//
// Tuned against the source clip, whose backdrop sampled a very consistent
// rgb(1,136,47) across every corner of every frame.

const KEY_R = 1;
const KEY_G = 136;
const KEY_B = 47;

// Squared RGB distances from the key colour. Below CLEAR the pixel is backdrop
// and goes fully transparent; between CLEAR and SOLID the alpha ramps, which
// keeps the artwork's antialiased outline from turning into a jagged edge.
//
// The ceiling matters: the panda's darkest navy sits about 103 away from the
// key, so cutting at 75 keeps real headroom. Widening it much further starts
// punching holes straight through the character's own outline.
const CLEAR = 53 * 53;
const SOLID = 75 * 75;
const RAMP  = 255 / (SOLID - CLEAR);

// Mutates `data` (an ImageData buffer) in place and returns it.
export function keyGreen(data) {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const dr = r - KEY_R;
    const dg = g - KEY_G;
    const db = b - KEY_B;
    const dist = dr * dr + dg * dg + db * db;

    if (dist <= CLEAR) {
      data[i + 3] = 0;
      continue;
    }
    if (dist < SOLID) {
      data[i + 3] = ((dist - CLEAR) * RAMP) | 0;
    }

    // Despill. Where the panda spins fast, motion blur smears the backdrop
    // across its edge; those blended pixels land too far from the key colour to
    // be cut, and without this they read as a green crescent hugging the
    // character. Suppress rather than cut, so the silhouette keeps its shape:
    // green is not allowed to exceed whichever of red/blue is larger. Nothing
    // in this artwork is legitimately green, so the only pixels this touches
    // are spill. Clamping to that ceiling (rather than driving green lower)
    // is what keeps the correction neutral instead of tinting it magenta.
    const limit = r > b ? r : b;
    if (g > limit) data[i + 1] = limit;
  }
  return data;
}
