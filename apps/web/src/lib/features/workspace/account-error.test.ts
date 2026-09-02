import { describe, expect, it } from "vitest";
import axios from "axios";
import { localizedAccountError } from "./account-error";

const translate = (key: string) =>
  ({
    "account.errors.currentPasswordIncorrect": "Текущий пароль указан неверно.",
    "account.errors.updatePassword": "Не удалось обновить пароль.",
  })[key] ?? key;

describe("localizedAccountError", () => {
  it("uses a stable backend code instead of its English message", () => {
    const error = new axios.AxiosError(
      "Request failed",
      "401",
      undefined,
      undefined,
      {
        data: {
          code: "ACCOUNT_CURRENT_PASSWORD_INCORRECT",
          message: "Current password is incorrect",
        },
        status: 401,
        statusText: "Unauthorized",
        headers: {},
        config: { headers: {} } as never,
      },
    );

    expect(
      localizedAccountError(
        error,
        translate as never,
        "account.errors.updatePassword",
      ),
    ).toBe("Текущий пароль указан неверно.");
  });
});
