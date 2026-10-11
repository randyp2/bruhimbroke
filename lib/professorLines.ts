import type { ProfessorMood } from "./metrics";

/** Setup dialogue follows the current step, including when a saved draft resumes. */
export const onboardingLines: Record<1 | 2 | 3, string> = {
  1: "Did you get a raise?",
  2: "Got a raise? We’ll use the extra. No raise yet? Set a shopping target.",
  3: "Your shopping history, your call.",
};

/** Playful second-person commentary, not evidence of unrecorded purchases or habits. */
export const professorLines: Record<ProfessorMood, readonly string[]> = {
  happy: [
    "Your wallet called. For once, it wasn’t a complaint.",
    "You can enjoy Chipotle without sponsoring its next location.",
    "Your raise doesn’t have to come with a bigger Chipotle order.",
    "You don’t need every extra at Chipotle. The bowl will still close.",
    "You can say no to guac. Chipotle won’t revoke your membership.",
    'I used to audit finances at Deloitte. Your cart is still hard to reconcile.',
    "Look at you, leaving room for something besides more stuff.",
    "You don’t need new tennis gear to celebrate one good serve.",
    "You get my approval today. Please don’t celebrate by shopping.",
    "Your wallet can relax. You haven’t given me much to complain about.",
  ],
  questionable: [
    "Is your Chipotle order lunch, or are you trying to buy the franchise?",
    "Are you hungry, or did the Chipotle app just send you a notification?",
    "You know “add guac” is a question, not an instruction, right?",
    "Does your Chipotle order need double everything, or just a second thought?",
    "You don’t save money by adding chips to qualify for a deal.",
    "You wanted this before the sale, right? Right?",
    "You’re calling it self-care. Your cart is calling it a sales target.",
    'I teach accounting. Did you reconcile this purchase with what you already own?',
    "A new racket won’t fix your backhand. You knew that, right?",
    "I juggled 400+ times. You can survive ten seconds without checkout.",
  ],
  sad: [
    "Is your raise for you, or are you putting Chipotle through college?",
    "You’re ordering Chipotle like the receipt is a loyalty contest.",
    "Your Chipotle bowl does not need a first-class upgrade.",
    "You can close the Chipotle app. The burritos will still be there.",
    "You’re adding extras like your future self offered to pay.",
    "You’re one “treat yourself” away from treating the whole store.",
    'You don’t need a Deloitte audit. You need to close a shopping tab.',
    "You’re shopping like every purchase comes with a trophy. It doesn’t.",
    "I juggled 400+ times. Even I’d put your cart down for a minute.",
    "You can ignore me. Your receipt will explain it again.",
  ],
};
