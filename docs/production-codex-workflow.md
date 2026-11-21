# Codex production workflow

Use `pnpm dev:local` for ordinary development and local Compose data. Use
`pnpm dev:prod-ui --live` to compare the local frontend with the deployed API.
Use `pnpm dev:prod-operator --live` to exercise local publication logic with
the selected production records and the existing Railway Telegram runtime.
The [local and production setup](setup/LOCAL_PRODUCTION_WORKFLOWS.md) covers
commands, private profile, supported routes and browser verification.

## Edit and test before deployment

1. Prepare one private fixture channel and one ordinary managed post. For
   Ad Sales also configure the exact deal and placement with its attached
   managed post. Assign a connected Telegram actor for that channel through
   normal production configuration.
2. Make the business or formatter change locally. Start or sequentially
   restart the operator. The launcher verifies target fingerprint, restricted
   role, schema, named owner, workspace, channel, optional placement and
   Railway transport version before serving requests.
3. Sign in normally and open the local post editor or selected deal. Confirm
   the exact revision. The local Nest handler runs the canonical publisher
   and placement transition. Railway accepts only the already prepared,
   journal-bound Bot API or MTProto operation. It checks the actor, content
   hash, claim and current revision, then records the Telegram acknowledgement
   in PostgreSQL before returning. The normal deployed publish endpoint is
   outside the operator path.
4. Verify the actual payload and message IDs against Telegram and reload the
   post, deal and channel calendar. Disconnections leave a durable fence.
   Complete ACKs can be projected locally without a send. Uncertain outcomes
   stay blocked pending reconciliation. Before another local restart, let the
   previous request finish or record its receipt state.
5. Run the normal code and release gates. When an authorized release is due,
   follow the repository AI sync gate, `pnpm release:check` and the Railway
   deployment procedure. Verify the deployed version using live UI. A local
   formatter change in a supported use case needs no matching production
   rollout before the operator test.

## First release of the transport

Prompt 4 deploys the bootstrap and performs the live check. Apply the
additive operator receipt migration `20261121122000_operator_send_receipts`
before the Railway code that reads the new nullable fields. The operator
candidate also requires the earlier local recovery schema, including
`20261121120000_campaign_invite_window_attempt` and
`20261121121000_invite_counter_observations`. Drain older snapshot readers
before enabling writes that store nullable invite observations.

The cloud slice consists of the transport-v1 metadata endpoint,
`operator-send`, the exact-ID publication evidence read, and the existing
native recovery transport with pinned-sender and cancellation-ACK checks.
Deploy their module registration, shared journal and publisher fencing, and
generated Prisma client together. It uses the existing Telegram runtime,
JWT policy and database. No new service, webhook, background job or session
is involved. The candidate launcher fails before binding its gateway if
these dependencies are unavailable. Keep compatibility with the existing
live API while the nullable receipt columns are present.

## One-shot recovery against deployed logic

`pnpm production:ads` remains a separate deployed-API client for a specific
existing placement. Supply `PRODUCTION_API_URL` and `PRODUCTION_API_TOKEN`
through the protected environment. It previews by default.

```sh
pnpm production:ads read --sale-id '<deal-id>'
pnpm production:ads recover --sale-id '<deal-id>' --placement-id '<placement-id>'
```

Only when the preview admits the exact action, pass `--execute` and the
printed confirmation. Use `PUBLISH SALE <deal-id> PLACEMENT <placement-id>`
for a new send or `RECONCILE SALE <deal-id> PLACEMENT <placement-id>` when
the publication already exists. This path verifies Telegram evidence and
rereads the result. The localhost alias `pnpm production:recovery --live`
uses the same request-only operator launcher as `pnpm dev:prod-operator --live`.

To add another operator use case, select one canonical business entry point,
pin each object boundary, and add a specific transport operation only if the
existing I/O contract cannot serve it. Prove revision fencing, uncertainty
handling and authoritative rereads before adding the route to the gateway.
