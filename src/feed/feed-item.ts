import { normalizeText } from '../env/text';
import type { Evaluation } from '../exclude/engine';
import type { ExclusionMatch, FeedItem, ItemStatus, PartMatch, RuleRef } from '../types';

/** Key of the internal state on `FeedItemImpl`. */
export const INTERNAL = Symbol('fd.internal');

export type ItemInternal = {
  docSeq: number;
  evaluation?: Evaluation;
  textCache?: { el: Element; text: string };
  llmKey?: string;
};

/** Mutable implementation of the public `FeedItem` report. */
export class FeedItemImpl implements FeedItem {
  id: string;
  feedId: string;
  element: Element;
  status: ItemStatus = 'kept';
  reasons: ExclusionMatch[] = [];
  parts: PartMatch[] = [];
  connected = true;
  rescuedBy?: RuleRef;
  sourceUrl?: string;
  readonly [INTERNAL]: ItemInternal;

  constructor(init: {
    id: string;
    feedId: string;
    element: Element;
    docSeq: number;
    sourceUrl?: string;
  }) {
    this.id = init.id;
    this.feedId = init.feedId;
    this.element = init.element;
    if (init.sourceUrl !== undefined) this.sourceUrl = init.sourceUrl;
    this[INTERNAL] = { docSeq: init.docSeq };
  }

  /** Normalized text, cached until the element changes or `invalidateText()` is called. */
  text(): string {
    const st = this[INTERNAL];
    if (st.textCache?.el !== this.element) {
      st.textCache = { el: this.element, text: normalizeText(this.element) };
    }
    return st.textCache.text;
  }

  invalidateText(): void {
    this[INTERNAL].textCache = undefined;
  }

  /** Applies an evaluation; returns true when status, reasons, parts or rescue changed. */
  apply(ev: Evaluation): boolean {
    const prev = this[INTERNAL].evaluation;
    this[INTERNAL].evaluation = ev;
    const changed =
      !prev ||
      prev.status !== ev.status ||
      !sameRefs(prev.reasons, ev.reasons) ||
      !sameParts(prev.parts, ev.parts) ||
      prev.rescuedBy?.ruleId !== ev.rescuedBy?.ruleId;
    this.status = ev.status;
    this.reasons = ev.reasons;
    this.parts = ev.parts;
    if (ev.rescuedBy) this.rescuedBy = ev.rescuedBy;
    else delete this.rescuedBy;
    return changed;
  }
}

function sameRefs(a: ExclusionMatch[], b: ExclusionMatch[]): boolean {
  return (
    a.length === b.length &&
    a.every((r, i) => r.ruleId === b[i]?.ruleId && r.confidence === b[i]?.confidence)
  );
}

function sameParts(a: PartMatch[], b: PartMatch[]): boolean {
  return a.length === b.length && a.every((p, i) => p.element === b[i]?.element);
}
