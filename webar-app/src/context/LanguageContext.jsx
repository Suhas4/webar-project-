import { createContext, useContext, useState, useMemo } from 'react';
import { T } from '../config/translations.js';

export const LanguageContext = createContext({ lang: 'en', setLang: () => {}, tr: T.en });
export const useLanguage = () => useContext(LanguageContext);

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('memoera_lang') || 'en');
  const changeLang = (l) => { setLang(l); localStorage.setItem('memoera_lang', l); };
  // Every language falls back to English for any key it hasn't been translated
  // for yet, so a screen can rely on `tr.xxx` always resolving to *something*
  // sensible instead of `undefined`. Centralized here so every screen gets it
  // for free via `const { tr } = useLanguage()` instead of re-deriving it.
  const tr = useMemo(() => ({ ...T.en, ...(T[lang] || {}) }), [lang]);
  return (
    <LanguageContext.Provider value={{ lang, setLang: changeLang, tr }}>
      {children}
    </LanguageContext.Provider>
  );
}
