/** Ranking weights and constants (docs/02 §6). Bump RANKING_VERSION when any of these change. */
export const RANKING_VERSION = "2026-11-10.1";

export const RANKING_WEIGHTS = {
  proximity: 0.4,
  rating: 0.3,
  experience: 0.15,
  priceFit: 0.15,
} as const;

/** Bayesian average: C pseudo-reviews at the prior mean, so a few reviews can't swing the score. */
export const BAYES_C = 3;
/** Prior mean for the Bayesian average. A design choice, recorded in DECISIONS.md. */
export const BAYES_PRIOR_MEAN = 3.5;
export const EXPERIENCE_CAP_YEARS = 15;
/** Used when the customer gave no budget. */
export const PRICE_FIT_NO_BUDGET = 0.5;

/** The search radius when nothing else is configured (D-07). */
export const DEFAULT_RADIUS_KM = 10;
/** "Widen the radius" suggestion steps for the no-match state. */
export const WIDEN_RADIUS_KM = 20;
