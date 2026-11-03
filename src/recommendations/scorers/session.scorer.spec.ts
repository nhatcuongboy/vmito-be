import { interleaveCrawledSessions } from './session.scorer';

const joinable = (id: string) => ({ id, isCrawled: false });
const crawled = (id: string) => ({ id, isCrawled: true });
const ids = (items: { id: string }[]) => items.map((item) => item.id);

describe('interleaveCrawledSessions', () => {
  it('puts one crawled session after every three joinable ones', () => {
    const result = interleaveCrawledSessions([
      crawled('f1'),
      joinable('a'),
      crawled('f2'),
      joinable('b'),
      joinable('c'),
      joinable('d'),
      crawled('f3'),
      joinable('e'),
      joinable('f'),
    ]);

    expect(ids(result)).toEqual([
      'a',
      'b',
      'c',
      'f1',
      'd',
      'e',
      'f',
      'f2',
      'f3',
    ]);
  });

  it('keeps crawled sessions when nothing is joinable', () => {
    expect(
      ids(interleaveCrawledSessions([crawled('f1'), crawled('f2')]))
    ).toEqual(['f1', 'f2']);
  });
});
