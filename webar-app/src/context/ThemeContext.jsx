import { createContext, useContext, useState } from 'react';

export const themes = {
  dark: {
    bg: 'linear-gradient(160deg, #061A1F 0%, #0A2229 50%, #061820 100%)',
    bgSolid: '#061A1F',
    surface: 'rgba(255,255,255,0.04)',
    text: '#ffffff',
    textMuted: 'rgba(255,255,255,0.5)',
    navBg: 'rgba(255,255,255,0.97)',
    navIcon: '#555',
    border: 'rgba(255,255,255,0.1)',
  },
  light: {
    bg: 'linear-gradient(160deg, #e8f4f2 0%, #d0eae6 50%, #e0f0ed 100%)',
    bgSolid: '#e8f4f2',
    surface: 'rgba(0,0,0,0.04)',
    text: '#061A1F',
    textMuted: 'rgba(6,26,31,0.5)',
    navBg: '#061A1F',
    navIcon: '#fff',
    border: 'rgba(0,0,0,0.1)',
  },
};

const ThemeContext = createContext({ theme: 'dark', toggleTheme: () => {} });
export const useTheme = () => useContext(ThemeContext);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('memoera_theme') || 'dark');
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('memoera_theme', next);
  };
  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, colors: themes[theme] }}>
      {children}
    </ThemeContext.Provider>
  );
}
