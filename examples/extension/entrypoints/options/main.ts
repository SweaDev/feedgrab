import type { LlmConfig } from 'feedgrab/llm';
import { DEFAULT_THEME, type OverlayTheme } from 'feedgrab/overlay';
import { getSettings, type Settings, saveSettings } from '../../lib/storage';

type ColorKey = keyof typeof DEFAULT_THEME.colors;

const form = document.getElementById('form') as HTMLFormElement;
const themeSet = document.getElementById('theme') as HTMLFieldSetElement;
const status = document.getElementById('status') as HTMLSpanElement;
const field = <T extends HTMLInputElement | HTMLSelectElement>(name: string) =>
  form.elements.namedItem(name) as T;

const colorKeys = Object.keys(DEFAULT_THEME.colors) as ColorKey[];
for (const key of colorKeys) {
  const label = document.createElement('label');
  const span = document.createElement('span');
  span.textContent = `Color: ${key}`;
  const input = document.createElement('input');
  input.type = 'color';
  input.name = `color-${key}`;
  label.append(span, input);
  themeSet.append(label);
}

async function load() {
  const s = await getSettings();
  field<HTMLInputElement>('enableLlm').checked = s.enableLlm;
  field<HTMLSelectElement>('provider').value = s.llm?.provider ?? 'ollama';
  field<HTMLInputElement>('model').value = s.llm?.model ?? '';
  field<HTMLInputElement>('baseURL').value = s.llm?.baseURL ?? '';
  field<HTMLInputElement>('apiKey').value = s.llm?.apiKey ?? '';
  field<HTMLSelectElement>('panelPosition').value =
    s.theme?.panelPosition ?? DEFAULT_THEME.panelPosition;
  for (const key of colorKeys) {
    field<HTMLInputElement>(`color-${key}`).value =
      s.theme?.colors?.[key] ?? DEFAULT_THEME.colors[key];
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const model = field<HTMLInputElement>('model').value.trim();
  const baseURL = field<HTMLInputElement>('baseURL').value.trim();
  const apiKey = field<HTMLInputElement>('apiKey').value.trim();
  const llm: LlmConfig | undefined = model
    ? {
        provider: field<HTMLSelectElement>('provider').value as LlmConfig['provider'],
        model,
        ...(baseURL ? { baseURL } : {}),
        ...(apiKey ? { apiKey } : {}),
      }
    : undefined;
  const colors: NonNullable<OverlayTheme['colors']> = {};
  for (const key of colorKeys) colors[key] = field<HTMLInputElement>(`color-${key}`).value;
  const settings: Settings = {
    enableLlm: field<HTMLInputElement>('enableLlm').checked,
    theme: {
      colors,
      panelPosition: field<HTMLSelectElement>('panelPosition')
        .value as OverlayTheme['panelPosition'],
    },
    ...(llm ? { llm } : {}),
  };
  await saveSettings(settings);
  status.textContent = 'Saved.';
  setTimeout(() => {
    status.textContent = '';
  }, 2000);
});

void load();
