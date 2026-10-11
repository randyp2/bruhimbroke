import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'BruhImBroke',
    permissions: ['storage', 'activeTab', 'scripting'],
    optional_host_permissions: ['https://*/*', 'http://*/*'],
    web_accessible_resources: [{
      // WXT names content-script assets after their entrypoint in production builds.
      resources: ['assets/shopping*.png', 'assets/prof-happy-cutout-*.png', 'assets/prof-questionable-cutout-*.png', 'assets/prof-sad-cutout-*.png'],
      matches: ['http://*/*', 'https://*/*'],
    }],
  },
});
