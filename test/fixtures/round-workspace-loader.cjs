// Local browser certification only; bundle the real client and its real CSS.
module.exports=function(source){
  if(this.resourcePath.endsWith('.css')) {
    const names=Object.fromEntries([...source.matchAll(/\.([A-Za-z_][\w-]*)/g)].map(m=>[m[1],m[1]]));
    return `const css=${JSON.stringify(source)};const s=document.createElement('style');s.textContent=css;document.head.append(s);export default ${JSON.stringify(names)};`;
  }
  const done=this.async();
  require('next/dist/build/swc').transform(source,{filename:this.resourcePath,jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'automatic'}}},module:{type:'es6'}}).then(r=>done(null,r.code),done);
};
