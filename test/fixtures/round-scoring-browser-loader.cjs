// Isolated browser bundle: preserve CSS-module scoping so sibling module names
// cannot collide. Descendant styles from the real parent remain effective.
module.exports=function(source){
 if(this.resourcePath.endsWith('.css')){
  const prefix=require('node:crypto').createHash('sha256').update(this.resourcePath).digest('hex').slice(0,8);
  const names=Object.fromEntries([...source.matchAll(/\.([A-Za-z_][\w-]*)/g)].map(m=>[m[1],`css${prefix}_${m[1]}`]));
  const css=source.replace(/\.([A-Za-z_][\w-]*)/g,(_,name)=>'.'+names[name]);
  return `const s=document.createElement('style');s.textContent=${JSON.stringify(css)};document.head.append(s);export default ${JSON.stringify(names)};`;
 }
 const done=this.async();require('next/dist/build/swc').transform(source,{filename:this.resourcePath,jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'automatic'}},target:'es2022'},module:{type:'es6'}}).then(r=>done(null,r.code),done);
};
