import type {
  CrmCopilotFact,
  CrmPackageSalesContext,
} from '@telegram-system/shared';

export type CopilotPreset = {
  preset?: 'WORKSPACE_NEXT_MESSAGE';
  feedbackBefore?: string;
};
export type WorkspaceCopilotCatalog = {
  products: CrmPackageSalesContext['products'];
  networks: Array<{
    id: string;
    name: string;
    channelCount: number;
    updatedAt: string;
  }>;
  truncated: boolean;
};

function compactText(value: string, bytes: number) {
  let result = '';
  for (const character of value) {
    if (Buffer.byteLength(result + character, 'utf8') > bytes) break;
    result += character;
  }
  return result;
}

export function workspaceContextProducts(
  products: CrmPackageSalesContext['products'],
) {
  return products.map((product) => ({
    ...product,
    name: compactText(product.name, 80),
    channel: {
      ...product.channel,
      title: compactText(product.channel.title, 80),
    },
  }));
}

/** Columnar data keeps all 100 channels compact without repeating field names. */
export function workspaceCatalogFacts(
  catalog: WorkspaceCopilotCatalog,
): CrmCopilotFact[] {
  return [
    {
      id: 'catalog:workspace',
      kind: 'PRODUCT',
      text: JSON.stringify({
        scope: 'ALL_ACTIVE_VERIFIED_WORKSPACE_OFFERS',
        packageQuoteRequired: true,
        columns: [
          'channel',
          'offer',
          'fixedPrice',
          'currency',
          'quoteRequired',
        ],
        rows: catalog.products.map((product) => [
          compactText(product.channel.title, 64),
          compactText(product.name, 48),
          product.fixedPrice,
          product.currency,
          product.quoteRequired,
        ]),
        networks: catalog.networks.map((network) => ({
          name: compactText(network.name, 80),
          channels: network.channelCount,
        })),
        truncated: catalog.truncated,
      }),
    },
  ];
}
