export type PlanId = "free" | "creator" | "studio";

export type FeatureEntitlements = {
  worldBookLimit: number;
  worldBookVersionHistoryLimit: number;
  aiSingleEntryGeneration: boolean;
  aiFullWorldBookGeneration: boolean;
  aiBatchGeneration: boolean;
  aiFillMissing: boolean;
  consistencyCheck: boolean;
  tokenOptimization: boolean;
  automaticRelations: boolean;
  advancedRetrievalDebug: boolean;
  cloudSync: boolean;
  publicPublishing: boolean;
  collaboration: boolean;
};

export const DEVELOPMENT_ENTITLEMENTS: FeatureEntitlements = {
  worldBookLimit: Number.POSITIVE_INFINITY,
  worldBookVersionHistoryLimit: Number.POSITIVE_INFINITY,
  aiSingleEntryGeneration: true,
  aiFullWorldBookGeneration: true,
  aiBatchGeneration: true,
  aiFillMissing: true,
  consistencyCheck: true,
  tokenOptimization: true,
  automaticRelations: true,
  advancedRetrievalDebug: true,
  cloudSync: false,
  publicPublishing: false,
  collaboration: false,
};

export type FeatureKey = keyof FeatureEntitlements;
export function canUseFeature(
  feature: FeatureKey,
  entitlements = DEVELOPMENT_ENTITLEMENTS,
) {
  const value = entitlements[feature];
  return typeof value === "boolean" ? value : value > 0;
}
export function getFeatureLimit(
  feature: "worldBookLimit" | "worldBookVersionHistoryLimit",
  entitlements = DEVELOPMENT_ENTITLEMENTS,
) {
  return entitlements[feature];
}
