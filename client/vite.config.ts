import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const { PORT } = loadEnv(mode, path.resolve(__dirname, '..'), '');
  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: 5173,
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${process.env.PORT || PORT || 5000}`,
          changeOrigin: true,
        },
      },
    },
  };
});
