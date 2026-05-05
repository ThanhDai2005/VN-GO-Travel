/**
 * Density Color Mapper (Shared Visual System)
 * Unified scale: White -> Light Green -> Dark Green
 */

export const DENSITY_SCALE = {
  QUIET: { label: 'Quiet', color: '#FFFFFF', stop: 0.0 },
  LOW: { label: 'Low', color: '#C8F7C5', stop: 0.25 },
  ACTIVE: { label: 'Active', color: '#7ED957', stop: 0.5 },
  BUSY: { label: 'Busy', color: '#006400', stop: 1.0 }
};

export function getDensityColor(intensity) {
  let i = Number(intensity);
  if (isNaN(i) || !isFinite(i)) i = 0;
  i = Math.max(0, Math.min(1, i));

  // Scale: 
  // 0.0 -> #FFFFFF
  // 0.25 -> #C8F7C5
  // 0.5 -> #7ED957
  // 0.75 -> #2ECC71
  // 1.0 -> #006400

  if (i <= 0.25) return interpolateColor('#FFFFFF', '#C8F7C5', i / 0.25);
  if (i <= 0.5) return interpolateColor('#C8F7C5', '#7ED957', (i - 0.25) / 0.25);
  if (i <= 0.75) return interpolateColor('#7ED957', '#2ECC71', (i - 0.5) / 0.25);
  return interpolateColor('#2ECC71', '#006400', (i - 0.75) / 0.25);
}

export function getDensityLabel(intensity) {
  if (intensity <= 0.2) return 'Quiet';
  if (intensity <= 0.5) return 'Low';
  if (intensity <= 0.8) return 'Active';
  return 'Busy';
}

function interpolateColor(color1, color2, factor) {
  const c1 = hexToRgb(color1);
  const c2 = hexToRgb(color2);

  const r = Math.round(c1.r + factor * (c2.r - c1.r));
  const g = Math.round(c1.g + factor * (c2.g - c1.g));
  const b = Math.round(c1.b + factor * (c2.b - c1.b));

  return `rgb(${r}, ${g}, ${b})`;
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 255, g: 255, b: 255 };
}
