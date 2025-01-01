import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      watch: {
        include: ['src/main/**'],
        exclude: ['**/node_modules/**', '**/dist/**']
      },
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        }
      }
    },
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    build: {
      watch: {
        include: ['src/preload/**'],
        exclude: ['**/node_modules/**', '**/dist/**']
      },
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        }
      }
    },
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    define: {
      'process.env': process.env
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        }
      }
    },
    resolve: {
      alias: {
        '@src/renderer': resolve('src/renderer/src')
      }
    },
    plugins: [
      react({
        babel: {
          babelrc: true,
          configFile: false,
          presets: [],
          plugins: [
            [
              'babel-plugin-transform-imports',
              {
                '@cloudhub-ux-icons/mdi': {
                  transform: '@cloudhub-ux-icons/mdi/dist/${member}',
                  preventFullImport: true
                },
                '@mui/material': {
                  transform: '@mui/material/${member}',
                  preventFullImport: true
                },
                '@mui/icons-material': {
                  transform: '@mui/icons-material/${member}',
                  preventFullImport: true
                }
              }
            ]
          ]
        }
      })
    ]
  }
})
