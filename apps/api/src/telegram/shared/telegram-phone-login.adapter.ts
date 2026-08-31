import { Api, TelegramClient } from 'telegram';
import type { TelegramAccountProfile } from './telegram-mtproto-account-profile';

type PhoneLoginDependencies = {
  createClient: (session?: string) => Promise<TelegramClient>;
  closeClient: (client: TelegramClient) => Promise<void>;
  saveSession: (client: TelegramClient) => string;
  getProfile: (
    client: TelegramClient,
    user?: Api.User | null,
  ) => Promise<TelegramAccountProfile>;
};

export async function startTelegramPhoneLogin(
  apiId: string,
  apiHash: string,
  phone: string,
  forceSms: boolean,
  dependencies: PhoneLoginDependencies,
) {
  const client = await dependencies.createClient();
  try {
    const sent = await client.sendCode(
      { apiId: Number(apiId), apiHash },
      phone,
      forceSms,
    );
    return {
      phoneCodeHash: sent.phoneCodeHash,
      isCodeViaApp: sent.isCodeViaApp,
      tempSession: dependencies.saveSession(client),
    };
  } finally {
    await dependencies.closeClient(client);
  }
}

export async function signInTelegramWithCode(
  params: {
    apiId: string;
    apiHash: string;
    phone: string;
    phoneCodeHash: string;
    code: string;
    tempSession?: string;
  },
  dependencies: PhoneLoginDependencies,
) {
  const client = await dependencies.createClient(params.tempSession);
  try {
    try {
      const result = await client.invoke(
        new Api.auth.SignIn({
          phoneNumber: params.phone,
          phoneCodeHash: params.phoneCodeHash,
          phoneCode: params.code,
        }),
      );
      if (result instanceof Api.auth.AuthorizationSignUpRequired) {
        throw new Error(
          'This phone requires sign up and is not supported in this flow yet.',
        );
      }
      const profile = await dependencies.getProfile(
        client,
        result.user as Api.User,
      );
      return {
        session: dependencies.saveSession(client),
        me: profile,
        needsPassword: false,
        tempSession: dependencies.saveSession(client),
      };
    } catch (error: unknown) {
      if (
        (error as { errorMessage?: string })?.errorMessage ===
        'SESSION_PASSWORD_NEEDED'
      ) {
        return {
          session: '',
          me: null,
          needsPassword: true,
          tempSession: dependencies.saveSession(client),
        };
      }
      throw error;
    }
  } finally {
    await dependencies.closeClient(client);
  }
}

export async function signInTelegramWithPassword(
  params: {
    apiId: string;
    apiHash: string;
    password: string;
    tempSession?: string;
  },
  dependencies: PhoneLoginDependencies,
) {
  const client = await dependencies.createClient(params.tempSession);
  try {
    const authUser = (await client.signInWithPassword(
      { apiId: Number(params.apiId), apiHash: params.apiHash },
      {
        password: async () => params.password,
        onError: (error) => {
          throw error;
        },
      },
    )) as Api.User;
    return {
      session: dependencies.saveSession(client),
      me: await dependencies.getProfile(client, authUser),
    };
  } finally {
    await dependencies.closeClient(client);
  }
}
