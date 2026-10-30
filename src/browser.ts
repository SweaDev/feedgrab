import pkg from '../package.json';
import * as core from './index';
import * as overlay from './overlay/index';

/** Global `FeedDetector` for page injection (core + overlay; proxy LLM backends only). */
(globalThis as Record<string, unknown>).FeedDetector = {
  ...core,
  ...overlay,
  version: pkg.version,
};
