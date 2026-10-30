import type { SelectorRule } from '../types';

/** A built-in selector rule (never stored in descriptors). */
export type BuiltinRule = Omit<SelectorRule, 'id' | 'origin'> & { id: string; origin: 'builtin' };

const rule = (id: string, value: string): BuiltinRule => ({
  id,
  origin: 'builtin',
  kind: 'selector',
  selector: { type: 'css', value },
  scope: 'item',
});

/** Rule id used for signature-outlier matches. */
export const OUTLIER_RULE_ID = 'b_outlier';

/**
 * Built-in ad rules. A match on the item element excludes the item; a match on a
 * descendant is reported as a part. The signature-outlier rule (`b_outlier`) has no selector.
 */
export const BUILTIN_RULES: readonly BuiltinRule[] = Object.freeze([
  rule(
    'b_data_ad',
    '[data-ad],[data-ad-slot],[data-ad-client],[data-adunit],[data-ad-unit],[data-ad-name],[data-google-query-id]',
  ),
  rule('b_adsense', 'ins.adsbygoogle,[id^="google_ads"],[id^="div-gpt-ad"]'),
  rule(
    'b_ad_iframe',
    'iframe[src*="doubleclick."],iframe[src*="googlesyndication."],iframe[src*="adservice."],iframe[id^="google_ads"]',
  ),
  rule('b_ad_class', '.ad,.ads,.advert,.advertisement,.ad-slot,.ad-container,.sponsored,.promoted'),
]);
