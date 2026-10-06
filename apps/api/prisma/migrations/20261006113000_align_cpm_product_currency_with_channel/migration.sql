-- CPM is defined by TelegramChannel.adBaseCpm, whose unit is
-- TelegramChannel.adBaseCurrency. Older products retained their creation-time
-- currency after the channel currency changed, causing 263 UAH to be quoted
-- as 263 USD. Fixed-price products deliberately keep their own currency.
UPDATE "TelegramAdProduct" AS product
SET "currency" = channel."adBaseCurrency"
FROM "TelegramChannel" AS channel
WHERE product."telegramChannelId" = channel."id"
  AND product."workspaceId" = channel."workspaceId"
  AND product."defaultPricingMode" = 'CPM'
  AND product."currency" <> channel."adBaseCurrency";
