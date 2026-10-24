// Drives the bubble (emboss) of the buttons that sit on one glass sheet:
// each contact gets a dent slot, and recovering rows deflate in place. Used by every component whose
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
  const slots = ranked.flatMap(b => [
    {b,dent:b.dent,glow:b.glow},
    ...(b.contactDents ?? []).map(dent=>({b,dent,glow:dent.glow})),
  ]).sort((a,b)=>Number(!!b.dent)-Number(!!a.dent));
  for (let i = 0; i < 12; i++) {
    const slot=slots[i], b=slot?.b;
    if (!b) { setBulge(m, i); continue; }
    setBulge(m, i, {
      x: b.position.x, y: b.position.y, hw: b.w / 2, hh: b.h / 2, r: b.embossRadius,
      height: b.bulge, scale: b.k,
      dent: slot.dent && { ...slot.dent, x: b.position.x + slot.dent.x, y: b.position.y + slot.dent.y },
      glow: slot.glow,
    });
  }
  return ranked;
}
