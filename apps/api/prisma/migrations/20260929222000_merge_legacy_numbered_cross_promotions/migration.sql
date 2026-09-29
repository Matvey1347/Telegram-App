-- Before multi-publication direct exchanges, an unequal exchange was saved as
-- two plans named "Partner - 1 - price" and "Partner - 2 - price".  Merge
-- only those unambiguous historical records.  TelegramManagedPost is never
-- deleted or changed; its ids are retained by the surviving plan.
DO $$
DECLARE
  grouped record;
  survivor "CrossPromotionPlan"%ROWTYPE;
  source "CrossPromotionPlan"%ROWTYPE;
  source_id text;
  publication jsonb;
  placement_ids jsonb;
  merged_targets jsonb;
  publisher_ids text[];
  partner_ids text[];
  target_baselines jsonb;
  publisher_baselines jsonb;
  ends timestamp(3)[];
BEGIN
  FOR grouped IN
    SELECT
      "workspaceId",
      "advertiserId",
      regexp_replace(title, ' - [1-9][0-9]* - ([0-9]+)$', ' - \1') AS title,
      array_agg(id ORDER BY "scheduledAt", id) AS ids
    FROM "CrossPromotionPlan"
    WHERE kind = 'DIRECT_MUTUAL'
      AND "advertiserId" IS NOT NULL
      AND status IN ('ACTIVE', 'COMPLETED')
      AND "scheduledAt" < CURRENT_TIMESTAMP
      AND title ~ ' - [1-9][0-9]* - [0-9]+$'
    GROUP BY
      "workspaceId",
      "advertiserId",
      regexp_replace(title, ' - [1-9][0-9]* - ([0-9]+)$', ' - \1')
    HAVING COUNT(*) > 1
  LOOP
    SELECT * INTO survivor FROM "CrossPromotionPlan" WHERE id = grouped.ids[1] FOR UPDATE;
    publication := jsonb_set(
      survivor."publicationPost",
      '{publisherPublications}',
      COALESCE(NULLIF(survivor."publicationPost"->'publisherPublications', '[]'::jsonb),
        jsonb_build_array(jsonb_build_object(
          'id', survivor.id || ':legacy-publisher',
          'post', survivor."publicationPost",
          'placements', COALESCE(survivor."publicationPost"->'publisherPlacements', '[]'::jsonb)
        ))),
      TRUE
    );
    placement_ids := COALESCE(survivor."placementPostIds", '[]'::jsonb);
    merged_targets := COALESCE(survivor.targets, '[]'::jsonb);
    publisher_ids := survivor."publisherChannelIds";
    partner_ids := survivor."partnerChannelIds";
    target_baselines := COALESCE(survivor."baselineTargetCounters", '[]'::jsonb);
    publisher_baselines := COALESCE(survivor."baselinePublisherSubscribers", '[]'::jsonb);
    ends := ARRAY[survivor."trackingEndsAt"];

    FOREACH source_id IN ARRAY grouped.ids[2:array_length(grouped.ids, 1)]
    LOOP
      SELECT * INTO source FROM "CrossPromotionPlan" WHERE id = source_id FOR UPDATE;
      publication := jsonb_set(
        publication,
        '{publisherPublications}',
        COALESCE(publication->'publisherPublications', '[]'::jsonb) ||
        COALESCE(NULLIF(source."publicationPost"->'publisherPublications', '[]'::jsonb),
          jsonb_build_array(jsonb_build_object(
            'id', source.id || ':legacy-publisher',
            'post', source."publicationPost",
            'placements', COALESCE(source."publicationPost"->'publisherPlacements', '[]'::jsonb)
          ))),
        TRUE
      );
      placement_ids := placement_ids || COALESCE(source."placementPostIds", '[]'::jsonb);
      merged_targets := merged_targets || COALESCE(source.targets, '[]'::jsonb);
      publisher_ids := publisher_ids || source."publisherChannelIds";
      partner_ids := partner_ids || source."partnerChannelIds";
      target_baselines := target_baselines || COALESCE(source."baselineTargetCounters", '[]'::jsonb);
      publisher_baselines := publisher_baselines || COALESCE(source."baselinePublisherSubscribers", '[]'::jsonb);
      ends := array_append(ends, source."trackingEndsAt");
    END LOOP;

    UPDATE "CrossPromotionPlan"
    SET
      title = grouped.title,
      "publicationPost" = publication,
      "placementPostIds" = (SELECT COALESCE(jsonb_agg(DISTINCT value), '[]'::jsonb) FROM jsonb_array_elements(placement_ids)),
      targets = (SELECT COALESCE(jsonb_agg(DISTINCT value), '[]'::jsonb) FROM jsonb_array_elements(merged_targets)),
      "publisherChannelIds" = ARRAY(SELECT DISTINCT value FROM unnest(publisher_ids) AS item(value)),
      "partnerChannelIds" = ARRAY(SELECT DISTINCT value FROM unnest(partner_ids) AS item(value)),
      "baselineTargetCounters" = (SELECT COALESCE(jsonb_agg(DISTINCT value), '[]'::jsonb) FROM jsonb_array_elements(target_baselines)),
      "baselinePublisherSubscribers" = (SELECT COALESCE(jsonb_agg(DISTINCT value), '[]'::jsonb) FROM jsonb_array_elements(publisher_baselines)),
      "trackingEndsAt" = (SELECT MAX(value) FROM unnest(ends) AS end_at(value)),
      "lastError" = NULL
    WHERE id = survivor.id;

    DELETE FROM "CrossPromotionPlan"
    WHERE id = ANY(grouped.ids[2:array_length(grouped.ids, 1)]);
  END LOOP;
END $$;
