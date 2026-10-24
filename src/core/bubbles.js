// Drives the bubble (emboss) of the buttons that sit on one glass sheet:
// the two most raised buttons each get a bulge slot, so the one being left
// deflates while the next one inflates. Used by every component whose
// buttons swell out of its own glass (PackagingPanel rows, Toolbar).
import { setBulge } from './look.js';

// How far a button is raised (0 to 1).
export const raised = b => b.emboss ? Math.abs(b.bulge) / b.lift : b.hover ?? 0;

/**
 * @param {THREE.ShaderMaterial} m   the sheet's glass material
 * @param {Button[]} buttons          emboss buttons, positioned in the sheet's local space
 * @returns {Button[]} the buttons ranked by how raised they are
 */
export function driveBubbles(m, buttons) {
  const ranked = buttons.filter(b => b.emboss && raised(b) > 0.001).sort((a, b) => raised(b) - raised(a));
  for (let i = 0; i < 2; i++) {
    const b = ranked[i];
    if (!b) { setBulge(m, i); continue; }
    setBulge(m, i, {
      x: b.position.x, y: b.position.y, hw: b.w / 2, hh: b.h / 2, r: b.embossRadius,
      height: b.bulge, scale: b.k,
      dent: b.dent && { ...b.dent, x: b.position.x + b.dent.x, y: b.position.y + b.dent.y },
      glow: b.glow,
    });
  }
  return ranked;
}
