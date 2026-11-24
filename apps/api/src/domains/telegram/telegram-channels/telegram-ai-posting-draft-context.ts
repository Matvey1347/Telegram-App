import {
  editorialDescription,
  mandatoryChannelRules,
} from './telegram-ai-posting-prompts';
import type { TelegramAiPostingSourceService } from './telegram-ai-posting-source.service';

type SourceContext = Awaited<
  ReturnType<TelegramAiPostingSourceService['collect']>
>;

function compact(value: unknown, length: number) {
  return typeof value === 'string'
    ? value.replace(/\s+/gu, ' ').trim().slice(0, length)
    : '';
}

export function telegramAiPostingDraftContext(
  config: Record<string, any>,
  sources: SourceContext,
) {
  const history = [
    ...sources.existingPosts
      .slice(0, 4)
      .map(({ title }) => compact(title, 120)),
    ...sources.history.slice(0, 5).map(({ text }) => compact(text, 120)),
  ]
    .filter(Boolean)
    .join('\n');
  const evidence = sources.sourceContexts
    .slice(0, 3)
    .map((source) => source.slice(0, 500))
    .join('\n');
  const learning =
    typeof config.learningBlock === 'string'
      ? config.learningBlock
          .split('\n\n')
          .filter((block: string) => !block.startsWith('Антипримеры:'))
          .map((block: string) =>
            block.startsWith('Лучшие посты:')
              ? block.slice(0, 280)
              : block.slice(0, 420),
          )
          .join('\n')
          .slice(0, 750)
      : '';
  const assignment = config.editorialSelection;
  const sphere = assignment?.sphere;
  const rubric = assignment?.rubric;
  const lengths = assignment?.lengths ?? config.lengths;
  const editorial = [
    assignment?.parentSphere ? `Parent sphere: ${compact(assignment.parentSphere.name, 80)}` : '',
    sphere
      ? `Sphere: ${compact(sphere.name, 110)}. ${compact(sphere.description, 550)}`
      : '',
    rubric
      ? `Rubric: ${compact(rubric.name, 80)}. ${compact(rubric.description, 350)} ${compact(rubric.goal, 350)}`
      : '',
    Array.isArray(lengths) && lengths.length
      ? `Permitted authored lengths (characters): ${lengths
          .slice(0, 8)
          .map(
            ({ name, minCharacters, maxCharacters }) =>
              `${compact(name, 45)} ${minCharacters}–${maxCharacters ?? 'caption limit'}`,
          )
          .join(', ')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
  return {
    guidance: [
      editorialDescription(config).slice(0, 1400),
      mandatoryChannelRules(config),
    ]
      .filter(Boolean)
      .join('\n'),
    editorial,
    history,
    evidence,
    learning,
  };
}
