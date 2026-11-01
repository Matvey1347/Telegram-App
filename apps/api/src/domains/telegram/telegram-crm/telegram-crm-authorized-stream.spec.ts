import { Subject } from 'rxjs';
import { authorizedCrmStream } from './telegram-crm-authorized-stream';
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
describe('bounded authorized CRM stream', () => {
  it('does no work while idle and checks a coalesced event burst before delivery', async () => {
    const source = new Subject<number>();
    const authorize = jest.fn((events: number[]) => Promise.resolve(events));
    const seen: number[] = [];
    const sub = authorizedCrmStream(source, authorize).subscribe((value) =>
      seen.push(value),
    );
    await tick();
    expect(authorize).not.toHaveBeenCalled();
    source.next(1);
    source.next(2);
    await tick();
    expect(authorize).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([1, 2]);
    sub.unsubscribe();
  });
  it('membership revocation closes before pending private content is emitted', async () => {
    const source = new Subject<string>();
    const seen: string[] = [];
    const complete = jest.fn();
    const authorize = jest.fn(() => Promise.reject(new Error('revoked')));
    authorizedCrmStream(source, authorize).subscribe({
      next: (value) => seen.push(value),
      complete,
    });
    source.next('private');
    await tick();
    expect(seen).toEqual([]);
    expect(complete).toHaveBeenCalledTimes(1);
  });
  it('overflow closes for reconnect reconciliation rather than creating an unbounded queue', async () => {
    const source = new Subject<number>();
    const error = jest.fn();
    let resolve: (values: number[]) => void = () => undefined;
    const authorize = jest.fn(
      () =>
        new Promise<number[]>((done) => {
          resolve = done;
        }),
    );
    authorizedCrmStream(source, authorize, 2).subscribe({ error });
    source.next(1);
    await Promise.resolve();
    source.next(2);
    source.next(3);
    source.next(4);
    expect(error).toHaveBeenCalledTimes(1);
    resolve([1]);
    await tick();
    expect(authorize).toHaveBeenCalledTimes(1);
  });
  it('unsubscribe prevents a late successful authorization response from leaking an event', async () => {
    const source = new Subject<number>();
    const seen: number[] = [];
    let resolve: (values: number[]) => void = () => undefined;
    const sub = authorizedCrmStream(
      source,
      () =>
        new Promise<number[]>((done) => {
          resolve = done;
        }),
    ).subscribe((value) => seen.push(value));
    source.next(1);
    await Promise.resolve();
    sub.unsubscribe();
    resolve([1]);
    await tick();
    expect(seen).toEqual([]);
  });
  it('accepts the normal 100-message batch fanout without overflow and bounds each authorization read batch', async () => {
    const source = new Subject<number>();
    const seen: number[] = [];
    const error = jest.fn();
    const authorize = jest.fn((events: number[]) => Promise.resolve(events));
    const sub = authorizedCrmStream(source, authorize).subscribe({
      next: (value) => seen.push(value),
      error,
    });
    for (let n = 0; n < 300; n++) source.next(n);
    await tick();
    expect(error).not.toHaveBeenCalled();
    expect(seen).toHaveLength(300);
    expect(authorize.mock.calls.map(([batch]) => batch.length)).toEqual([
      100, 100, 100,
    ]);
    sub.unsubscribe();
  });
});
