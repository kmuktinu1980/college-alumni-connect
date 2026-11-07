// Fast, free first pass on a booking brief. Catches the obviously vague ones
// ("career guidance", "help with my project") before spending an API call,
// and is the whole check when no Claude key is configured.

export const MIN_BRIEF_CHARS = 40;

const GENERIC = [
  /^(general\s+)?(career\s+)?(guidance|advice|help|tips|mentorship|mentoring|suggestions)\.?$/i,
  /^(i\s+)?(want|need|would like)\s+(some\s+)?(guidance|advice|help|tips)(\s+(on|about|with|regarding)\s+\S+(\s+\S+){0,5})?\.?$/i,
  /^(help|advice|guidance)\s+(on|about|with|regarding)\s+(my\s+)?(project|career|future|startup|research|placements?|internships?)\.?$/i,
  /^(just\s+)?(want\s+to\s+)?(talk|chat|discuss|connect)(\s+about\s+\S+(\s+\S+){0,5})?\.?$/i,
  /^(anything|everything|whatever|open|open to anything|n\/?a|na|tbd)\.?$/i,
];

const QUESTION_HINTS =
  /\?|\b(how|whether|which|what|should|choose|choosing|decide|deciding|between|versus|vs\.?|stuck|tried|trying|compare|evaluate|validate|plan|approach)\b/i;

/**
 * `strict` adds a looser heuristic (short briefs with no question in them) for
 * when Claude isn't available to make the judgment call.
 */
export function quickBriefCheck(topic: string, strict = false): { specific: boolean; feedback: string; suggestion: string } {
  const t = topic.trim().replace(/\s+/g, " ");
  const tooShort = t.length < MIN_BRIEF_CHARS;
  const generic = GENERIC.some((re) => re.test(t));
  if (!tooShort && !generic) {
    if (strict && t.length < 120 && !QUESTION_HINTS.test(t))
      return {
        specific: false,
        feedback: "Mentors prepare best from a concrete question. Say what you want to decide or solve, and what you've tried so far.",
        suggestion: `${t.replace(/\.$/, "")}. Specifically, I want to figure out [the decision or problem]. So far I've [what you've tried], and I'm stuck on [where you're stuck].`,
      };
    return { specific: true, feedback: "", suggestion: "" };
  }
  return {
    specific: false,
    feedback: tooShort && !generic
      ? "That's a bit short for a mentor to prepare from. Add the specific question and a line of context."
      : "That's broad enough that most of the session would go to working out what to discuss. Name the specific question or decision.",
    suggestion: `I'd like advice on [the specific question or decision]. Context: [where my project or plans stand]. So far I've [what you've tried], and I'm unsure about [the part you're stuck on].`,
  };
}
