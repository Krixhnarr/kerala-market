import { useColorScheme } from 'react-native';

// Kerala theme, same tokens as the website.
// Light: the ivory-and-gold of a kasavu mundu; palm green as the action
// colour; laterite brick for a price fall. Dark: a backwater at dusk.
// Chart series were validated for colour-blind separation in both modes
// (worst adjacent-pair OKLab dE 20.0 light / 13.7 dark; floor 8).
export const LIGHT = {
  bg: '#fbf7ee',
  surface: '#fffdf8',
  line: '#e3d9c2',
  ink: '#1c1a14',
  secondary: '#5a5446',
  muted: '#8d8574',
  accent: '#1e8a52',
  onAccent: '#ffffff',
  gold: '#b8860b',
  goldSoft: '#e9d9a8',
  up: '#137a45',
  down: '#b0361c',
  grid: '#ece5d2',
  series: ['#1e8a52', '#2b5fa8', '#b8860b', '#a02c6a'],
};

export const DARK = {
  bg: '#0f1a14',
  surface: '#172420',
  line: '#2a3a31',
  ink: '#f3eee2',
  secondary: '#b9b1a0',
  muted: '#7f8a80',
  accent: '#329c62',
  onAccent: '#ffffff',
  gold: '#d9a520',
  goldSoft: '#4a3f1a',
  up: '#3fae72',
  down: '#e0764f',
  grid: '#22322a',
  series: ['#329c62', '#6a8fd6', '#b58309', '#d45a94'],
};

export function useTheme() {
  return useColorScheme() === 'dark' ? DARK : LIGHT;
}
