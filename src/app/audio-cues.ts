import type { PresentationFacade } from "../presentation";
import type { TickEvent } from "../core/rules/tick-events";

function cueFor(event: TickEvent): string | null {
  switch (event.type) {
    case "actor_moved":
      return event.actorId === "player" ? "sfx.move.footstep" : null;
    case "attack_hit":
      return "sfx.combat.impact";
    case "attack_miss":
      return "sfx.combat.miss";
    case "door_toggled":
      return "sfx.feature.door";
    case "interacted":
      return event.targetId === "safe_anchor" ? "sfx.feature.safe_anchor" : "sfx.ui.confirm";
    case "transition_activated":
      return "sfx.transition.activate";
    case "dimension_discovered":
      return "sfx.discovery";
    case "player_died":
      return "sfx.death";
    case "monster_died":
      return "sfx.combat.fb_death";
    case "pursuit_started":
      return "sfx.pursuit.source";
    case "pursuit_arrived":
      return "sfx.pursuit.arrival";
    case "item_used":
      return "sfx.item.use";
    case "healed":
      return event.actorId === "player" ? "sfx.item.heal" : null;
    case "status_applied":
      if (event.detail === "poisoned") {
        return "sfx.status.poison";
      }
      if (event.detail === "burning") {
        return "sfx.status.fire";
      }
      return null;
    case "action_failed":
      return event.actorId === "player" ? "sfx.ui.cancel" : null;
    default:
      return null;
  }
}

export function playTickAudio(presentation: PresentationFacade, events: readonly TickEvent[]): void {
  const seen = new Set<string>();
  for (const event of events) {
    const semanticId = cueFor(event);
    if (!semanticId || seen.has(semanticId)) {
      continue;
    }
    seen.add(semanticId);
    try {
      presentation.playCue({ semanticId });
    } catch {
      /* missing cue is a presentation error, not a gameplay mutation */
    }
  }
}
