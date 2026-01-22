import { defineConfig } from 'vite';

export default defineConfig({
  root: './',
  publicDir: 'public',
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'babylonjs-core': ['@babylonjs/core'],
          'babylonjs-loaders': ['@babylonjs/loaders'],
          'babylonjs-gui': ['@babylonjs/gui']
        }
      }
    }
  },
  server: {
    host: true,
    port: 3000,
    open: true
  },
  preview: {
    host: true,
    port: 4173
  },
  optimizeDeps: {
    include: ['@babylonjs/core', '@babylonjs/loaders', '@babylonjs/gui']
  }
});
