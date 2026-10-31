import type { LlmRequest } from 'feedgrab';
import { browser } from 'wxt/browser';

/** Content → background: run an LLM request with the configured model. */
export type LlmMessage = { type: 'fd:llm'; req: LlmRequest };
export type LlmReply =
  | { ok: true; res: unknown }
  | { ok: false; error: { code?: string; message: string } };
/** Popup → content: start detection + overlay on this page. */
export type StartDetectMessage = { type: 'fd:start-detect' };
/** Any → content: stored profiles changed, re-open the feed. */
export type ProfilesChangedMessage = { type: 'fd:profiles-changed' };
export type Message = LlmMessage | StartDetectMessage | ProfilesChangedMessage;

export function isMessage(x: unknown): x is Message {
  return typeof x === 'object' && x !== null && typeof (x as { type?: unknown }).type === 'string';
}

export function sendToBackground(msg: LlmMessage): Promise<LlmReply> {
  return browser.runtime.sendMessage(msg) as Promise<LlmReply>;
}

export function sendToTab(
  tabId: number,
  msg: StartDetectMessage | ProfilesChangedMessage,
): Promise<unknown> {
  return browser.tabs.sendMessage(tabId, msg);
}
