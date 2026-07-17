import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './'  -> Varlıklara göreli yol verir; böylece build hem Lark'ın iframe'inde
// hem de alt yolda barındırılan yerlerde (GitHub Pages proje sitesi, Vercel vb.) çalışır.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    host: true,
    port: 5173,
  },
  build: {
    outDir: 'dist',
  },
});
