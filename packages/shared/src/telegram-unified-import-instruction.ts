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
      "icon": "📰",
      "imported": false
    }
  ],
  "hypotheses": [
    {
      "ref": "hyp-growth",
      "action": "CREATE",
      "icon": "🧠",
      "imported": false,
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
      "placementMode": "SLOT",
      "slotId": "точный slotId из контекста",
      "scheduledAt": "2026-09-15T09:10:00+02:00",
      "slotKind": "AD",
      "imported": false
    },
    {
      "action": "SCHEDULE",
      "postRef": "post-002",
      "placementMode": "CUSTOM",
      "scheduledAt": "2026-09-15T13:45:00+02:00",
      "imported": false
    },
    {
      "action": "UNSCHEDULE",
      "postId": "точный id существующей запланированной публикации",
      "imported": false
    }
  ],
  "delete": {
    "groups": [{ "id": "точный id удаляемой группы из контекста", "imported": false }],
    "hypotheses": [{ "id": "точный id удаляемой гипотезы из контекста", "imported": false }],
    "posts": [{ "id": "точный id удаляемой публикации из контекста", "imported": false }]
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
6. В каждом элементе groups, hypotheses, posts, schedule и delete обязательно передавай imported:false. После выполнения система сама заменяет его на true только у успешно применённых операций и сохраняет созданные id. Не помечай операцию imported:true самостоятельно.

GROUPS
Формат: {"ref":"group-news","action":"CREATE|UPDATE","id":"только для UPDATE","title":"Название","icon":"emoji или null","imported":false}.
Для CREATE обязателен title. Для UPDATE обязателен существующий id. Удаление передавай через delete.groups.

HYPOTHESES
Формат: {"ref":"hyp-growth","action":"CREATE|UPDATE|ARCHIVE","id":"только для UPDATE/ARCHIVE","icon":"один обычный emoji или null","imported":false,"value":{"name":"Название","description":"Подробное описание","status":"ACTIVE|SUCCESSFUL|FAILED|ARCHIVED","conclusion":"вывод или null"}}.
Для CREATE и UPDATE обязательны value.name. Передавай выбранный emoji напрямую в icon — внутренний iconId система определит автоматически. ARCHIVE сохраняет гипотезу с архивным статусом; полное удаление передавай через delete.hypotheses.

POSTS
Формат: {"ref":"post-001","action":"CREATE|UPDATE","id":"только для UPDATE","title":"Внутреннее название","icon":"один обычный emoji или null","text":"готовый Telegram-текст","imageUrls":[],"imageSearch":["поисковый запрос для картинки"],"groupRef":"ref группы или null","hypothesisRefs":["ref гипотезы"],"imported":false,"approved":false}.
Для CREATE обязателен title. Значок публикации передавай напрямую в icon, без iconId. groupRef и hypothesisRefs должны ссылаться на refs из этого же манифеста. Один пост создавай ровно один раз; удаление передавай через delete.posts.
Для новых публикаций всегда передавай imported:false и approved:false. imported:true означает, что операция уже была успешно обработана системой и не должна импортироваться повторно.
imageSearch отображается в редакторе импорта для поиска новых изображений и не сохраняется в публикации.
В imageUrls передавай только прямые абсолютные HTTP/HTTPS-ссылки. Поисковые фразы передавай в imageSearch, а не в imageUrls. Markdown-ссылка вида [изображение](https://...) будет очищена автоматически, но предпочтителен чистый URL.

SCHEDULE / UNSCHEDULE
КРИТИЧЕСКОЕ ПРАВИЛО: если пользователь просит создать N постов и запланировать каждый из них, массив schedule обязан содержать ровно N отдельных операций SCHEDULE — по одной для каждого postRef. Не пропускай планирование второго и последующих постов. Любое явно названное пользователем время обязательно передай в scheduledAt, даже когда его нет среди PUBLICATION SLOTS.

Пример задачи: «создай один пост на 08:10 и второй на 09:02». Если 08:10 есть в PUBLICATION SLOTS, а 09:02 там нет, в schedule ДОЛЖНЫ быть обе операции:
[
  {"action":"SCHEDULE","postRef":"post-001","placementMode":"SLOT","slotId":"точный slotId слота 08:10 из контекста","scheduledAt":"2026-09-20T08:10:00+02:00","slotKind":"CONTENT","imported":false},
  {"action":"SCHEDULE","postRef":"post-002","placementMode":"CUSTOM","scheduledAt":"2026-09-20T09:02:00+02:00","imported":false}
]
Никогда не заменяй 09:02 ближайшим слотом и не оставляй второй postRef без операции SCHEDULE.

У SCHEDULE есть два режима. SLOT бронирует назначенный каналу слот: {"action":"SCHEDULE","postRef":"post-001","placementMode":"SLOT","slotId":"точный ID назначенного каналу слота","scheduledAt":"ISO-8601 с часовым поясом","slotKind":"CONTENT|AD","imported":false}.
CUSTOM планирует публикацию на произвольные будущие дату и время, независимо от слотов: {"action":"SCHEDULE","postRef":"post-001","placementMode":"CUSTOM","scheduledAt":"ISO-8601 с часовым поясом","imported":false}. Для CUSTOM не передавай slotId и slotKind: такой пост не бронирует слот и не проверяется по расписанию слотов.
Для переноса уже существующей публикации используй postId вместо postRef и тот же выбранный режим.
Для снятия существующей публикации с планирования и возврата в DRAFT: {"action":"UNSCHEDULE","postId":"точный id запланированной публикации из контекста"}.
Для совместимости отсутствие action означает SCHEDULE. Для SCHEDULE используй либо postRef публикации из этого же манифеста, либо точный postId существующей публикации; никогда не передавай оба сразу. Для UNSCHEDULE используй только точный существующий postId со статусом SCHEDULED. Не передавай slotId, scheduledAt или postRef в операции UNSCHEDULE.
Для совместимости без placementMode система считает операцию SLOT при наличии slotId и CUSTOM без slotId. В SLOT используй только слоты из PUBLICATION SLOTS: время scheduledAt обязано совпадать со временем слота в timezone канала. Не используй прошедшие и занятые даты/слоты, не назначай два поста на один слот и не планируй один postRef дважды. Для CUSTOM также не используй прошедшую дату. CONTENT предназначен для обычных публикаций, AD — для рекламы или взаимного пиара.

Перед ответом проверь уникальность refs, существование всех ссылок, корректность статусов, ISO-дат и отсутствие конфликтов расписания.`;
