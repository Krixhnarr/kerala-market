import { useColorScheme } from 'react-native';

// Swiss-poster palette: one red, off-white paper, charcoal panels, grey type.
// Red is reserved for the brand, the active state and a price *fall*; a rise
// is plain ink with ▲ - the glyph carries the meaning, not the colour.
export const LIGHT = {
  bg: '#f2f2f2',
  surface: '#ffffff',
  panel: '#2a2a2a',      // dark stat blocks
  onPanel: '#f2f2f2',
  line: '#dcdcdc',
  ink: '#151515',
  secondary: '#4b4b4b',
  muted: '#8a8a8a',
  accent: '#ff2000',
  onAccent: '#f6f6f6',
  up: '#151515',
  down: '#ff2000',
  grid: '#e6e6e6',
  series: ['#ff2000', '#151515', '#8a8a8a', '#c9741a'],
};

export const DARK = {
  bg: '#181818',
  surface: '#232323',
  panel: '#2e2e2e',
  onPanel: '#f2f2f2',
  line: '#383838',
  ink: '#f2f2f2',
  secondary: '#c4c4c4',
  muted: '#8a8a8a',
  accent: '#ff2a0a',
  onAccent: '#f6f6f6',
  up: '#f2f2f2',
  down: '#ff5a3c',
  grid: '#2c2c2c',
  series: ['#ff4a2a', '#f2f2f2', '#9a9a9a', '#e0964a'],
};

// Inter Tight - loaded in App before first render (see useFonts there).
export const FONT = {
  regular: 'InterTight_400Regular',
  medium: 'InterTight_500Medium',
  bold: 'InterTight_700Bold',
  black: 'InterTight_800ExtraBold',
};

export function useTheme() {
  return useColorScheme() === 'dark' ? DARK : LIGHT;
}
