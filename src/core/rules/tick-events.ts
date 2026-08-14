export interface TickEvent {
  readonly type: string;
  readonly actorId?: string;
  readonly detail?: string;
  readonly x?: number;
  readonly y?: number;
  readonly targetId?: string;
  readonly amount?: number;
  readonly attackId?: string;
}
