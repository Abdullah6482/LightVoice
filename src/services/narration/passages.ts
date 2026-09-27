export const playbackRates = [0.75, 1, 1.1, 1.2, 1.3, 1.5, 1.75, 2];

export function wordStart(text: string, offset: number) {
  let index = Math.max(0, Math.min(text.length, Math.floor(Number.isFinite(offset) ? offset : 0)));
  if (index === text.length) return index;
  while (index > 0 && !/\s/.test(text[index - 1])) index--;
  return index;
}

export function nextPassage(text: string, offset: number, maxLength: number) {
  const start = Math.max(0, Math.min(text.length, offset));
  const limit = Math.max(2, Math.min(240, Math.floor(maxLength)));
  let end = Math.min(text.length, start + limit);
  if (end < text.length) {
    const slice = text.slice(start, end);
    const sentence = [...slice.matchAll(/[.!?][”"']?\s+|\n\n/g)].at(-1);
    if (sentence && sentence.index > 0) end = start + sentence.index + sentence[0].length;
    else {
      const space = slice.lastIndexOf(' ');
      if (space > 0) end = start + space + 1;
    }
    // Do not split a UTF-16 surrogate pair when a long unbroken word forces a cut.
    if (/^[\uDC00-\uDFFF]$/.test(text[end])) end--;
  }
  return { start, end, text: text.slice(start, end) };
}
