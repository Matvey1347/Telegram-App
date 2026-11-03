import { validate } from 'class-validator';
import { CrmReactionAssetsDto } from './telegram-crm-chat.dto';

describe('CrmReactionAssetsDto', () => {
  it('accepts optional numeric document IDs and rejects malformed or excessive IDs', async () => {
    const dto = Object.assign(new CrmReactionAssetsDto(), {
      messageIds: ['message'],
      documentIds: ['123', '456'],
    });
    expect(await validate(dto)).toHaveLength(0);
    dto.documentIds = ['123x'];
    expect(await validate(dto)).not.toHaveLength(0);
    dto.documentIds = Array.from({ length: 51 }, (_, i) => String(i));
    expect(await validate(dto)).not.toHaveLength(0);
  });
});
