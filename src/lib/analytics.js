// Same GA4 property and no-cookie approach as Xfina (xfina/web/src/lib/analytics.js).
// Only the consent level lives here for now; nothing is sent until the engine exists.
export const GA_MEASUREMENT_ID = 'G-WZEYQGS8PE';
export const STORAGE_KEY = 'xfina_labs_analytics_level';

export const LEVEL_OFF = 'Off';
export const LEVEL_ANONYMOUS = 'Anonymous Usage';

export function getStoredAnalyticsLevel() {
  try {
    return localStorage.getItem(STORAGE_KEY) || LEVEL_ANONYMOUS;
  } catch {
    return LEVEL_ANONYMOUS;
  }
}

export function setStoredAnalyticsLevel(level) {
  try {
    localStorage.setItem(STORAGE_KEY, level);
  } catch {
    // Storage can be blocked; the choice then lasts for this page view only.
  }
}
