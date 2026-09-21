import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
// Confidential transport of the existing signed pending proof, never a login/session token.
// Equal-sized decoys avoid revealing roster membership or Auth UUIDs in native responses.
const size=2048;
const key=secret=>{if(typeof secret!=='string'||secret.length<32)throw Error('PHONE_LOGIN_PROOF_REQUIRED');return createHash('sha256').update('bagger-native-phone-challenge-v1\0').update(secret).digest();};
export function sealNativePhoneChallenge(proof,secret){
 const raw=Buffer.from(JSON.stringify({proof:proof||''}));if(raw.length>size-2)throw Error('PHONE_LOGIN_PROOF_REQUIRED');
 const plain=randomBytes(size);plain.writeUInt16BE(raw.length,0);raw.copy(plain,2);
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(secret),iv);
 return Buffer.concat([iv,cipher.update(plain),cipher.final(),cipher.getAuthTag()]).toString('base64url');
}
export function openNativePhoneChallenge(value,secret){
 const packed=Buffer.from(value,'base64url');if(packed.length!==size+28)throw Error('PHONE_LOGIN_PROOF_REQUIRED');
 const decipher=createDecipheriv('aes-256-gcm',key(secret),packed.subarray(0,12));decipher.setAuthTag(packed.subarray(-16));
 const plain=Buffer.concat([decipher.update(packed.subarray(12,-16)),decipher.final()]);
 const length=plain.readUInt16BE(0);if(length>size-2)throw Error('PHONE_LOGIN_PROOF_REQUIRED');
 return JSON.parse(plain.subarray(2,2+length).toString()).proof;
}
