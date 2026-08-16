import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins:[vue()], server:{port:Number(process.env.WEB_PORT??5173),proxy:{'/api':'http://localhost:3000','/health':'http://localhost:3000','/webhook':'http://localhost:3000'}},
});
