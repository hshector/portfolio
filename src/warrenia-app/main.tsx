// WarrenIA's web app, as a static demo: its own pages and components (vendor/warrenia/web), the
// public extract of the latest night's analysis (no prices), and each visitor's portfolio kept in
// their own browser. Opened inside the island's pavilion; also works on its own at /warrenia-app/.

import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@vendor/app/globals.css';
import './demo.css';

import { createRoot } from 'react-dom/client';

import { ThemeProvider } from '@vendor/components/shell/theme';
import { Toaster } from '@vendor/components/shell/toaster';

import { App } from './router';

createRoot(document.getElementById('app')!).render(
  <ThemeProvider>
    <App />
    <Toaster />
    <footer className="demo-foot">
      Demo of WarrenIA with last night&apos;s public analysis (no market prices). What you enter stays in this browser. Not investment advice.{' '}
      <a href="https://logo.dev" target="_blank" rel="noopener">Logos provided by Logo.dev</a>
    </footer>
  </ThemeProvider>,
);
