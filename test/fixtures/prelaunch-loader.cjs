module.exports=function(source){
  const result=require('./website-polish-loader.cjs').call(this,source);
  // The same CSS class mapping on SSR; style insertion is browser-only.
  return this.target==='node' && this.resourcePath.endsWith('.css')
    ? result.replace(/const s=document\.createElement\('style'\);s\.textContent=[\s\S]*?document\.head\.append\(s\);/,'')
    : result;
};
