import React from 'react';
import { PosterTheme } from '../types/veloztix';

interface EventPosterArtProps {
  theme: PosterTheme;
  emoji: string;
  category: string;
  shortDate: string;
  className?: string;
  size?: 'card' | 'hero' | 'mini';
}

const themeGradients: Record<PosterTheme, string> = {
  violet:
    'from-violet-700 via-indigo-900 to-zinc-950',
  emerald:
    'from-emerald-600 via-teal-900 to-zinc-950',
  amber:
    'from-amber-500 via-orange-800 to-zinc-950',
  rose:
    'from-rose-600 via-fuchsia-900 to-zinc-950',
};

const themeGlows: Record<PosterTheme, string> = {
  violet: 'bg-violet-400/30',
  emerald: 'bg-emerald-400/30',
  amber: 'bg-amber-300/30',
  rose: 'bg-rose-400/30',
};

export const EventPosterArt: React.FC<EventPosterArtProps> = ({
  theme,
  emoji,
  category,
  shortDate,
  className = '',
  size = 'card',
}) => {
  if (size === 'mini') {
    return (
      <div
        className={`relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br ${themeGradients[theme]} ${className}`}
      >
        <span className="text-2xl">{emoji}</span>
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden bg-gradient-to-br ${themeGradients[theme]} ${
        size === 'hero' ? 'h-64 sm:h-72' : 'h-48'
      } ${className}`}
    >
      {/* Decorative glowing orbs like modern concert posters */}
      <div
        className={`pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full blur-3xl ${themeGlows[theme]}`}
      />
      <div className="pointer-events-none absolute -bottom-12 -left-8 h-36 w-36 rounded-full bg-white/10 blur-2xl" />

      {/* Top Pills */}
      <div className="relative z-10 flex items-start justify-between p-4">
        <span className="rounded-full bg-zinc-950/60 px-3 py-1 text-xs font-semibold text-white backdrop-blur-md">
          {category}
        </span>
        <span className="rounded-xl bg-white px-2.5 py-1 text-xs font-extrabold tracking-wide text-zinc-950 shadow-md">
          {shortDate}
        </span>
      </div>

      {/* Center Stylized Poster Icon */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span
          className={`select-none drop-shadow-2xl transition-transform duration-500 group-hover:scale-110 ${
            size === 'hero' ? 'text-7xl sm:text-8xl' : 'text-6xl'
          }`}
        >
          {emoji}
        </span>
      </div>

      {/* Bottom Subtle Vignette */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-zinc-950/90 to-transparent" />
    </div>
  );
};
