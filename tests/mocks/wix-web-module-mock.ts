// tests/mocks/wix-web-module-mock.ts
// Mock de wix-web-module para tests.
// Contrato: webMethod(permission, handler) -> handler (retorna el handler tal cual)
//           Permissions.Anyone | SiteMember | Admin | SiteOwner (...)

export const Permissions = {
  Anyone: 'ANYONE',
  SiteMember: 'SITE_MEMBER',
  Admin: 'ADMIN',
  SiteOwner: 'SITE_OWNER',
  Owner: 'OWNER',
};

export const webMethod = (_permission, handler) => handler;

export default { webMethod, Permissions };