import type { Team } from 'shared';

export interface TeamTheme {
  label: string;
  solid: string;
  border: string;
  text: string;
  bg: string;
}

export const TEAM_THEME: Record<Team, TeamTheme> = {
  blue: {
    label: 'קואליציה',
    solid: '#0284c7',
    border: 'rgba(56,189,248,0.7)',
    text: '#7dd3fc',
    bg: 'rgba(2,132,199,0.15)',
  },
  red: {
    label: 'אופוזיציה',
    solid: '#e11d48',
    border: 'rgba(251,113,133,0.7)',
    text: '#fda4af',
    bg: 'rgba(225,29,72,0.15)',
  },
};
