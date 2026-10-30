import * as api from '../../src/index';
import { fixtureHtml, loadFixture } from '../helpers/dom';
import { type JsonSummary, SCENARIOS } from './index';

/** Runs every scenario in Bun against happy-dom fixtures. */
export async function runScenarios(): Promise<Record<string, JsonSummary>> {
  const out: Record<string, JsonSummary> = {};
  for (const s of SCENARIOS) {
    out[s.name] = await s.run(api, loadFixture(s.fixture), {
      fetchFixture: async (name) => fixtureHtml(name),
    });
  }
  return out;
}
