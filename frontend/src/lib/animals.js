// Keep this list in sync with backend/server.js's JAM_ANIMALS - the backend
// assigns the name, this just maps it to an emoji for display.
export const ANIMAL_EMOJI = {
  Otter: '🦦', Bear: '🐻', Cat: '🐱', Dog: '🐶', Fox: '🦊', Owl: '🦉',
  Wolf: '🐺', Panda: '🐼', Koala: '🐨', Tiger: '🐯', Lion: '🦁', Rabbit: '🐰',
  Deer: '🦌', Eagle: '🦅', Dolphin: '🐬', Whale: '🐳', Seal: '🦭', Penguin: '🐧',
  Squirrel: '🐿️', Beaver: '🦫', Badger: '🦡', Hedgehog: '🦔', Raccoon: '🦝',
  Elephant: '🐘', Giraffe: '🦒', Zebra: '🦓', Monkey: '🐵', Frog: '🐸', Turtle: '🐢',
};

// Handles the "Otter 2" overflow fallback name (falls back to a generic paw
// print if the base word somehow isn't in the map at all).
export function emojiFor(name) {
  return ANIMAL_EMOJI[name] || ANIMAL_EMOJI[String(name).split(' ')[0]] || '🐾';
}
