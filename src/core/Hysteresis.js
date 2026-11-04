// Two lines instead of one: turn on when closer than `enter`, turn off only
// when further than `exit`. Inside the band the state keeps what it was, so a
// hand resting near the line does not make the state flicker.
export class Hysteresis {
  constructor(enter, exit) {
    if (exit < enter) throw new Error('Hysteresis: exit must be >= enter');
    this.enter = enter;
    this.exit = exit;
    this.on = false;
  }
  update(distance) {
    if (!this.on && distance < this.enter) this.on = true;
    else if (this.on && distance > this.exit) this.on = false;
    return this.on;
  }
}
