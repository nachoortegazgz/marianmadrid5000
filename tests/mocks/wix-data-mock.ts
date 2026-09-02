// tests/mocks/wix-data-mock.ts
// Mock de wix-data para tests

const mockDb = new Map<string, any[]>();

export const insert = async (collection: string, item: any) => {
  console.log(`[MOCK Wix Data] insert en ${collection}`, item);
  if (!mockDb.has(collection)) {
    mockDb.set(collection, []);
  }
  mockDb.get(collection)!.push(item);
  return { _id: item._id || `mock-${Date.now()}` };
};

export const update = async (collection: string, item: any) => {
  console.log(`[MOCK Wix Data] update en ${collection}`, item);
  return { _id: item._id };
};

export const get = async (collection: string, id: string) => {
  console.log(`[MOCK Wix Data] get de ${collection}:${id}`);
  const items = mockDb.get(collection) || [];
  return items.find(i => i._id === id) || null;
};

export const query = async (collection: string, filter: any = {}) => {
  console.log(`[MOCK Wix Data] query en ${collection}`, filter);
  const items = mockDb.get(collection) || [];
  // Filtro simple
  let result = items;
  for (const [key, value] of Object.entries(filter)) {
    result = result.filter(item => item[key] === value);
  }
  return { items: result, totalCount: result.length };
};

export const remove = async (collection: string, id: string) => {
  console.log(`[MOCK Wix Data] remove de ${collection}:${id}`);
  const items = mockDb.get(collection) || [];
  const index = items.findIndex(i => i._id === id);
  if (index >= 0) {
    items.splice(index, 1);
  }
  return { _id: id };
};

export default { insert, update, get, query, remove };
