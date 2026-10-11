import { browser } from 'wxt/browser';
import type { ProfessorMood } from '../lib/metrics';
import happyProfessor from '../assets/prof-happy-cutout.png?no-inline';
import sadProfessor from '../assets/prof-sad-cutout.png?no-inline';
import questionableProfessor from '../assets/prof-questionable-cutout.png?no-inline';

const expressions = [
  { mood: 'happy', label: 'Happy', image: happyProfessor },
  { mood: 'questionable', label: 'Questionable', image: questionableProfessor },
  { mood: 'sad', label: 'Sad', image: sadProfessor },
];

/** Shared spotlight and locally bundled sprites for popup and retailer overlays. */
export function Professor({ mood, dialogue, sprite }: { mood: ProfessorMood; dialogue?: string; sprite?: { image: string; label: string } }) {
  const sprites = sprite ? [{ ...sprite, mood }] : expressions;
  return <section className="professor-stage" aria-label="Professor reaction" aria-live="polite" data-mood={mood}>
    <div className="professor-floor" aria-hidden="true" />
    {sprites.map((item) => <img key={item.mood} className="professor-sprite" src={new URL(item.image, browser.runtime.getURL('/')).href} alt={`${item.label} professor`} hidden={mood !== item.mood} draggable={false} />)}
    {dialogue && <p className="professor-bubble">
      <svg className="professor-cloud" viewBox="0 0 264 114" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path d="M22 75 C3 74 0 50 13 39 C7 19 33 9 52 16 C61 -1 89 -1 105 10 C121 -1 148 1 158 12 C180 1 205 7 211 22 C240 18 256 32 249 50 C269 68 251 91 230 90 C221 108 185 110 168 99 C148 113 114 108 104 101 C80 114 53 104 46 94 C30 98 15 87 22 75Z" vectorEffect="non-scaling-stroke" />
      </svg>
      <span>{dialogue}</span>
    </p>}
  </section>;
}
