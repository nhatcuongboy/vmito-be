import { estimateReadingTimeMinutes } from './reading-time.util';

describe('estimateReadingTimeMinutes', () => {
  it('never returns less than a minute', () => {
    expect(estimateReadingTimeMinutes('<p>Ngắn</p>')).toBe(1);
    expect(estimateReadingTimeMinutes('')).toBe(1);
  });

  it('ignores markup and script/style contents', () => {
    const words = Array(400).fill('word').join(' ');
    const html = `<style>.a{color:red}</style><p>${words}</p><script>var a=1;</script>`;
    expect(estimateReadingTimeMinutes(html)).toBe(2);
  });

  it('counts CJK by character rather than by whitespace-delimited word', () => {
    // 700 characters with no spaces would otherwise count as a single word.
    const html = `<p>${'羽'.repeat(700)}</p>`;
    expect(estimateReadingTimeMinutes(html)).toBe(2);
  });
});
