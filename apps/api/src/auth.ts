import { createHash, createHmac, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { AuthSessionEntity, WorkspaceMemberEntity, type M2MDataSource } from '@m2m/database';
import { M2MError } from '@m2m/shared';

interface AccessClaims {
  sub: string;
  workspaceId: string;
  type: 'access';
  iat: number;
  exp: number;
}

function authSecret():string{
  const secret=process.env.AUTH_SECRET??process.env.MASTER_ENCRYPTION_KEY;
  if(!secret||secret.length<32){if(process.env.NODE_ENV==='production'||process.env.AUTH_MODE==='production')throw new M2MError('CONFIG_ERROR','AUTH_SECRET must contain at least 32 characters');return'm2m-local-auth-secret-change-me-32-characters';}
  return secret;
}

const encode=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');
function signClaims(claims:AccessClaims):string{
  const header=encode({alg:'HS256',typ:'JWT'});const payload=encode(claims);const signature=createHmac('sha256',authSecret()).update(`${header}.${payload}`).digest('base64url');return`${header}.${payload}.${signature}`;
}

export function verifyAccessToken(token:string):AccessClaims{
  const[header,payload,signature]=token.split('.');if(!header||!payload||!signature)throw new M2MError('UNAUTHORIZED','Access token is malformed');
  const expected=createHmac('sha256',authSecret()).update(`${header}.${payload}`).digest();const actual=Buffer.from(signature,'base64url');
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw new M2MError('UNAUTHORIZED','Access token signature is invalid');
  let claims:AccessClaims;try{claims=JSON.parse(Buffer.from(payload,'base64url').toString('utf8')) as AccessClaims;}catch{throw new M2MError('UNAUTHORIZED','Access token payload is invalid');}
  if(claims.type!=='access'||!claims.sub||!claims.workspaceId||claims.exp<=Math.floor(Date.now()/1000))throw new M2MError('UNAUTHORIZED','Access token has expired');return claims;
}

function derivePassword(password:string,salt:Buffer):Promise<Buffer>{return new Promise((resolve,reject)=>scrypt(password,salt,64,(error,key)=>error?reject(error):resolve(key as Buffer)));}
export async function hashPassword(password:string):Promise<string>{const salt=randomBytes(16);const derived=await derivePassword(password,salt);return`scrypt$${salt.toString('base64url')}$${derived.toString('base64url')}`;}
export async function verifyPassword(password:string,stored:string|null):Promise<boolean>{if(!stored)return false;const[algorithm,saltRaw,hashRaw]=stored.split('$');if(algorithm!=='scrypt'||!saltRaw||!hashRaw)return false;const expected=Buffer.from(hashRaw,'base64url');const actual=await derivePassword(password,Buffer.from(saltRaw,'base64url'));return actual.length===expected.length&&timingSafeEqual(actual,expected);}

const refreshHash=(token:string)=>createHash('sha256').update(token).digest('hex');
export async function issueTokens(db:M2MDataSource,userId:string,workspaceId:string){
  const now=Math.floor(Date.now()/1000);const accessToken=signClaims({sub:userId,workspaceId,type:'access',iat:now,exp:now+15*60});const refreshToken=randomBytes(48).toString('base64url');
  const refreshDays=Math.max(1,Math.min(365,Number(process.env.REFRESH_TOKEN_DAYS??30)));
  await db.getRepository(AuthSessionEntity).save({id:randomUUID(),userId,refreshTokenHash:refreshHash(refreshToken),expiresAt:new Date(Date.now()+refreshDays*86_400_000),revokedAt:null});
  return{accessToken,refreshToken,expiresIn:900,workspaceId};
}

export async function rotateRefreshToken(db:M2MDataSource,token:string,workspaceId:string){
  const repository=db.getRepository(AuthSessionEntity);const session=await repository.findOneBy({refreshTokenHash:refreshHash(token)});
  if(!session||session.revokedAt||session.expiresAt<=new Date())throw new M2MError('UNAUTHORIZED','Refresh token is invalid or expired');
  const membership=await db.getRepository(WorkspaceMemberEntity).findOneBy({userId:session.userId,workspaceId});if(!membership)throw new M2MError('FORBIDDEN','User is not a member of this workspace');
  session.revokedAt=new Date();await repository.save(session);return issueTokens(db,session.userId,workspaceId);
}

export async function revokeRefreshToken(db:M2MDataSource,token:string):Promise<void>{const repository=db.getRepository(AuthSessionEntity);const session=await repository.findOneBy({refreshTokenHash:refreshHash(token)});if(session&&!session.revokedAt){session.revokedAt=new Date();await repository.save(session);}}
