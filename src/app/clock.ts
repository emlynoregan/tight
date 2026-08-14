import { GLOBAL_CONSTANTS } from "../core/model/constants";

export interface ClockDecision {
  readonly shouldSimulate: boolean;
}

/**
 * Presentation frames are independent of the 1 Hz semantic tick.
 * Hidden-tab time is discarded: showing the page again does not catch up ticks.
 */
export class SimulationClock {
  readonly tickMs: number;
  private running = false;
  private hidden = false;
  private origin = 0;

  constructor(tickMs: number = 1000 / GLOBAL_CONSTANTS.simulationHz) {
    this.tickMs = tickMs;
  }

  start(now: number): void {
    this.running = true;
    this.origin = now;
  }

  stop(): void {
    this.running = false;
  }

  setHidden(hidden: boolean, now: number): void {
    if (hidden === this.hidden) {
      return;
    }
    this.hidden = hidden;
    if (!hidden) {
      this.origin = now;
    }
  }

  get isHidden(): boolean {
    return this.hidden;
  }

  get isRunning(): boolean {
    return this.running;
  }

  step(now: number): ClockDecision {
    if (!this.running || this.hidden) {
      return { shouldSimulate: false };
    }
    if (now - this.origin >= this.tickMs) {
      this.origin = now;
      return { shouldSimulate: true };
    }
    return { shouldSimulate: false };
  }
}
