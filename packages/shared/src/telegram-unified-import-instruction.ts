export const TELEGRAM_UNIFIED_IMPORT_INSTRUCTION = `Подготовь единый JSON-манифест TelegramUnifiedImport версии 1 на основании приложенного контекста канала.

Верни только корректный JSON без markdown, пояснений и комментариев. Корневой объект:
{"version":1,"groups":[],"hypotheses":[],"posts":[],"schedule":[],"delete":{"groups":[],"hypotheses":[],"posts":[]}}

ТОЧНЫЙ ФОРМАТ ОТВЕТА
{
  "version": 1,
  "groups": [
    {
      "ref": "group-news",
      "action": "CREATE",
      "title": "Название группы",
      "icon": "📰"
    }
  ],
  "hypotheses": [
    {
      "ref": "hyp-growth",
      "action": "CREATE",
      "icon": "🧠",
      "value": {
        "name": "Название гипотезы",
        "description": "Что именно проверяем",
        "status": "ACTIVE",
        "conclusion": null
      }
    }
  ],
  "posts": [
    {
      "ref": "post-001",
      "action": "CREATE",
      "title": "Внутреннее название",
      "icon": "✍️",
      "text": "Готовый текст публикации",
      "imageUrls": [],
      "imageSearch": ["поисковый запрос для новой картинки"],
      "groupRef": "group-news",
      "hypothesisRefs": ["hyp-growth"],
      "imported": false,
      "approved": false
    }
  ],
  "schedule": [
    {
      "action": "SCHEDULE",
      "postRef": "post-001",
      "slotId": "точный slotId из контекста",
      "scheduledAt": "2026-09-15T09:10:00+02:00",
      "slotKind": "AD"
    },
    {
      "action": "UNSCHEDULE",
      "postId": "точный id существующей запланированной публикации"
    }
  ],
  "delete": {
    "groups": [{ "id": "точный id удаляемой группы из контекста" }],
    "hypotheses": [{ "id": "точный id удаляемой гипотезы из контекста" }],
    "posts": [{ "id": "точный id удаляемой публикации из контекста" }]
  }
}

Это образец структуры, а не данные для копирования: замени значения данными из приложенного контекста. Для UPDATE/ARCHIVE и каждого элемента delete добавляй точный существующий id. Не добавляй id в CREATE.

УДАЛЕНИЕ И АРХИВАЦИЯ
Все физические удаления передавай только внутри общего корневого объекта delete:
"delete":{"groups":[{"id":"точный id группы"}],"hypotheses":[{"id":"точный id гипотезы"}],"posts":[{"id":"точный id публикации"}]}
Для удаления нужен только точный существующий id из контекста; не передавай ref, title, text, value, groupRef или hypothesisRefs. Не обновляй, не связывай и не планируй сущность, id которой указан в delete.
Чтобы сохранить гипотезу, но убрать её из активной работы, используй архивацию:
{"ref":"archive-hypothesis-existing","action":"ARCHIVE","id":"точный id гипотезы из контекста"}

ОБЩИЕ ПРАВИЛА
1. Порядок применения: groups, hypotheses, posts, затем операции schedule (SCHEDULE/UNSCHEDULE), затем delete.posts, delete.hypotheses, delete.groups.
2. Каждый объект groups, hypotheses и posts обязан иметь уникальный стабильный ref. Новые связанные сущности ссылаются друг на друга через ref; существующие изменяются только по точному id из контекста.
3. Никогда не придумывай id, slotId, ссылки, emoji или даты. Если данных недостаточно — пропусти операцию.
4. Не создавай дубликаты существующих групп, гипотез и публикаций.
5. Сохраняй Telegram-разметку, переносы строк, ссылки и Premium Emoji из исходного текста.

GROUPS
Формат: {"ref":"group-news","action":"CREATE|UPDATE","id":"только для UPDATE","title":"Название","icon":"emoji или null"}.
Для CREATE обязателен title. Для UPDATE обязателен существующий id. Удаление передавай через delete.groups.

HYPOTHESES
Формат: {"ref":"hyp-growth","action":"CREATE|UPDATE|ARCHIVE","id":"только для UPDATE/ARCHIVE","icon":"один обычный emoji или null","value":{"name":"Название","description":"Подробное описание","status":"ACTIVE|SUCCESSFUL|FAILED|ARCHIVED","conclusion":"вывод или null"}}.
Для CREATE и UPDATE обязательны value.name. Передавай выбранный emoji напрямую в icon — внутренний iconId система определит автоматически. ARCHIVE сохраняет гипотезу с архивным статусом; полное удаление передавай через delete.hypotheses.

POSTS
Формат: {"ref":"post-001","action":"CREATE|UPDATE","id":"только для UPDATE","title":"Внутреннее название","icon":"один обычный emoji или null","text":"готовый Telegram-текст","imageUrls":[],"imageSearch":["поисковый запрос для картинки"],"groupRef":"ref группы или null","hypothesisRefs":["ref гипотезы"],"imported":false,"approved":false}.
Для CREATE обязателен title. Значок публикации передавай напрямую в icon, без iconId. groupRef и hypothesisRefs должны ссылаться на refs из этого же манифеста. Один пост создавай ровно один раз; удаление передавай через delete.posts.
Для новых публикаций всегда передавай imported:false и approved:false. imported:true означает, что публикация уже была обработана ранее и не должна импортироваться повторно.
imageSearch отображается в редакторе импорта для поиска новых изображений и не сохраняется в публикации.
В imageUrls передавай только прямые абсолютные HTTP/HTTPS-ссылки. Поисковые фразы передавай в imageSearch, а не в imageUrls. Markdown-ссылка вида [изображение](https://...) будет очищена автоматически, но предпочтителен чистый URL.

SCHEDULE / UNSCHEDULE
Для планирования: {"action":"SCHEDULE","postRef":"post-001","slotId":"точный ID назначенного каналу слота","scheduledAt":"ISO-8601 с часовым поясом","slotKind":"CONTENT|AD"}.
Для переноса уже существующей публикации на другой слот: {"action":"SCHEDULE","postId":"точный id существующей публикации","slotId":"точный ID назначенного каналу слота","scheduledAt":"ISO-8601 с часовым поясом","slotKind":"CONTENT|AD"}.
Для снятия существующей публикации с планирования и возврата в DRAFT: {"action":"UNSCHEDULE","postId":"точный id запланированной публикации из контекста"}.
Для совместимости отсутствие action означает SCHEDULE. Для SCHEDULE используй либо postRef публикации из этого же манифеста, либо точный postId существующей публикации; никогда не передавай оба сразу. Для UNSCHEDULE используй только точный существующий postId со статусом SCHEDULED. Не передавай slotId, scheduledAt или postRef в операции UNSCHEDULE.
Используй только слоты из PUBLICATION SLOTS. Время scheduledAt обязано совпадать со временем слота в timezone канала. Не используй прошедшие и занятые даты/слоты, не назначай два поста на один слот и не планируй один postRef дважды. CONTENT предназначен для обычных публикаций, AD — для рекламы или взаимного пиара.

Перед ответом проверь уникальность refs, существование всех ссылок, корректность статусов, ISO-дат и отсутствие конфликтов расписания.`;
