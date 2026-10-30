import {
  createLlmProxy,
  detectFeeds,
  type ErrorCode,
  FeedDetectorError,
  type FeedItem,
  matchProfile,
  openFeed,
  type RemovalHandle,
  removeItem,
  type UnifiedFeed,
} from 'feed-detector';
import { openOverlay } from 'feed-detector/overlay';
import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { isMessage, sendToBackground } from '../lib/messages';
import { getProfiles, getSettings, saveProfile } from '../lib/storage';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  async main() {
    let feed: UnifiedFeed | null = null;
    const hidden = new Map<string, RemovalHandle>();

    const llmProxy = () =>
      createLlmProxy(async (req) => {
        const reply = await sendToBackground({ type: 'fd:llm', req });
        if (!reply.ok) {
          throw new FeedDetectorError(
            (reply.error.code as ErrorCode) ?? 'LLM_UNAVAILABLE',
            reply.error.message,
          );
        }
        return reply.res;
      });

    // Hide excluded items; restore them if their status goes back to kept.
    const apply = (item: FeedItem) => {
      if (item.status === 'excluded') {
        if (!hidden.has(item.id)) hidden.set(item.id, removeItem(item));
      } else {
        hidden.get(item.id)?.restore();
        hidden.delete(item.id);
      }
    };

    const stop = () => {
      feed?.dispose({ restore: true });
      feed = null;
      hidden.clear();
    };

    async function start() {
      stop();
      const [profiles, settings] = await Promise.all([getProfiles(), getSettings()]);
      const profile = matchProfile(location.href, profiles);
      if (!profile) return;
      feed = openFeed(document, profile, settings.enableLlm ? { llm: llmProxy() } : {});
      for (const item of feed.items()) apply(item);
      feed.on('item:added', apply);
      feed.on('item:updated', apply);
    }

    async function detect() {
      stop();
      const settings = await getSettings();
      const llm = settings.enableLlm ? llmProxy() : undefined;
      const proposals = await detectFeeds(document, llm ? { llm } : {});
      const existing = matchProfile(location.href, await getProfiles());
      try {
        const profile = await openOverlay(document, proposals, {
          ...(settings.theme ? { theme: settings.theme } : {}),
          ...(llm ? { llm } : {}),
          ...(existing ? { existing } : {}),
        });
        await saveProfile(profile);
      } catch (e) {
        if (!(e instanceof FeedDetectorError && e.code === 'OVERLAY_CANCELLED'))
          console.warn('[feed-detector]', e);
      }
      await start();
    }

    browser.runtime.onMessage.addListener((msg: unknown) => {
      if (!isMessage(msg)) return undefined;
      if (msg.type === 'fd:start-detect') void detect();
      if (msg.type === 'fd:profiles-changed') void start();
      return undefined;
    });

    // Dev-only hook used by the E2E smoke test.
    if (import.meta.env.FD_E2E === '1') {
      window.addEventListener('message', (e) => {
        if (e.source === window && e.data?.source === 'fd-e2e' && e.data.type === 'start-detect')
          void detect();
      });
    }

    await start();
  },
});
