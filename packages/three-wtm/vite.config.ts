/* eslint-disable no-undef */
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
    build: {
        emptyOutDir: true,
        rollupOptions: {
            external: ['three'],
            plugins: [
            ]
        },
        lib: {
            entry: path.resolve(__dirname, 'src/index.ts'),
            name: 'three-wtm',
            fileName: 'index.js',
            formats: ['es']
        }
    }
});
