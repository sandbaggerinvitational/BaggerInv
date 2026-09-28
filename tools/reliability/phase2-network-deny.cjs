// Non-Production test guard. No remote sockets; tests may replace fetch with local fakes.
const net=require('node:net');
const tls=require('node:tls');
const {syncBuiltinESMExports}=require('node:module');
function assertLocal(args) {
 if(Array.isArray(args[0]))args=args[0];
 const value=args[0];
 if(typeof value==='string' && /^(\/|\\\\)/.test(value))return;
 const host=typeof value==='object'?value.host||value.hostname:(typeof args[1]==='string'?args[1]:'localhost');
 if(typeof value==='object'&&value.path&&!value.port)return;
 if(!['localhost','127.0.0.1','::1',undefined].includes(host))throw new Error('PHASE2_REMOTE_NETWORK_DENIED');
}
for(const module of [net,tls])for(const key of ['connect','createConnection'])if(typeof module[key]==='function'){
 const original=module[key];module[key]=function(...args){assertLocal(args);return Reflect.apply(original,this,args);};
}
const originalConnect=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args){assertLocal(args);return Reflect.apply(originalConnect,this,args);};
syncBuiltinESMExports();
