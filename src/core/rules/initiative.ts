import { compareStableIds, randomUint64, semantic } from "../generation/semantic-random";
import type { ActorState } from "../model/save-state";

export interface InitiativeEntry {
  readonly actorId: string;
  readonly score: number;
  readonly tieBreak: bigint;
}

export function initiativeOrder(
  actors: readonly ActorState[],
  worldSeed: string,
  tick: number,
  scoreFor: (actor: ActorState) => number = (actor) => actor.spd + actor.initiativeModifier,
): InitiativeEntry[] {
  const entries = actors.map((actor) => ({
    actorId: actor.id,
    score: scoreFor(actor),
    tieBreak: randomUint64([
      semantic.string("initiative.tiebreak"),
      semantic.string(worldSeed),
      semantic.string(actor.id),
      semantic.i64(tick),
    ]),
  }));
  return entries.sort((left, right) => {
    if (left.score !== right.score) {
      return right.score - left.score;
    }
    if (left.tieBreak !== right.tieBreak) {
      return left.tieBreak > right.tieBreak ? -1 : 1;
    }
    return compareStableIds(left.actorId, right.actorId);
  });
}
