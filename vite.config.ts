import { defineConfig } from 'vite';
import { serverPlugin } from './src/server.plugin';

export default defineConfig({
  plugins: [
    serverPlugin({
      exposedFolders: ['public']
    })
  ],
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'ViteVirtualEntryServerPlugin',
      fileName: (format) => `index.${format}.js`,
      formats: ['es']
    },
    rollupOptions: {
      external: ['vite', 'fp-ts', 'glob'],
    },
  },
  server: {
    port: 3000,
    open: true
  }
});
