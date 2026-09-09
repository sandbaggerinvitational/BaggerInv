// Synthetic local-only financial inputs, never a runtime tournament source.
export function tieFixture(format='BB',ties=2) {
  const round={BB:1,SC:2,SI:3}[format],year=2026,team=format==='SC';
  const units=ties+1, ids=Array.from({length:units*(team?2:1)},(_,i)=>`P${i+1}`);
  return {year,updatedAt:'2026-01-01T00:00:00.000Z',
    players:Object.fromEntries(ids.map(id=>[id,{id,name:id}])),
    purchases:ids.map(id=>({Year:year,'Golfer Player ID':id,'Purchase Price':100})),
    ownership:ids.flatMap(id=>[.25,.75].map((share,i)=>({Year:year,'Golfer Player ID':id,'Owner Player ID':`P${i+1}`,'Ownership %':share}))),
    pointStructure:Array.from({length:units},(_,i)=>({Year:year,Place:i+1,[`Round ${round} Award`]:100-i*10})),
    payoutStructure:Array.from({length:units},(_,i)=>({Year:year,Place:i+1,[`Round ${round} Award %`]:10-i,'Overall Award %':20-i})),
    roundResults:Array.from({length:units},(_,i)=>({Year:year,Round:round,Format:format,
      'Player IDs':ids.slice(i*(team?2:1),(i+1)*(team?2:1)).join(','),
      'Gross Score':72,'Net Score':i<ties?70:75,'Full Course Handicap':i<ties?2:-3}))};
}
