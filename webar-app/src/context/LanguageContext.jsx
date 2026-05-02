import { createContext, useContext, useState } from 'react';

export const LanguageContext = createContext({ lang: 'en', setLang: () => {} });
export const useLanguage = () => useContext(LanguageContext);

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('memoera_lang') || 'en');
  const changeLang = (l) => { setLang(l); localStorage.setItem('memoera_lang', l); };
  return (
    <LanguageContext.Provider value={{ lang, setLang: changeLang }}>
      {children}
    </LanguageContext.Provider>
  );
}
