import type { AttributeId, CatalogueId } from "./ids";
import type { PlanePair } from "./plane";

export type PrimitiveCondition =
  | { readonly type: "flag"; readonly flag: CatalogueId; readonly equals: boolean }
  | { readonly type: "questState"; readonly questId: CatalogueId; readonly state: string }
  | { readonly type: "itemOwned"; readonly itemId: CatalogueId; readonly owned: boolean }
  | { readonly type: "currencyAtLeast"; readonly amount: number }
  | { readonly type: "dimensionDiscovered"; readonly dimension: number }
  | { readonly type: "planeDiscovered"; readonly plane: PlanePair }
  | { readonly type: "entityDefeated"; readonly entityId: CatalogueId }
  | { readonly type: "attributeAtLeast"; readonly attribute: AttributeId; readonly value: number }
  | { readonly type: "currentPlane"; readonly plane: PlanePair }
  | { readonly type: "featureState"; readonly featureId: CatalogueId; readonly state: string };

export type ConditionExpr =
  | PrimitiveCondition
  | { readonly type: "all"; readonly of: readonly ConditionExpr[] }
  | { readonly type: "any"; readonly of: readonly ConditionExpr[] }
  | { readonly type: "not"; readonly of: ConditionExpr };
