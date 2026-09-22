import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

const isDev = process.env.NODE_ENV === 'development';

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared'),
        '@main': resolve(__dirname, 'src/main')
      }
    },
    build: {
      ...(isDev ? { watch: { include: ['src/main/**', 'src/shared/**'] } } : {}),
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') }
      }
    },
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    resolve: {
      alias: { '@shared': resolve(__dirname, 'src/shared') }
    },
    build: {
      ...(isDev ? { watch: { include: ['src/preload/**', 'src/shared/**'] } } : {}),
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') }
      }
    },
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared'),
        '@renderer': resolve(__dirname, 'src/renderer/src')
      }
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') },
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/monaco-editor')) return 'monaco';
            return undefined;
          }
        }
      }
    },
    plugins: [react()]
  }
});
