import pkg from '../package.json';
import * as core from './index';
import * as overlay from './overlay/index';

/** Global `Feedgrab` for page injection (core + overlay; proxy LLM backends only). */
(globalThis as Record<string, unknown>).Feedgrab = {
  ...core,
  ...overlay,
  version: pkg.version,
};
