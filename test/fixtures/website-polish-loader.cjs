// Isolate CSS-module names just as Next does: unrelated imported components
// also define .content and must not collapse the History layout in this fixture.
module.exports=function(source){
  if(!this.resourcePath.endsWith('.module.css'))return require('./round-workspace-loader.cjs').call(this,source);
  const prefix='p'+require('node:crypto').createHash('sha1').update(this.resourcePath).digest('hex').slice(0,8)+'_';
  const tree=require('postcss').parse(source),names={};
  tree.walkRules(rule=>{rule.selector=rule.selector.replace(/\.([A-Za-z_][\w-]*)/g,(_,name)=>'.'+(names[name]=prefix+name));});
  return `const s=document.createElement('style');s.textContent=${JSON.stringify(tree.toString())};document.head.append(s);export default ${JSON.stringify(names)};`;
};
