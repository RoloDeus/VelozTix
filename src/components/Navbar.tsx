import React from 'react';
import { Compass, LayoutDashboard, Ticket } from 'lucide-react';
import { AppRole } from '../types/veloztix';

interface NavbarProps {
  activeRole: AppRole;
  onChangeRole: (role: AppRole) => void;
  onGoHome: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeRole,
  onChangeRole,
  onGoHome,
}) => {
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-zinc-950/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
        {/* Commercial Brand Logo */}
        <button
          type="button"
          onClick={onGoHome}
          className="group flex items-center gap-2.5 text-left focus:outline-none"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-tr from-violet-600 to-emerald-400 text-zinc-950 shadow-lg shadow-violet-600/20 transition group-hover:scale-105">
            <Ticket className="h-5 w-5 stroke-[2.5]" />
          </div>
          <div>
            <span className="text-xl font-extrabold tracking-tight text-white">
              Veloz<span className="text-emerald-400">Tix</span>
            </span>
            <span className="hidden pl-2 text-xs font-medium text-zinc-400 md:inline">
              Entradas al instante
            </span>
          </div>
        </button>

        {/* Clean 2-Role Commercial Switch */}
        <nav
          aria-label="Selector de vista"
          className="flex items-center gap-1 rounded-2xl border border-zinc-800 bg-zinc-900/90 p-1"
        >
          <button
            type="button"
            onClick={() => onChangeRole('buyer')}
            className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition sm:text-sm ${
              activeRole === 'buyer'
                ? 'bg-white text-zinc-950 shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Compass className="h-4 w-4" />
            <span>Explorar Eventos (Vista Comprador)</span>
          </button>

          <button
            type="button"
            onClick={() => onChangeRole('organizer')}
            className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition sm:text-sm ${
              activeRole === 'organizer'
                ? 'bg-violet-600 text-white shadow-md shadow-violet-600/25'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <LayoutDashboard className="h-4 w-4" />
            <span>Portal Organizador (Gestión y Ventas)</span>
          </button>
        </nav>
      </div>
    </header>
  );
};
