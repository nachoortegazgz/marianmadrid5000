// tests/mocks/wix-data-mock.ts
// Mock de wix-data para tests

const createQuery = () => {
  const mockQuery: Record<string, (...args: any[]) => any> = {};
  const chain = () => mockQuery;
  mockQuery.eq = chain;
  mockQuery.ne = chain;
  mockQuery.in = chain;
  mockQuery.lt = chain;
  mockQuery.limit = chain;
  mockQuery.skip = chain;
  mockQuery.ascending = chain;
  mockQuery.descending = chain;
  mockQuery.find = async () => ({ items: [], hasNext: () => false, next: async () => ({ items: [] }) });
  mockQuery.count = async () => 0;
  return mockQuery;
};

export const wixData = {
  query: (_collectionName: string) => createQuery(),
  get: async (_collection: string, _id: string) => null,
  insert: async (_collection: string, item: any) => ({ ...item, _id: item._id || 'mock-id' }),
  update: async (_collection: string, item: any) => item,
  remove: async (_collection: string, _id: string) => undefined,
  save: async (_collection: string, item: any) => item,
};

export const { query, get, insert, update, remove, save } = wixData;

export default wixData;
