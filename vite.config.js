import { defineConfig } from 'vite';

// base './' membuat path relatif, jadi aman di Vercel maupun di sub-folder (mis. GitHub Pages).
export default defineConfig({
  base: './',
});
