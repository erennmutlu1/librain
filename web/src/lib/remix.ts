/**
 * The Discover form prefilled with a run's inputs: /discover?a=…&b=…&k=…
 * (DiscoverPage reads these). Pass the topics as recorded, in English: the
 * corpus and the recorded-run matching are English.
 */
export function discoverPath(input: { topicA: string; topicB?: string | null; topK?: number | null }): string {
  const params: string[] = [];
  const a = input.topicA.trim();
  const b = input.topicB?.trim();
  if (a) params.push(`a=${encodeURIComponent(a)}`);
  if (b) params.push(`b=${encodeURIComponent(b)}`);
  if (typeof input.topK === 'number' && Number.isInteger(input.topK) && input.topK > 0) params.push(`k=${input.topK}`);
  return params.length > 0 ? `/discover?${params.join('&')}` : '/discover';
}
