import { FeedgrabError } from 'feedgrab';
import { createModel, handleLlmRequest, type LlmConfig, readEnvConfig } from 'feedgrab/llm';
import { allProviders } from 'feedgrab/llm/providers';
import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { isMessage, type LlmReply } from '../lib/messages';
import { getSettings } from '../lib/storage';

export default defineBackground(() => {
  const models = new Map<string, ReturnType<typeof createModel>>();

  async function currentModel() {
    const settings = await getSettings();
    const config: LlmConfig | null =
      settings.llm ??
      readEnvConfig(import.meta.env as unknown as Record<string, string | undefined>);
    if (!config)
      throw new FeedgrabError('LLM_CONFIG', 'No LLM configured (options page or FD_LLM_* env)');
    const key = JSON.stringify(config);
    let model = models.get(key);
    if (!model) {
      model = createModel(config, allProviders);
      models.set(key, model);
    }
    return model;
  }

  browser.runtime.onMessage.addListener(
    (msg: unknown, _sender, sendResponse: (r: LlmReply) => void) => {
      if (!isMessage(msg) || msg.type !== 'fd:llm') return undefined;
      (async () => {
        try {
          sendResponse({ ok: true, res: await handleLlmRequest(msg.req, await currentModel()) });
        } catch (e) {
          const err = e as { code?: string; message?: string };
          sendResponse({ ok: false, error: { code: err.code, message: err.message ?? String(e) } });
        }
      })();
      return true;
    },
  );
});
