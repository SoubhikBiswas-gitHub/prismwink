export type Phase = 'visible' | 'vanishing' | 'hidden' | 'returning';
export type Mic = 'live' | 'muted' | 'already' | 'yours' | 'unknown';

export const MIC_TEXT: Record<Mic, string> = { live: '', muted: 'Mic muted', already: 'Mic was off', yours: 'Mic is your call', unknown: 'Mic unchanged' };

export function clockTime(time: number, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(time)
    .map((part) => part.type === 'dayPeriod' ? part.value.replace(/\./g, '').toUpperCase() : part.value).join('');
}

export function since(start: number, now = Date.now(), locale?: string): string {
  const at = clockTime(start, locale);
  const minutes = Math.max(0, Math.floor((now - start) / 60000));
  if (minutes < 1) return `Since ${at}`;
  if (minutes < 60) return `Since ${at} · ${minutes} min`;
  return `Since ${at} · ${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export interface Status { camera: boolean; phase: Phase; since: number; duration: number; mic: Mic; vision: 'loading' | 'ready' | 'error'; effects?: 'full' | 'limited'; error: string; hand: 'none' | 'hand' | 'armed'; room: number; gestures: boolean; notice: string }
export interface View { tone: 'idle' | 'ready' | 'hand' | 'armed' | 'busy' | 'hidden' | 'error'; pose: 'open' | 'pinch' | 'snapped' | 'coach'; title: string; detail: string }

export function describe(status: Status, reducedMotion = false, now = Date.now()): View {
  const gesture = status.gestures && status.vision === 'ready';
  const room = status.effects === 'limited' ? 'Dust effect needs graphics acceleration' : status.room < 0.6 ? `Learning your room · ${Math.round(status.room * 100)}%` : '';
  const coach = gesture && !reducedMotion ? 'coach' : 'open';
  switch (status.phase) {
    case 'vanishing': return { tone: 'busy', pose: 'snapped', title: 'Vanishing…', detail: status.mic === 'muted' ? 'Mic muted by Prismwink' : MIC_TEXT[status.mic] };
    case 'returning': return { tone: 'busy', pose: 'snapped', title: 'Coming back…', detail: status.mic === 'live' ? 'Mic back on' : '' };
    case 'hidden': return { tone: 'hidden', pose: status.hand === 'armed' ? 'pinch' : status.hand === 'hand' ? 'open' : coach, title: gesture ? 'Hidden · snap to return' : 'You’re hidden', detail: [since(status.since, now), MIC_TEXT[status.mic]].filter(Boolean).join(' · ') };
  }
  if (!status.camera) return { tone: 'idle', pose: 'open', title: 'Prismwink', detail: 'Turn on your camera to start' };
  if (status.vision === 'error') return { tone: 'error', pose: 'open', title: 'Gesture unavailable', detail: status.error || 'Use the button or Alt+Shift+V' };
  if (status.vision === 'loading') return { tone: 'busy', pose: 'open', title: 'Getting ready…', detail: 'Loading on-device tracking' };
  if (!status.gestures) return { tone: 'ready', pose: 'open', title: 'Ready', detail: room || 'Press Vanish or Alt+Shift+V' };
  if (status.hand === 'armed') return { tone: 'armed', pose: 'pinch', title: 'Now snap', detail: room || 'Release to vanish' };
  if (status.hand === 'hand') return { tone: 'hand', pose: 'open', title: 'Hand seen', detail: room || 'Press thumb and middle finger together' };
  return { tone: 'ready', pose: coach, title: 'Snap to vanish', detail: room || 'Raise a hand, pinch, then snap' };
}
