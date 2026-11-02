import { leadSource } from './lead.spec-fixtures';
import {
  leadTransportMatches,
  leadTransportSnapshot,
} from './lead-transport-snapshot';

describe('lead source binding snapshot', () => {
  it('rejects an A to B to A binding even when the visible fields match', () => {
    const original = leadSource({ bindingRevision: 4 });
    const snapshot = leadTransportSnapshot(original);
    expect(leadTransportMatches(original, snapshot)).toBe(true);
    expect(
      leadTransportMatches({ ...original, bindingRevision: 6 }, snapshot),
    ).toBe(false);
  });
  it('fails closed for a snapshot without a revision', () => {
    const source = leadSource();
    const snapshot = leadTransportSnapshot(source);
    Object.assign(snapshot, { bindingRevision: undefined });
    expect(leadTransportMatches(source, snapshot)).toBe(false);
  });
});
