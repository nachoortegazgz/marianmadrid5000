// Mock de wix-data para testing
export const query = (collection) => ({
  eq: (field, value) => ({
    find: async () => ({ items: [] })
  }),
  find: async () => ({ items: [] })
});

export const insert = async (collection, data) => ({
  insertedId: 'mock-id-' + Date.now()
});

export default { query, insert };
