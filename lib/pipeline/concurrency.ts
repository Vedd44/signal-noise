export async function mapConcurrent<T, U>(values: T[], concurrency: number, operation: (value: T) => Promise<U>): Promise<U[]> {
  const results: U[] = new Array(values.length);
  let next = 0;
  await Promise.all(Array.from({length:Math.min(concurrency,values.length)}, async () => {
    while (next < values.length) {
      const index = next++;
      results[index] = await operation(values[index]);
    }
  }));
  return results;
}
