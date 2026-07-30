import { createContext, useContext, useState, useMemo, useEffect } from 'react';
import { T, LOCALE_LOADERS } from '../config/translations.js';

export const LanguageContext = createContext({ lang: 'en', setLang: () => {}, tr: T.en });
export const useLanguage = () => useContext(LanguageContext);

// Locales already fetched this session. Switching back to a language is then
// instant, and re-selecting one never re-downloads it.
const loaded = {};

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('memoera_lang') || 'en');
  const [dict, setDict] = useState(() => loaded[lang] || null);

  const changeLang = (l) => { setLang(l); localStorage.setItem('memoera_lang', l); };

  // Only English ships in the main bundle; the other fifteen are separate
  // chunks pulled in on demand. Bundling all sixteen meant every visitor
  // parsed 231 KB of translations to read one of them.
  useEffect(() => {
    if (lang === 'en') { setDict(null); return undefined; }
    if (loaded[lang]) { setDict(loaded[lang]); return undefined; }

    let cancelled = false;
    const load = LOCALE_LOADERS[lang];
    if (!load) { setDict(null); return undefined; }

    load()
      .then((mod) => {
        if (cancelled) return;
        loaded[lang] = mod.default;
        setDict(mod.default);
      })
      // A failed chunk fetch just leaves English showing, which is a far better
      // outcome than a blank screen.
      .catch(() => { if (!cancelled) setDict(null); });

    return () => { cancelled = true; };
  }, [lang]);

  // Every language falls back to English for any key it hasn't been translated
  // for yet, so a screen can rely on `tr.xxx` always resolving to *something*
  // sensible instead of `undefined`. Centralised here so every screen gets it
  // for free via `const { tr } = useLanguage()` instead of re-deriving it.
  //
  // While a locale chunk is still in flight, dict is null and this is simply
  // English — so the UI renders immediately and swaps to the translation a
  // moment later, rather than blocking on the download.
  const tr = useMemo(() => ({ ...T.en, ...(dict || {}) }), [dict]);

  return (
    <LanguageContext.Provider value={{ lang, setLang: changeLang, tr }}>
      {children}
    </LanguageContext.Provider>
  );
}
