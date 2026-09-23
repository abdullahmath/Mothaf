import sharp from 'sharp';

/**
 * Generated placeholder panoramas.
 *
 * No photography of the Roman Theatre of Jableh was supplied with this build,
 * and inventing a photorealistic one would be worse than useless — it would
 * misrepresent a real heritage site. These are honestly abstract: correctly
 * formed 2:1 equirectangular images with a horizon, a sky and a ground, plus
 * enough structure that turning the view is legible and hotspot placement can
 * be judged.
 *
 * They exercise the whole pipeline — ingestion, variants, textures, hotspot
 * projection — and are replaced by dropping real panoramas into the media
 * library. Nothing in the code knows the difference.
 */

export type PanoramaRecipe = {
  /** Sky gradient, top to horizon. */
  skyTop: string;
  skyBottom: string;
  /** Ground gradient, horizon to nadir. */
  groundTop: string;
  groundBottom: string;
  /** Vertical elements suggesting architecture, as fractions of the width. */
  columns: number;
  columnColor: string;
  /** How far above the horizon the structures rise, as a fraction of height. */
  structureHeight: number;
  label: string;
};

/**
 * Full-size by default; overridable down to spare memory on a constrained
 * deploy target. Sharp holds the whole raster in memory while it rasterizes
 * and re-encodes the SVG, and that cost is quadratic in width — 4096×2048 is
 * fine on a dev machine but can OOM a 512MB instance rendering several scenes
 * back to back.
 */
const WIDTH = Number(process.env.SEED_PANORAMA_WIDTH) || 4096;
const HEIGHT = WIDTH / 2;

/**
 * Builds the SVG source.
 *
 * Everything is positioned in equirectangular space: the horizon is the
 * vertical midpoint, x maps linearly to yaw, and y maps linearly to pitch.
 * Elements are drawn with a horizontal repeat so the left and right edges meet
 * without a visible seam when wrapped onto the sphere.
 */
function buildSvg(recipe: PanoramaRecipe): string {
  const horizon = HEIGHT / 2;
  const structureTop = horizon - HEIGHT * recipe.structureHeight;

  const columns: string[] = [];
  for (let index = 0; index < recipe.columns; index += 1) {
    const centre = (index / recipe.columns) * WIDTH;
    // Columns thin toward the edges of each 90° quadrant, which reads as
    // perspective once the image is wrapped.
    const width = 26 + 16 * Math.abs(Math.cos((index / recipe.columns) * Math.PI * 2));
    const height = horizon - structureTop;
    columns.push(
      `<rect x="${(centre - width / 2).toFixed(1)}" y="${structureTop.toFixed(1)}" ` +
        `width="${width.toFixed(1)}" height="${height.toFixed(1)}" fill="${recipe.columnColor}" opacity="0.9"/>`,
      `<rect x="${(centre - width * 0.9).toFixed(1)}" y="${(structureTop - 14).toFixed(1)}" ` +
        `width="${(width * 1.8).toFixed(1)}" height="18" fill="${recipe.columnColor}" opacity="0.75"/>`,
    );
  }

  // Concentric arcs below the horizon, echoing a cavea seen from the orchestra.
  const tiers: string[] = [];
  for (let tier = 1; tier <= 7; tier += 1) {
    const y = horizon + (tier / 8) * (HEIGHT / 2) * 0.85;
    tiers.push(
      `<rect x="0" y="${y.toFixed(1)}" width="${WIDTH}" height="6" fill="#000" opacity="${(0.14 - tier * 0.012).toFixed(3)}"/>`,
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${recipe.skyTop}"/>
      <stop offset="100%" stop-color="${recipe.skyBottom}"/>
    </linearGradient>
    <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${recipe.groundTop}"/>
      <stop offset="100%" stop-color="${recipe.groundBottom}"/>
    </linearGradient>
    <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0.22"/>
    </linearGradient>
  </defs>

  <rect x="0" y="0" width="${WIDTH}" height="${horizon}" fill="url(#sky)"/>
  <rect x="0" y="${horizon}" width="${WIDTH}" height="${horizon}" fill="url(#ground)"/>

  ${columns.join('\n  ')}
  ${tiers.join('\n  ')}

  <rect x="0" y="${horizon - 160}" width="${WIDTH}" height="160" fill="url(#haze)"/>
  <rect x="0" y="${(horizon - 2).toFixed(0)}" width="${WIDTH}" height="4" fill="#ffffff" opacity="0.16"/>
</svg>`;
}

export async function renderPanorama(recipe: PanoramaRecipe): Promise<Buffer> {
  return sharp(Buffer.from(buildSvg(recipe)))
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
}

/** A flat 16:9 image, for covers and gallery placeholders. */
export async function renderFlatImage(
  recipe: Pick<PanoramaRecipe, 'skyTop' | 'skyBottom' | 'groundTop' | 'groundBottom' | 'columnColor'>,
  width = 1920,
): Promise<Buffer> {
  const height = Math.round((width * 9) / 16);
  const horizon = Math.round(height * 0.62);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <linearGradient id="s" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${recipe.skyTop}"/>
      <stop offset="100%" stop-color="${recipe.skyBottom}"/>
    </linearGradient>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${recipe.groundTop}"/>
      <stop offset="100%" stop-color="${recipe.groundBottom}"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${horizon}" fill="url(#s)"/>
  <rect y="${horizon}" width="${width}" height="${height - horizon}" fill="url(#g)"/>
  ${Array.from({ length: 9 }, (_, index) => {
    const x = (index / 9) * width + width * 0.03;
    const columnWidth = width * 0.028;
    const columnHeight = horizon * 0.42;
    return `<rect x="${x.toFixed(0)}" y="${(horizon - columnHeight).toFixed(0)}" width="${columnWidth.toFixed(0)}" height="${columnHeight.toFixed(0)}" fill="${recipe.columnColor}" opacity="0.85"/>`;
  }).join('\n  ')}
  <rect y="${horizon - 1}" width="${width}" height="2" fill="#ffffff" opacity="0.18"/>
</svg>`;

  return sharp(Buffer.from(svg)).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
}

/**
 * Recipes for the seeded scenes.
 *
 * The palettes are drawn from the site's real materials — basalt and limestone
 * under a Mediterranean sky — so the placeholders at least sit in the right
 * tonal range for the design around them.
 */
export const SCENE_RECIPES: Record<string, PanoramaRecipe> = {
  entrance: {
    skyTop: '#173a5e',
    skyBottom: '#7fa8c4',
    groundTop: '#4a4640',
    groundBottom: '#1d1b18',
    columns: 16,
    columnColor: '#8d8577',
    structureHeight: 0.2,
    label: 'entrance',
  },
  orchestra: {
    skyTop: '#12314f',
    skyBottom: '#96b6c9',
    groundTop: '#57514a',
    groundBottom: '#22201d',
    columns: 24,
    columnColor: '#9a9184',
    structureHeight: 0.26,
    label: 'orchestra',
  },
  cavea: {
    skyTop: '#1b4066',
    skyBottom: '#a8c2d2',
    groundTop: '#4f4b45',
    groundBottom: '#1a1917',
    columns: 32,
    columnColor: '#847c70',
    structureHeight: 0.3,
    label: 'cavea',
  },
  stage: {
    skyTop: '#0f2a46',
    skyBottom: '#87a9c0',
    groundTop: '#5b544c',
    groundBottom: '#201e1b',
    columns: 12,
    columnColor: '#a39a8b',
    structureHeight: 0.34,
    label: 'stage',
  },
};
