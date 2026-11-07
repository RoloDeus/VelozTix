export interface IClock {
  now(): Date;
  nowMs(): number;
  toISOString(): string;
}

export class SystemClock implements IClock {
  now(): Date {
    return new Date();
  }
  nowMs(): number {
    return Date.now();
  }
  toISOString(): string {
    return new Date().toISOString();
  }
}

export class SimulatedClock implements IClock {
  private currentTimeMs: number;

  constructor(initialTimeMs?: number) {
    this.currentTimeMs = initialTimeMs ?? Date.now();
  }

  advanceSeconds(seconds: number): void {
    this.currentTimeMs += seconds * 1000;
  }

  advanceMs(ms: number): void {
    this.currentTimeMs += ms;
  }

  setTimeMs(ms: number): void {
    this.currentTimeMs = ms;
  }

  now(): Date {
    return new Date(this.currentTimeMs);
  }

  nowMs(): number {
    return this.currentTimeMs;
  }

  toISOString(): string {
    return new Date(this.currentTimeMs).toISOString();
  }
}

