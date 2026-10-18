// sprite.js — the 16-bit style pixel hero.
//
// The hero is drawn from the little text map below. Each letter is one
// pixel; the PALETTE says what color each letter is. Change a letter to
// redraw a pixel. The hero gently bobs and blinks (see .sprite in
// styles.css), and does a small hop when you finish a quest.

// 19 pixels wide, 20 tall. A hooded ranger with a bow on the right.
const MAP = [
  '......oooo.........',
  '....oohhhhoo.......',
  '...ohhhhhhhho......',
  '..ohhhrrrrhhho.w...',
  '..ohhrssssrhho.lw..',
  '..ohrsesseshro.l.w.',
  '..ohrssssssrho.l.w.',
  '..ohhsssSsshho.l.w.',
  '...ohhSSSShho..l.w.',
  '..oHhhttttttHo.l.w.',
  '.ohHtttTtttthHol.w.',
  '.ohHttTtttttHhol.w.',
  '.oHsbbbgbbbbsHol.w.',
  '.oHhTttttttThHol.w.',
  '..oHppppppppHo.lw..',
  '..oHpppoopppHo.w...',
  '...oppo..oppo......',
  '...oBBo..oBBo......',
  '..oBBBo..oBBBo.....',
  '..ooooo..ooooo.....',
];

// The eyes, so the blink can cover them for a moment.
const EYES = [[6, 5], [9, 5]];

/* Color choices, picked in Settings → Your hero. Each has [main, shade]. */
export const SKIN = {
  light: ['#f1d0b0', '#d9ae8c'],
  medium: ['#d9a77c', '#b8845c'],
  tan: ['#c08a5c', '#9a6a42'],
  brown: ['#8d5a3b', '#6e4229'],
  deep: ['#5e3a26', '#462a1b'],
};
export const HAIR = {
  black: '#1f1a17',
  brown: '#5a3a22',
  auburn: '#8a3c1f',
  blonde: '#c9a250',
  red: '#a3401d',
  gray: '#9a9590',
};
export const CLOAK = {
  forest: ['#3f6b3a', '#2c4d28'],
  crimson: ['#7a2d2d', '#5a1f1f'],
  river: ['#34506e', '#243a52'],
  plum: ['#5e3a63', '#432947'],
  earth: ['#6e4e2c', '#523920'],
};

function palette(hero) {
  const skin = SKIN[hero.skin] || SKIN.medium;
  const cloak = CLOAK[hero.cloak] || CLOAK.forest;
  return {
    o: '#2a1a10',          // outline
    e: '#2a1a10',          // eyes
    h: cloak[0], H: cloak[1],
    s: skin[0], S: skin[1],
    r: HAIR[hero.hair] || HAIR.brown,
    t: '#7a5a34', T: '#5e4426', // tunic
    b: '#3b2414', g: '#e2b75c', // belt and buckle
    p: '#4a3a2a',          // trousers
    B: '#3b2414',          // boots
    w: '#8a5a2a',          // bow
    l: '#e8dcc0',          // bowstring
  };
}

/**
 * The hero as an SVG string. `scale` = screen pixels per art pixel.
 * Runs of the same color in a row are joined into one rectangle to keep
 * the drawing small.
 */
export function heroSVG(hero, scale = 5) {
  const colors = palette(hero);
  const rects = [];
  MAP.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let run = 1;
      while (row[x + run] === ch) run += 1;
      if (colors[ch]) rects.push(`<rect x="${x}" y="${y}" width="${run}" height="1" fill="${colors[ch]}"/>`);
      x += run;
    }
  });
  const blink = EYES.map(([x, y]) => `<rect x="${x}" y="${y}" width="1" height="1" fill="${colors.s}"/>`).join('');
  const w = MAP[0].length;
  const h = MAP.length;
  return `
    <svg class="sprite" viewBox="0 0 ${w} ${h}" width="${w * scale}" height="${h * scale}"
      shape-rendering="crispEdges" role="img" aria-label="${hero.name} the ${hero.cls}">
      <g class="sprite-body">${rects.join('')}<g class="sprite-blink">${blink}</g></g>
    </svg>`;
}

/** Make the hero on screen do a little hop (after a quest). */
export function hop() {
  document.querySelectorAll('.sprite').forEach((el) => {
    el.classList.remove('hop');
    void el.getBoundingClientRect(); // restart the animation
    el.classList.add('hop');
  });
}
