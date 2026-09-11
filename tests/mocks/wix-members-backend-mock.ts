// tests/mocks/wix-members-backend-mock.ts
// Mock de wix-members-backend para tests.
// Contrato: currentMember.getMember({ fieldsets }) -> member | null
// Respuesta fiel a la API de Wix Members backend.

const DEFAULT_MEMBER = {
  _id: 'member-1',
  contactId: 'contact-1',
  loginEmail: 'staff@example.com',
  profile: { nickname: 'Staff Test', slug: 'staff-test' },
  contactDetails: { firstName: 'Staff', lastName: 'Test', email: 'staff@example.com' },
  roles: [],
  status: 'ACTIVE',
};

export const currentMember = {
  getMember: async (_options) => DEFAULT_MEMBER,
  getCurrentMember: async (_options) => DEFAULT_MEMBER,
};

export const members = {
  getMember: async (memberId) => (memberId ? { ...DEFAULT_MEMBER, _id: memberId } : null),
  queryMembers: async () => ({ items: [DEFAULT_MEMBER] }),
};

export default { currentMember, members };