import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import OfflineBanner from './components/OfflineBanner.jsx';
import { LanguageProvider } from './context/LanguageContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';

// NOTE on StrictMode + MindAR:
// React 18 StrictMode intentionally double-invokes effects in development.
// The useMindAR hook uses a `cancelled` ref to guard against this — the
// second invocation detects cancellation and cleans up immediately.
// If you still see "camera already in use" errors during dev, temporarily
// remove <StrictMode> for debugging. Always restore it before production.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <LanguageProvider>
        <App />
        <OfflineBanner />
      </LanguageProvider>
    </ThemeProvider>
  </StrictMode>
);
