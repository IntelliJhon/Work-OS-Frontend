import React, { useId } from 'react';

/**
 * The Ask AI robot: a shaded, glossy head with a glass visor, glowing eyes that blink and an antenna light. Drawn in SVG
 * (gradients give the 3D look), so it stays crisp at any size and costs nothing to load.
 */
export const BotAvatar: React.FC<{ size?: number; animated?: boolean; className?: string }> = ({ size = 56, animated = true, className = '' }) => {
  const id = useId().replace(/:/g, '');
  const g = (name: string) => `${name}-${id}`;
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" className={className} aria-hidden="true">
      <defs>
        <radialGradient id={g('head')} cx="38%" cy="28%" r="80%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="45%" stopColor="#e9e5ff" />
          <stop offset="100%" stopColor="#a5a0f5" />
        </radialGradient>
        <linearGradient id={g('visor')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2a2563" />
          <stop offset="100%" stopColor="#0d0b2b" />
        </linearGradient>
        <radialGradient id={g('eye')} cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="#e0fbff" />
          <stop offset="55%" stopColor="#38e1ff" />
          <stop offset="100%" stopColor="#1c7cff" />
        </radialGradient>
        <radialGradient id={g('bulb')} cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#fff3c4" />
          <stop offset="60%" stopColor="#ff8ad8" />
          <stop offset="100%" stopColor="#b33cff" />
        </radialGradient>
        <linearGradient id={g('ear')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8b7dff" />
          <stop offset="100%" stopColor="#4f46e5" />
        </linearGradient>
        <filter id={g('glow')} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.4" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id={g('shadow')} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="5" stdDeviation="4" floodColor="#4c1d95" floodOpacity="0.35" />
        </filter>
      </defs>

      {/* Ground shadow */}
      <ellipse cx="60" cy="112" rx="26" ry="4.5" fill="#4c1d95" opacity="0.18" className={animated ? 'ai-bot-shadow' : ''} />

      <g className={animated ? 'ai-bot-float' : ''}>
        {/* Antenna */}
        <line x1="60" y1="24" x2="60" y2="12" stroke="#7c6cff" strokeWidth="4" strokeLinecap="round" />
        <circle cx="60" cy="10" r="6" fill={`url(#${g('bulb')})`} filter={`url(#${g('glow')})`} className={animated ? 'ai-bot-bulb' : ''} />

        {/* Ears */}
        <rect x="10" y="46" width="12" height="26" rx="6" fill={`url(#${g('ear')})`} />
        <rect x="98" y="46" width="12" height="26" rx="6" fill={`url(#${g('ear')})`} />

        {/* Head */}
        <rect x="18" y="22" width="84" height="76" rx="30" fill={`url(#${g('head')})`} filter={`url(#${g('shadow')})`} />
        {/* Gloss */}
        <path d="M32 34 C 44 26, 70 25, 86 31 C 72 30, 48 32, 34 42 Z" fill="#ffffff" opacity="0.75" />

        {/* Visor */}
        <rect x="28" y="44" width="64" height="36" rx="18" fill={`url(#${g('visor')})`} />
        <path d="M36 50 C 50 45, 72 45, 84 50" stroke="#ffffff" strokeOpacity="0.18" strokeWidth="3" fill="none" strokeLinecap="round" />

        {/* Eyes */}
        <g className={animated ? 'ai-bot-eyes' : ''} filter={`url(#${g('glow')})`}>
          <ellipse cx="46" cy="62" rx="7" ry="8" fill={`url(#${g('eye')})`} />
          <ellipse cx="74" cy="62" rx="7" ry="8" fill={`url(#${g('eye')})`} />
        </g>
        {/* Smile */}
        <path d="M52 73 Q 60 78 68 73" stroke="#38e1ff" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.9" />
        {/* Cheeks */}
        <circle cx="34" cy="84" r="4" fill="#ff8ad8" opacity="0.45" />
        <circle cx="86" cy="84" r="4" fill="#ff8ad8" opacity="0.45" />
      </g>

      <style>{`
        .ai-bot-float { animation: aiBotFloat 3.2s ease-in-out infinite; transform-origin: 60px 60px; }
        .ai-bot-shadow { animation: aiBotShadow 3.2s ease-in-out infinite; transform-origin: 60px 112px; }
        .ai-bot-eyes { animation: aiBotBlink 4.5s infinite; transform-origin: 60px 62px; }
        .ai-bot-bulb { animation: aiBotBulb 1.6s ease-in-out infinite; }
        @keyframes aiBotFloat { 0%, 100% { transform: translateY(0) rotate(-2deg); } 50% { transform: translateY(-6px) rotate(2deg); } }
        @keyframes aiBotShadow { 0%, 100% { transform: scaleX(1); opacity: .18; } 50% { transform: scaleX(.8); opacity: .1; } }
        @keyframes aiBotBlink { 0%, 92%, 100% { transform: scaleY(1); } 95% { transform: scaleY(.1); } }
        @keyframes aiBotBulb { 0%, 100% { opacity: 1; } 50% { opacity: .55; } }
        @media (prefers-reduced-motion: reduce) { .ai-bot-float, .ai-bot-shadow, .ai-bot-eyes, .ai-bot-bulb { animation: none; } }
      `}</style>
    </svg>
  );
};

export default BotAvatar;
