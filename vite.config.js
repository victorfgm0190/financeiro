import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Lê process.env (injetado pelo Vercel dashboard ou pelo shell).
// Fallback hardcoded garante que o bundle funcione mesmo se o env não chegar
// ao vite.config.js — a anon key é pública por design do Supabase.
const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ||
  'https://kwztqlxrxypnkldfxml.supabase.co'

const SUPABASE_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3enRxbHhyeHlwbmtsZGZ4dG1sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4OTk2OTcsImV4cCI6MjA5NTQ3NTY5N30.NSZXiYEdVIljDAzJrz5IoAgAJ1aedcwalF4ENtywy4Q'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    // Substitui import.meta.env.VITE_* por string literal no bundle —
    // garante que as credenciais estejam presentes independente de como
    // o Vercel expõe as variáveis ao processo de build do Vite.
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(SUPABASE_URL),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(SUPABASE_KEY),
  },
})
