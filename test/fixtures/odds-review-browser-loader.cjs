module.exports=function(source){
  if(this.resourcePath.endsWith('/app/live/LeaderboardsDashboard.js')) {
    // Test-only access to the actual private presentation component. No
    // production export or API is added for previewing unpublished results.
    if(this.resourceQuery==='?archive') source=require('node:child_process').execFileSync('git',['show','8e46ecaf:app/live/LeaderboardsDashboard.js'],{encoding:'utf8'});
    source+='\nexport { Insights as OddsPreviewInsights };';
  }
  return require('./website-polish-loader.cjs').call(this,source);
};
