import { summarizeReply } from './telegram-crm-reply-summary';

const inboundAt = new Date('2026-09-06T10:00:00.000Z');
const base = {
  contactId: 'contact-1',
  inboundMessageCount: 1,
  outboundMessageCount: 0,
  historyExhausted: true,
  lastInboundAt: inboundAt,
  lastOutboundAt: null,
  unreadCount: 0,
};

describe('CRM reply summary', () => {
  it.each([
    [0, 'FIRST_INBOUND_READ'],
    [1, 'FIRST_INBOUND_UNREAD'],
  ] as const)(
    'classifies a first inbound with unread=%s',
    (unreadCount, status) => {
      expect(
        summarizeReply({ id: 'contact-1', replyAlertMutedAt: null }, [
          { ...base, unreadCount },
        ]),
      ).toMatchObject({
        status,
        inboundMessageCount: 1,
        outboundMessageCount: 0,
      });
    },
  );

  it.each([
    [0, 'CONVERSATION_UNANSWERED_READ'],
    [2, 'CONVERSATION_UNANSWERED_UNREAD'],
  ] as const)(
    'classifies an unanswered established conversation with unread=%s',
    (unreadCount, status) => {
      expect(
        summarizeReply({ id: 'contact-1', replyAlertMutedAt: null }, [
          {
            ...base,
            inboundMessageCount: 3,
            outboundMessageCount: 2,
            unreadCount,
          },
        ]),
      ).toMatchObject({ status, unreadCount });
    },
  );

  it('uses the mute timestamp as a waterline so a later inbound alerts again', () => {
    expect(
      summarizeReply({ id: 'contact-1', replyAlertMutedAt: inboundAt }, [base])
        .muted,
    ).toBe(true);
    expect(
      summarizeReply(
        {
          id: 'contact-1',
          replyAlertMutedAt: new Date('2026-09-06T09:59:59.000Z'),
        },
        [base],
      ).muted,
    ).toBe(false);
  });

  it('reports incomplete counts until all active histories are exhausted', () => {
    const summary = summarizeReply(
      { id: 'contact-1', replyAlertMutedAt: null },
      [{ ...base, historyExhausted: false }],
    );
    expect(summary.countsComplete).toBe(false);
    expect(summary.status).toBe('CONVERSATION_UNANSWERED_READ');
  });

  it('does not let an outbound message in another account hide an unanswered inbound', () => {
    const summary = summarizeReply(
      { id: 'contact-1', replyAlertMutedAt: null },
      [
        {
          ...base,
          inboundMessageCount: 2,
          lastInboundAt: new Date('2026-09-06T10:00:00.000Z'),
          lastOutboundAt: new Date('2026-09-06T09:00:00.000Z'),
          unreadCount: 1,
        },
        {
          ...base,
          inboundMessageCount: 0,
          outboundMessageCount: 1,
          lastInboundAt: null,
          lastOutboundAt: new Date('2026-09-06T11:00:00.000Z'),
          unreadCount: 0,
        },
      ],
    );

    expect(summary).toMatchObject({
      status: 'CONVERSATION_UNANSWERED_UNREAD',
      inboundMessageCount: 2,
      outboundMessageCount: 1,
      unreadCount: 1,
    });
  });
});
