import type { systemBotNotificationsEn } from './notifications.en';

export const systemBotNotificationsRu: Record<
  keyof typeof systemBotNotificationsEn,
  string
> = {
  completed: 'Завершено: {taskName}',
  failed: 'Ошибка: {taskName}',
  workspace: 'Рабочее пространство: {workspaceName}',
  unknownWorkspace: 'Неизвестное рабочее пространство',
  reason: 'Причина: {reason}',
  taskCompleted: 'Задача завершена',
  taskFailed: 'Задача завершилась с ошибкой',
  duration: 'Длительность: {seconds} с',
};
