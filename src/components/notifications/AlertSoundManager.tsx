import React, { useState, useEffect } from 'react';
import { Volume2, VolumeX, Sparkles } from 'lucide-react';

// Expose a global hook or callback to trigger play
type SoundPreset = 'enterprise' | 'cosmic' | 'digital';

let globalPlaySound: ((priority: string) => void) | null = null;

export const playNotificationSound = (priority: string) => {
  if (globalPlaySound) {
    globalPlaySound(priority);
  }
};

export const AlertSoundManager: React.FC = () => {
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    return localStorage.getItem('workos_alerts_muted') === 'true';
  });
  const [volume, setVolume] = useState<number>(() => {
    const saved = localStorage.getItem('workos_alerts_volume');
    return saved ? parseFloat(saved) : 0.5;
  });
  const [preset, setPreset] = useState<SoundPreset>(() => {
    return (localStorage.getItem('workos_alerts_preset') as SoundPreset) || 'enterprise';
  });
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    localStorage.setItem('workos_alerts_muted', String(isMuted));
  }, [isMuted]);

  useEffect(() => {
    localStorage.setItem('workos_alerts_volume', String(volume));
  }, [volume]);

  useEffect(() => {
    localStorage.setItem('workos_alerts_preset', preset);
  }, [preset]);

  // Synthesize beautiful notifications using Web Audio API
  const playSynthesizedSound = (soundType: 'info' | 'warning' | 'critical' | 'success') => {
    if (isMuted) return;

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;

      const ctx = new AudioContextClass();
      const now = ctx.currentTime;

      // Master Volume Gain Node
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(volume * 0.4, now); // scale master down slightly for comfort
      masterGain.connect(ctx.destination);

      if (preset === 'enterprise') {
        // High fidelity elegant multi-tone chime
        if (soundType === 'critical' || soundType === 'warning') {
          // Urgent chime: minor third interval down (alerting)
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain1 = ctx.createGain();
          const gain2 = ctx.createGain();

          osc1.type = 'triangle';
          osc1.frequency.setValueAtTime(587.33, now); // D5
          osc1.frequency.exponentialRampToValueAtTime(293.66, now + 0.35); // D4

          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(698.46, now + 0.08); // F5 (creates alert minor feel)
          osc2.frequency.exponentialRampToValueAtTime(349.23, now + 0.4); // F4

          gain1.gain.setValueAtTime(0.8, now);
          gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

          gain2.gain.setValueAtTime(0.6, now + 0.08);
          gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.45);

          osc1.connect(gain1);
          osc2.connect(gain2);
          gain1.connect(masterGain);
          gain2.connect(masterGain);

          osc1.start(now);
          osc2.start(now + 0.08);
          osc1.stop(now + 0.5);
          osc2.stop(now + 0.5);
        } else if (soundType === 'success') {
          // Uplifting ascending major triad
          const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
          notes.forEach((freq, index) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + index * 0.07);

            gain.gain.setValueAtTime(0.5, now + index * 0.07);
            gain.gain.exponentialRampToValueAtTime(0.01, now + index * 0.07 + 0.3);

            osc.connect(gain);
            gain.connect(masterGain);

            osc.start(now + index * 0.07);
            osc.stop(now + index * 0.07 + 0.35);
          });
        } else {
          // Standard soft notification (gentle premium corporate chime)
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain1 = ctx.createGain();
          const gain2 = ctx.createGain();

          osc1.type = 'sine';
          osc1.frequency.setValueAtTime(659.25, now); // E5
          osc1.frequency.exponentialRampToValueAtTime(880.00, now + 0.12); // A5

          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(783.99, now + 0.04); // G5
          osc2.frequency.exponentialRampToValueAtTime(1046.50, now + 0.16); // C6

          gain1.gain.setValueAtTime(0.5, now);
          gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

          gain2.gain.setValueAtTime(0.4, now + 0.04);
          gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

          osc1.connect(gain1);
          osc2.connect(gain2);
          gain1.connect(masterGain);
          gain2.connect(masterGain);

          osc1.start(now);
          osc2.start(now + 0.04);
          osc1.stop(now + 0.45);
          osc2.stop(now + 0.45);
        }
      } else if (preset === 'cosmic') {
        // Futuristic space chime with frequency sweeps
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';

        if (soundType === 'critical' || soundType === 'warning') {
          osc.frequency.setValueAtTime(880, now);
          osc.frequency.linearRampToValueAtTime(220, now + 0.5);
          gain.gain.setValueAtTime(0.7, now);
        } else {
          osc.frequency.setValueAtTime(440, now);
          osc.frequency.exponentialRampToValueAtTime(1200, now + 0.3);
          gain.gain.setValueAtTime(0.5, now);
        }

        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(now);
        osc.stop(now + 0.55);
      } else {
        // Digital retro soft beep
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(soundType === 'critical' ? 880 : 1200, now);
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(now);
        osc.stop(now + 0.1);
      }
    } catch (e) {
      console.warn('Audio Context playback failed', e);
    }
  };

  // Register the global trigger
  useEffect(() => {
    globalPlaySound = (priority: string) => {
      const p = priority?.toLowerCase() || '';
      if (p === 'critical' || p === 'high' || p === 'workflow_escalation' || p === 'remediation_required') {
        playSynthesizedSound('critical');
      } else if (p === 'warning' || p === 'medium' || p === 'task_blocked') {
        playSynthesizedSound('warning');
      } else if (p === 'success' || p === 'gate_approved' || p === 'task_completed') {
        playSynthesizedSound('success');
      } else {
        playSynthesizedSound('info');
      }
    };

    return () => {
      globalPlaySound = null;
    };
  }, [isMuted, volume, preset]);

  return (
    <div className="relative">
      <button
        onClick={() => setShowSettings(!showSettings)}
        className={`p-2 rounded-lg transition-all border flex items-center justify-center ${
          isMuted
            ? 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20'
            : 'bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-muted'
        }`}
        title={isMuted ? 'Alert sounds muted' : 'Alert sounds active'}
      >
        {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
      </button>

      {showSettings && (
        <div className="absolute right-0 mt-2.5 w-64 glass-panel-heavy rounded-2xl p-4 border border-border shadow-[0_10px_30px_rgba(0,0,0,0.2)] z-50 animate-scale-in">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
            <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Chime Settings</span>
            </h4>
            <button
              onClick={() => {
                setIsMuted(!isMuted);
                if (isMuted) {
                  setTimeout(() => playSynthesizedSound('info'), 50);
                }
              }}
              className="text-[10px] font-bold px-2 py-0.5 rounded border border-border bg-muted hover:bg-card text-foreground"
            >
              {isMuted ? 'Unmute' : 'Mute'}
            </button>
          </div>

          <div className="space-y-3.5 text-left">
            {/* Volume range slider */}
            <div className="space-y-1">
              <div className="flex justify-between items-center text-[10px] font-bold text-muted-foreground">
                <span>Volume</span>
                <span>{Math.round(volume * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={volume}
                disabled={isMuted}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-full h-1 bg-border rounded-lg appearance-none cursor-pointer accent-blue-500 disabled:opacity-40"
              />
            </div>

            {/* Presets radio list */}
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-muted-foreground block">Chime Preset</span>
              <div className="grid grid-cols-3 gap-1">
                {(['enterprise', 'cosmic', 'digital'] as SoundPreset[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPreset(p)}
                    className={`px-1.5 py-1 rounded text-[9px] font-bold border capitalize transition ${
                      preset === p
                        ? 'bg-blue-600/10 border-blue-500/35 text-blue-400 font-extrabold'
                        : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Test buttons */}
            <div className="pt-2 border-t border-border flex items-center justify-between">
              <span className="text-[9px] font-bold text-muted-foreground">Preview chime:</span>
              <div className="flex gap-1">
                <button
                  onClick={() => playSynthesizedSound('info')}
                  className="px-2 py-0.5 rounded bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-[9px] font-bold border border-blue-500/20"
                >
                  Info
                </button>
                <button
                  onClick={() => playSynthesizedSound('warning')}
                  className="px-2 py-0.5 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-[9px] font-bold border border-amber-500/20"
                >
                  Warn
                </button>
                <button
                  onClick={() => playSynthesizedSound('critical')}
                  className="px-2 py-0.5 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[9px] font-bold border border-red-500/20 animate-pulse"
                >
                  Alert
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
