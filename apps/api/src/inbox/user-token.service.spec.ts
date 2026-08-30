import { assertEndUserTokenClaims } from './user-token.service';

describe('end-user token claims', () => {
  it('accepts a well-formed end-user token payload', () => {
    expect(() => assertEndUserTokenClaims({ sub: 'usr_1', tenant_id: 'tnt_1', external_user_id: 'ext_1', typ: 'end_user' })).not.toThrow();
  });

  it('rejects a dashboard-typed JWT payload so it can never be used as an inbox token', () => {
    expect(() => assertEndUserTokenClaims({ sub: 'du_1', tenant_id: 'tnt_1', role: 'OWNER', email: 'owner@example.com' })).toThrow();
  });

  it('rejects a payload missing required claims even when typ is correct', () => {
    expect(() => assertEndUserTokenClaims({ typ: 'end_user', sub: 'usr_1' })).toThrow();
  });

  it('rejects a non-object payload', () => {
    expect(() => assertEndUserTokenClaims('not-a-token')).toThrow();
    expect(() => assertEndUserTokenClaims(null)).toThrow();
  });
});
