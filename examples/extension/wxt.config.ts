import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 3,
  manifest: {
    name: 'Feed Detector Example',
    permissions: ['storage', 'activeTab', 'tabs'],
    host_permissions: ['<all_urls>'],
    optional_host_permissions: ['http://localhost:11434/*'],
  },
  vite: () => ({ envPrefix: ['WXT_', 'FD_'] }),
});
