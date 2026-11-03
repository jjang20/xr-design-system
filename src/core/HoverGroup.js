// An explicit collection of peer items, never an inferred scene/container.
// Arbitration only chooses proximity feedback. All contact probes still reach
// each item's PressModel and additional-contact visuals.
export class HoverGroup {
  constructor(items, { hysteresis = .002 } = {}) {
    this.items = items;
    this.hysteresis = hysteresis; // trial world metres, independent of scale
    this.current = null;
  }

  update() {
    const candidates = this.items.map(item => ({ item, distance: item.proximityDistance() }))
      .filter(c => Number.isFinite(c.distance));
    let best = candidates.reduce((a, b) => !a || b.distance < a.distance ? b : a, null);
    const current = candidates.find(c => c.item === this.current);
    if (current && best && current.distance <= best.distance + this.hysteresis) best = current;
    this.current = best?.item ?? null;
    for (const item of this.items) item.groupHoverAllowed = item === this.current;
  }
}
