export type TelegramLoginStartResponse = {
  success: true;
  status: "needs_code";
  isCodeViaApp: boolean;
  smsUnavailable?: boolean;
};
