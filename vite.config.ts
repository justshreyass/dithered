import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Expose on LAN so the camera flow can be tried from a phone.
  server: { host: true },
})
