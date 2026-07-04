import { createContext, useContext, useState } from 'react';

export const THEME_LIST = [
  { id: 'dark',     label: 'Dark',     emoji: '🌑' },
  { id: 'light',    label: 'Light',    emoji: '☀️' },
  { id: 'forest',   label: 'Forest',   emoji: '🌿' },
  { id: 'ocean',    label: 'Ocean',    emoji: '🌊' },
  { id: 'sunset',   label: 'Sunset',   emoji: '🌅' },
  { id: 'royal',    label: 'Royal',    emoji: '💜' },
  { id: 'neon',     label: 'Neon',     emoji: '⚡' },
  { id: 'aurora',   label: 'Aurora',   emoji: '🌌' },
  { id: 'midnight', label: 'Midnight', emoji: '🌙' },
];

export const themes = {
  dark: {
    bg: 'linear-gradient(160deg, #061A1F 0%, #0A2229 50%, #061820 100%)',
    bgSolid: '#061A1F',
    surface: 'rgba(255,255,255,0.04)',
    surfaceHigh: 'rgba(255,255,255,0.09)',
    text: '#ffffff',
    textMuted: 'rgba(255,255,255,0.5)',
    textSub: 'rgba(255,255,255,0.7)',
    navBg: 'rgba(255,255,255,0.97)',
    navIcon: '#555',
    border: 'rgba(255,255,255,0.1)',
    inputBg: 'rgba(255,255,255,0.07)',
    inputBorder: 'rgba(255,255,255,0.15)',
    cardBg: 'rgba(255,255,255,0.05)',
    bottomBar: 'rgba(0,0,0,0.35)',
    accent: '#00C9A7',
  },
  light: {
    bg: 'linear-gradient(160deg, #e8f4f2 0%, #d4ece8 50%, #ddf0ec 100%)',
    bgSolid: '#e8f4f2',
    surface: 'rgba(255,255,255,0.75)',
    surfaceHigh: 'rgba(255,255,255,0.95)',
    text: '#061A1F',
    textMuted: 'rgba(6,26,31,0.5)',
    textSub: 'rgba(6,26,31,0.7)',
    navBg: '#061A1F',
    navIcon: '#fff',
    border: 'rgba(0,0,0,0.1)',
    inputBg: 'rgba(255,255,255,0.9)',
    inputBorder: 'rgba(0,0,0,0.15)',
    cardBg: 'rgba(255,255,255,0.8)',
    bottomBar: 'rgba(255,255,255,0.6)',
    accent: '#00C9A7',
  },
  forest: {
    bg: 'linear-gradient(160deg, #0a1f0e 0%, #122b18 50%, #0c2010 100%)',
    bgSolid: '#0a1f0e',
    surface: 'rgba(100,200,100,0.06)',
    surfaceHigh: 'rgba(100,200,100,0.12)',
    text: '#d8f5d8',
    textMuted: 'rgba(180,240,180,0.55)',
    textSub: 'rgba(200,245,200,0.75)',
    navBg: 'rgba(15,40,18,0.97)',
    navIcon: '#7fd87f',
    border: 'rgba(100,200,100,0.15)',
    inputBg: 'rgba(100,200,100,0.08)',
    inputBorder: 'rgba(100,200,100,0.2)',
    cardBg: 'rgba(100,200,100,0.06)',
    bottomBar: 'rgba(0,20,0,0.4)',
    accent: '#4caf50',
  },
  ocean: {
    bg: 'linear-gradient(160deg, #04111f 0%, #071a30 50%, #041525 100%)',
    bgSolid: '#04111f',
    surface: 'rgba(0,120,255,0.06)',
    surfaceHigh: 'rgba(0,120,255,0.12)',
    text: '#d0e8ff',
    textMuted: 'rgba(160,210,255,0.55)',
    textSub: 'rgba(180,220,255,0.75)',
    navBg: 'rgba(4,20,45,0.97)',
    navIcon: '#5ab4ff',
    border: 'rgba(0,120,255,0.15)',
    inputBg: 'rgba(0,120,255,0.07)',
    inputBorder: 'rgba(0,120,255,0.2)',
    cardBg: 'rgba(0,120,255,0.06)',
    bottomBar: 'rgba(0,10,30,0.45)',
    accent: '#2196f3',
  },
  sunset: {
    bg: 'linear-gradient(160deg, #1f0a04 0%, #2e1208 50%, #201008 100%)',
    bgSolid: '#1f0a04',
    surface: 'rgba(255,120,0,0.06)',
    surfaceHigh: 'rgba(255,120,0,0.12)',
    text: '#ffe8cc',
    textMuted: 'rgba(255,200,140,0.55)',
    textSub: 'rgba(255,215,160,0.75)',
    navBg: 'rgba(40,15,5,0.97)',
    navIcon: '#ffaa55',
    border: 'rgba(255,120,0,0.15)',
    inputBg: 'rgba(255,120,0,0.07)',
    inputBorder: 'rgba(255,120,0,0.2)',
    cardBg: 'rgba(255,120,0,0.06)',
    bottomBar: 'rgba(30,8,0,0.45)',
    accent: '#ff7043',
  },
  royal: {
    bg: 'linear-gradient(160deg, #0e0520 0%, #150832 50%, #0d0425 100%)',
    bgSolid: '#0e0520',
    surface: 'rgba(160,80,255,0.06)',
    surfaceHigh: 'rgba(160,80,255,0.12)',
    text: '#eeddff',
    textMuted: 'rgba(210,170,255,0.55)',
    textSub: 'rgba(220,185,255,0.75)',
    navBg: 'rgba(18,6,40,0.97)',
    navIcon: '#c084fc',
    border: 'rgba(160,80,255,0.15)',
    inputBg: 'rgba(160,80,255,0.07)',
    inputBorder: 'rgba(160,80,255,0.2)',
    cardBg: 'rgba(160,80,255,0.06)',
    bottomBar: 'rgba(10,0,25,0.45)',
    accent: '#a855f7',
  },
  neon: {
    bg: 'linear-gradient(160deg, #0d0015 0%, #1a0030 50%, #0a0018 100%)',
    bgSolid: '#0d0015',
    surface: 'rgba(255,0,128,0.07)',
    surfaceHigh: 'rgba(255,0,128,0.14)',
    text: '#ffe6f5',
    textMuted: 'rgba(255,160,230,0.55)',
    textSub: 'rgba(255,190,240,0.75)',
    navBg: 'rgba(20,0,35,0.97)',
    navIcon: '#ff66cc',
    border: 'rgba(255,0,128,0.22)',
    inputBg: 'rgba(255,0,128,0.08)',
    inputBorder: 'rgba(255,0,128,0.28)',
    cardBg: 'rgba(255,0,128,0.07)',
    bottomBar: 'rgba(14,0,24,0.5)',
    accent: '#ff007a',
  },
  aurora: {
    bg: 'linear-gradient(160deg, #020c1a 0%, #041428 50%, #030e20 100%)',
    bgSolid: '#020c1a',
    surface: 'rgba(0,230,190,0.06)',
    surfaceHigh: 'rgba(0,230,190,0.12)',
    text: '#c8f5ee',
    textMuted: 'rgba(140,235,215,0.55)',
    textSub: 'rgba(170,240,225,0.75)',
    navBg: 'rgba(2,10,24,0.97)',
    navIcon: '#00e5cc',
    border: 'rgba(0,230,190,0.16)',
    inputBg: 'rgba(0,230,190,0.07)',
    inputBorder: 'rgba(0,230,190,0.22)',
    cardBg: 'rgba(0,230,190,0.06)',
    bottomBar: 'rgba(0,6,20,0.5)',
    accent: '#00e5cc',
  },
  midnight: {
    bg: 'linear-gradient(160deg, #010510 0%, #030a1e 50%, #020718 100%)',
    bgSolid: '#010510',
    surface: 'rgba(100,140,255,0.07)',
    surfaceHigh: 'rgba(100,140,255,0.13)',
    text: '#dce6ff',
    textMuted: 'rgba(155,185,255,0.55)',
    textSub: 'rgba(185,205,255,0.75)',
    navBg: 'rgba(1,4,16,0.97)',
    navIcon: '#7b9fff',
    border: 'rgba(100,140,255,0.16)',
    inputBg: 'rgba(100,140,255,0.07)',
    inputBorder: 'rgba(100,140,255,0.22)',
    cardBg: 'rgba(100,140,255,0.07)',
    bottomBar: 'rgba(0,2,12,0.5)',
    accent: '#5c7fff',
  },
};

const ThemeContext = createContext({ theme: 'dark', setTheme: () => {}, toggleTheme: () => {} });
export const useTheme = () => useContext(ThemeContext);

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    const saved = localStorage.getItem('memoera_theme') || 'dark';
    return themes[saved] ? saved : 'dark';
  });

  const setTheme = (id) => {
    if (!themes[id]) return;
    setThemeState(id);
    localStorage.setItem('memoera_theme', id);
  };

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, colors: themes[theme] }}>
      {children}
    </ThemeContext.Provider>
  );
}
