import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: 'Feed Detector Example',
    permissions: ['storage', 'activeTab', 'tabs'],
    host_permissions: ['<all_urls>'],
    optional_host_permissions: ['http://localhost:11434/*'],
    ...(browser === 'firefox'
      ? { browser_specific_settings: { gecko: { id: 'feed-detector-example@example.org' } } }
      : {}),
  }),
  vite: () => ({ envPrefix: ['WXT_', 'FD_'] }),
});
