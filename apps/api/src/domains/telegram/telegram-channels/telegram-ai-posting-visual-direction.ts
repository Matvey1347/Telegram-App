const directions = {
  'still-life': 'A real editorial STILL LIFE where one or two specific objects dominate. Vary materials, angles and backgrounds. Avoid repeating a notebook and cup on a wooden table. No visible person or hands.',
  illustration: 'An unmistakably drawn ILLUSTRATION with visible ink, block print, graphic cut paper or gouache. Draw an expressive scene or character. Reject photographic realism, faux photo renderings, and any teacup-and-notebook composition.',
  landscape: 'A wide OUTDOOR LANDSCAPE, coast, fields, hills, park, or outdoor cityscape with depth and a sense of place. The outdoor view fills the entire image. No interior, no framed window view, no furniture, no foreground people.',
  abstract: 'An unmistakable ABSTRACT metaphor: ink marks, torn shapes, experimental collage, or an evocative object relationship with a deliberately nonliteral arrangement. No ordinary interior, lifestyle photo, tabletop setting, or identifiable person.',
  documentary: 'A candid DOCUMENTARY photograph of an unposed person engaged in a meaningful action, or an unstaged public setting with a concrete event or trace of activity. No tabletop still life, beauty portrait, or staged lifestyle stock.',
} as const;

export type TelegramAiPostingVisualDirection = keyof typeof directions;

const rotation: TelegramAiPostingVisualDirection[] = [
  'still-life', 'illustration', 'landscape', 'abstract', 'documentary',
];

const contrastingMotifs: Record<TelegramAiPostingVisualDirection, readonly [string, string]> = {
  'still-life': [
    'Use close detail, an unusual crop, or objects against a plain material surface.',
    'Use a wide quiet composition, an overhead viewpoint, or a single object in open space.',
  ],
  illustration: [
    'Use a graphic print approach: ink, block-print shapes, or bold flat cut paper.',
    'Use a visibly painted approach: loose gouache, watercolor, or dry-brush textures.',
  ],
  landscape: [
    'Choose a natural outdoor landscape: hills, coast, wetlands, open fields, or mountains.',
    'Choose an outdoor built environment: a rainwashed street, a public park, a courtyard, or a distant city skyline. Do not use a coastline or a beach.',
  ],
  abstract: [
    'Make a two-dimensional visual metaphor from torn paper, ink marks, or shape and color.',
    'Make a three-dimensional symbolic composition with sculptural shapes, interrupted patterns, or unexpected material relationships.',
  ],
  documentary: [
    'Capture an unposed human gesture from the side or behind, in an ordinary real environment.',
    'Capture an unposed public scene, a small group in action, or real traces of activity. Avoid someone gazing out of a window.',
  ],
};

export function telegramAiPostingVisualMotif(direction: TelegramAiPostingVisualDirection, ordinal: number) {
  return contrastingMotifs[direction][Math.floor(ordinal / rotation.length) % 2];
}

export function readTelegramAiPostingVisualDirection(value: unknown) {
  return typeof value === 'string' && Object.hasOwn(directions, value)
    ? value as TelegramAiPostingVisualDirection : undefined;
}

export function telegramAiPostingVisualDirection(index: number) {
  return rotation[index % rotation.length];
}

export function telegramAiPostingVisualBrief(direction: TelegramAiPostingVisualDirection) {
  return directions[direction];
}

export const telegramAiPostingVisualQuality =
  'Avoid waxy or airbrushed surfaces, plastic skin, artificial bokeh, excessive cinematic grading, staged poses, immaculate luxury stock aesthetics, exaggerated perfect symmetry, and image-generator gloss. For photographic work use available light, ordinary details, and believable irregular textures. Keep deliberately graphic, textural or monochrome artwork when the assigned medium calls for it.';

export function telegramAiPostingVisualReview(direction: TelegramAiPostingVisualDirection) {
  return `The assigned visual form is required: ${directions[direction]} Accept atmosphere or metaphor only after the actual pixels satisfy the form. An indoor view through a window is never landscape. An ordinary arrangement of objects on furniture is still-life even when the objects are symbolic. A realistically rendered indoor illustration is still-life or documentary unless visible art technique dominates. Classify actual pixels independently under exactly one value: still-life, illustration, landscape, abstract, documentary, other. Set candidateForm to that value for the candidate you select. Set candidateIndex to 0 if no candidate meets the required form. For quotations, the author’s name is attribution, not a request for a portrait. Reject any candidate that fails the assigned form or looks like glossy staged AI imagery. ${telegramAiPostingVisualQuality}`;
}

export function prefersColorEditorialImages(input: { channelUsername?: string | null; channelTitle?: string | null }) {
  return input.channelUsername?.replace(/^@/, '').toLowerCase() === 'women_power' ||
    /^жіноча сила(?:\s*🍃)?$/iu.test(input.channelTitle?.trim() ?? '');
}

export function buildTelegramAiPostingImagePrompt(
  input: Parameters<typeof prefersColorEditorialImages>[0] & {
    topic: string;
    prompt: string;
    visualPreference?: string;
    generationDescription?: string;
    revisionDirection?: string;
    language?: string;
    visualDirection?: TelegramAiPostingVisualDirection;
  },
  hasReference: boolean,
  singleReference = false,
) {
  const candid = !input.visualDirection && prefersColorEditorialImages(input);
  return [
    `Create one new editorial visual for a Telegram post about ${input.topic}.`,
    input.revisionDirection && `Required revision for this image: ${input.revisionDirection}. This specifies the scene and takes priority over prior briefs and references.`,
    input.visualDirection && `Required visual form: ${telegramAiPostingVisualBrief(input.visualDirection)} ${telegramAiPostingVisualQuality} The visual form outranks any conflicting subject, setting or style described anywhere else in this brief. Replace a conflicting scene with a concrete subject in the required form that echoes the post. Do not render a known person’s likeness.`,
    hasReference
      ? `Treat the attached ${singleReference ? 'reference photograph or artwork' : 'reference sheet'} as the primary visual direction. Match its recurring framing, camera distance, movement, light, color or monochrome treatment, contrast, texture and mood. Use the closest coherent reference as the main guide. Use the reference only for visual treatment. The new scene must directly represent this post. Change the location, subject and action of the reference. Preserve only visual attributes such as light, framing and grain. Render one frame. Do not replicate a reference, copy faces or reproduce text.`
      : '',
    candid && 'Use natural color. A black-and-white reference guides composition and expression only. Keep the new image in color.',
    input.visualPreference ? `Selected visual direction: ${input.visualPreference}` : '',
    input.generationDescription ? `Generation brief, including required framing and exclusions: ${input.generationDescription}` : '',
    !input.revisionDirection && (input.visualDirection ? `Optional subject inspiration, only if compatible with the required form: ${input.prompt}` : `Required subject and action for this topic: ${input.prompt}`),
    !hasReference && !input.visualPreference && !input.generationDescription
      ? candid
        ? 'For photographic directions, use an unposed, everyday documentary frame with available light, natural skin texture and gestures that fit the idea. Avoid model poses, glamour and stock-photo staging. Keep explicitly requested non-photographic styles.'
        : 'For photographic directions, use natural light and plausible anatomy.'
      : 'The visual direction governs the look. The topic governs the subject; avoid generic lifestyle scenes disconnected from the post.',
    `Do not add dialogue bubbles, chat interfaces, captions, text overlays or watermarks. Compose ordinary photographs without readable lettering. If the brief explicitly requires natural lettering within the scene, use only ${input.language || 'the language of the post'}.`,
  ].filter(Boolean).join(' ');
}
