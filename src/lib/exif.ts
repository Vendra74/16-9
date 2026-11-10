/**
 * Ficha técnica a partir dos dados EXIF que o seletor de fotos devolve.
 * No iOS os dados vêm agrupados ({Exif}, {TIFF}, {ExifAux}); no Android, num nível só.
 */
export type Gear = {
  camera: string;
  lens: string;
  focal_length: string;
  aperture: string;
  shutter: string;
  iso: string;
};

export const EMPTY_GEAR: Gear = { camera: '', lens: '', focal_length: '', aperture: '', shutter: '', iso: '' };

type Exif = Record<string, unknown>;

function flatten(exif: Exif): Exif {
  const out: Exif = {};
  for (const [key, value] of Object.entries(exif)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && key.startsWith('{')) {
      Object.assign(out, value as Exif);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function num(value: unknown): number | null {
  if (Array.isArray(value)) value = value[0];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    // Android às vezes manda frações: "28/10".
    const [a, b] = value.split('/').map(Number);
    const n = b ? a / b : a;
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function text(value: unknown) {
  return typeof value === 'string' ? value.replace(/\0/g, '').trim() : '';
}

function trimDecimal(n: number) {
  return String(Math.round(n * 10) / 10);
}

export function gearFromExif(raw: Exif | null | undefined): Gear {
  if (!raw) return EMPTY_GEAR;
  const e = flatten(raw);

  const make = text(e.Make);
  const model = text(e.Model);
  // Evita "Canon Canon EOS R5" e "Apple iPhone 15 Pro".
  const camera =
    make.toLowerCase() === 'apple' || model.toLowerCase().startsWith(make.toLowerCase())
      ? model
      : [make, model].filter(Boolean).join(' ');

  let lens = text(e.LensModel);
  // O iPhone descreve a lente como "iPhone 15 Pro back triple camera 6.765mm f/1.78".
  if (lens && model && lens.startsWith(model)) lens = lens.slice(model.length).trim();
  if (/^back\b.*camera/i.test(lens)) lens = 'Câmera traseira';
  else if (/^front\b.*camera/i.test(lens)) lens = 'Câmera frontal';

  const focal = num(e.FocalLength);
  const focal35 = num(e.FocalLenIn35mmFilm ?? e.FocalLengthIn35mmFilm);
  const aperture = num(e.FNumber);
  const exposure = num(e.ExposureTime);
  const iso = num(e.ISOSpeedRatings ?? e.PhotographicSensitivity ?? e.ISOSpeed);

  let shutter = '';
  if (exposure && exposure > 0) {
    shutter = exposure >= 1 ? `${trimDecimal(exposure)}s` : `1/${Math.round(1 / exposure)}s`;
  }

  return {
    camera,
    lens,
    focal_length: focal35 ? `${Math.round(focal35)}mm` : focal ? `${trimDecimal(focal)}mm` : '',
    aperture: aperture ? `f/${trimDecimal(aperture)}` : '',
    shutter,
    iso: iso ? String(Math.round(iso)) : '',
  };
}

/** "35mm · f/8 · 1/250s · ISO 100" */
export function settingsLine(g: Pick<Gear, 'focal_length' | 'aperture' | 'shutter' | 'iso'>) {
  return [g.focal_length, g.aperture, g.shutter, g.iso && `ISO ${g.iso}`].filter(Boolean).join(' · ');
}
