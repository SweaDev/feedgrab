import { parseProfile, type SiteProfile, serializeProfile } from 'feed-detector';
import type { LlmConfig } from 'feed-detector/llm';
import type { OverlayTheme } from 'feed-detector/overlay';
import { browser } from 'wxt/browser';

export type Settings = { llm?: LlmConfig; theme?: OverlayTheme; enableLlm: boolean };

const PROFILES = 'profiles';
const SETTINGS = 'settings';

/** Stored profiles (invalid entries are skipped). */
export async function getProfiles(): Promise<SiteProfile[]> {
  const raw = ((await browser.storage.local.get(PROFILES))[PROFILES] as string[] | undefined) ?? [];
  const out: SiteProfile[] = [];
  for (const s of raw) {
    try {
      out.push(parseProfile(s));
    } catch {
      // skip invalid or newer profiles
    }
  }
  return out;
}

const sameKey = (a: SiteProfile, b: { hostname: string; pathPattern: string }) =>
  a.hostname === b.hostname && a.pathPattern === b.pathPattern;

async function writeProfiles(profiles: SiteProfile[]): Promise<void> {
  await browser.storage.local.set({ [PROFILES]: profiles.map(serializeProfile) });
}

/** Saves a profile, replacing one with the same hostname + path pattern. */
export async function saveProfile(profile: SiteProfile): Promise<void> {
  const others = (await getProfiles()).filter((p) => !sameKey(p, profile));
  await writeProfiles([...others, { ...profile, updatedAt: new Date().toISOString() }]);
}

export async function deleteProfile(key: { hostname: string; pathPattern: string }): Promise<void> {
  await writeProfiles((await getProfiles()).filter((p) => !sameKey(p, key)));
}

export async function getSettings(): Promise<Settings> {
  const s = (await browser.storage.local.get(SETTINGS))[SETTINGS] as Partial<Settings> | undefined;
  return { enableLlm: false, ...s };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ [SETTINGS]: settings });
}
