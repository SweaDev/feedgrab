import { browser } from 'wxt/browser';
import { sendToTab } from '../../lib/messages';
import { deleteProfile, getProfiles } from '../../lib/storage';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function activeTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function render() {
  const tab = await activeTab();
  const host = tab?.url ? new URL(tab.url).host : '';
  $('host').textContent = host || '—';
  const list = $<HTMLUListElement>('profiles');
  list.replaceChildren();
  const profiles = (await getProfiles()).filter(
    (p) => p.hostname === host || host.endsWith(p.hostname.replace(/^\*/, '')),
  );
  if (profiles.length === 0) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = 'No saved profiles.';
    list.append(li);
  }
  for (const p of profiles) {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = `${p.pathPattern} · ${p.feeds.length} feed(s)`;
    const del = document.createElement('button');
    del.type = 'button';
    del.textContent = 'Delete';
    del.addEventListener('click', async () => {
      await deleteProfile(p);
      if (tab?.id !== undefined)
        await sendToTab(tab.id, { type: 'fd:profiles-changed' }).catch(() => {});
      await render();
    });
    li.append(label, del);
    list.append(li);
  }
}

$('detect').addEventListener('click', async () => {
  const tab = await activeTab();
  if (tab?.id !== undefined) await sendToTab(tab.id, { type: 'fd:start-detect' }).catch(() => {});
  window.close();
});

$('options').addEventListener('click', () => {
  void browser.runtime.openOptionsPage();
});

void render();
