import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api/sounding': {
        target: 'https://weather.uwyo.edu',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/sounding/, '/cgi-bin/sounding'),
        secure: false,
      },
    },
  },
});
