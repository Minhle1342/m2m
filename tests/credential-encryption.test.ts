import { afterEach,describe,expect,it } from 'vitest';
import { decryptCredential,decryptCredentialWithMetadata,encryptCredential } from '../packages/database/src/crypto.js';

describe('credential encryption',()=>{
  const original=process.env.MASTER_ENCRYPTION_KEY;
  afterEach(()=>{if(original===undefined)delete process.env.MASTER_ENCRYPTION_KEY;else process.env.MASTER_ENCRYPTION_KEY=original});
  it('round-trips secrets without storing plaintext',()=>{
    process.env.MASTER_ENCRYPTION_KEY='test-master-encryption-key-with-32-characters';
    const encrypted=encryptCredential({apiKey:'super-secret-key',baseUrl:'https://example.test/v1'});
    expect(encrypted).not.toContain('super-secret-key');
    expect(decryptCredential(encrypted)).toEqual({apiKey:'super-secret-key',baseUrl:'https://example.test/v1'});
  });
  it('fails closed with a different key',()=>{
    process.env.MASTER_ENCRYPTION_KEY='first-test-master-key-with-32-characters';const encrypted=encryptCredential({token:'secret'});
    process.env.MASTER_ENCRYPTION_KEY='second-test-master-key-with-32-characters';expect(()=>decryptCredential(encrypted)).toThrow();
  });
  it('identifies legacy development encryption for one-time migration',()=>{
    delete process.env.MASTER_ENCRYPTION_KEY;
    const encrypted=encryptCredential({token:'legacy-secret'});
    process.env.MASTER_ENCRYPTION_KEY='current-test-master-key-with-32-characters';
    expect(decryptCredentialWithMetadata(encrypted)).toEqual({
      data:{token:'legacy-secret'},
      usedLegacyDevelopmentKey:true
    });
  });
});
