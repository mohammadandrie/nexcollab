// Built-in avatar presets — DiceBear "fun-emoji" set, served as PNGs by their
// public CDN so we don't need to host SVGs ourselves. Netflix-grid-friendly:
// each preset already comes with its own face/background; we just label them
// for the picker.
//
// To add more: append { id, name, url } where url is any 200x200 PNG/JPG/SVG.
const BASE = 'https://api.dicebear.com/7.x/fun-emoji/png?size=200&seed=';

export const AVATAR_PRESETS = [
  { id: 'fox',      name: 'Fox',      url: `${BASE}fox` },
  { id: 'panda',    name: 'Panda',    url: `${BASE}panda` },
  { id: 'cat',      name: 'Cat',      url: `${BASE}cat` },
  { id: 'tiger',    name: 'Tiger',    url: `${BASE}tiger` },
  { id: 'bear',     name: 'Bear',     url: `${BASE}bear` },
  { id: 'penguin',  name: 'Penguin',  url: `${BASE}penguin` },
  { id: 'unicorn',  name: 'Unicorn',  url: `${BASE}unicorn` },
  { id: 'rocket',   name: 'Rocket',   url: `${BASE}rocket` },
  { id: 'astro',    name: 'Astro',    url: `${BASE}astro` },
  { id: 'wave',     name: 'Wave',     url: `${BASE}wave` },
  { id: 'sun',      name: 'Sun',      url: `${BASE}sun` },
  { id: 'moon',     name: 'Moon',     url: `${BASE}moon` },
];
