import { useStore } from './store';

// 효과음은 파일 없이 짧은 잡음과 저음을 합성해서 낸다.
let ctx: AudioContext | null = null;

function audio() {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function noise(ac: AudioContext, dur: number, opts: { freq: number; q: number; gain: number; attack?: number; sweep?: number }) {
  const len = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = opts.freq;
  if (opts.sweep) filter.frequency.exponentialRampToValueAtTime(opts.sweep, ac.currentTime + dur);
  filter.Q.value = opts.q;
  const g = ac.createGain();
  const t = ac.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(opts.gain, t + (opts.attack ?? 0.01));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(g).connect(ac.destination);
  src.start();
}

function thump(ac: AudioContext, freq: number, gain: number, dur = 0.15, delay = 0) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  const t = ac.currentTime + delay;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(freq * 0.5, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ac.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export type Sfx = 'pull' | 'place' | 'flip' | 'shelve' | 'trash';

export function play(sfx: Sfx) {
  if (!useStore.getState().settings.sound) return;
  const ac = audio();
  if (!ac) return;
  switch (sfx) {
    case 'pull':
      noise(ac, 0.28, { freq: 900, q: 0.8, gain: 0.25, attack: 0.04, sweep: 500 });
      break;
    case 'place':
      thump(ac, 140, 0.35, 0.12);
      noise(ac, 0.08, { freq: 2000, q: 1, gain: 0.08 });
      break;
    case 'flip':
      noise(ac, 0.3, { freq: 3000, q: 0.6, gain: 0.12, attack: 0.08, sweep: 1500 });
      break;
    case 'shelve':
      noise(ac, 0.22, { freq: 700, q: 0.8, gain: 0.2, attack: 0.03 });
      thump(ac, 110, 0.4, 0.14, 0.2);
      break;
    case 'trash':
      noise(ac, 0.5, { freq: 600, q: 0.5, gain: 0.2, attack: 0.05, sweep: 200 });
      thump(ac, 80, 0.5, 0.25, 0.45);
      break;
  }
}
