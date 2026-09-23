// Server projection only. Never serialize upstream envelopes, identities, or arbitrary fields.
import { leaderboardsCoreDataFromSupabaseView, leaderboardsCoreParityProjection, canonicalTeamPresentationFromLeaderboardsView } from './leaderboards-core-supabase.js';
import { applyGuideProjectionToHome, guideParticipantProjection } from './guide-participant-adapter.js';
import { playerPhoto, teamLogo, tournamentLogo } from './asset-paths.js';
import { validatePortraitPolicy } from './mobile-portrait-policy.js';

const text = v => typeof v === 'string' ? v.trim().slice(0,300) : '';
const num = v => v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null;
const status = v => /^(final|finalized|complete|completed)$/i.test(v) ? 'Final' : /^(live|reopened|open|in progress)$/i.test(v) ? 'Live' : 'Upcoming';
const money = /calcutta|net\s*skins|auction|holdings|payout|purchase|settlement|buy[- ]?in|\$|\bUSD\b/i;
const contact = /[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+?1[- .]?)?\(?\d{3}\)?[- .]\d{3}[- .]\d{4}/i;
function publicText(value, max = 1600) {
  const s = typeof value === 'string' ? value.trim().slice(0,max) : '';
  return money.test(s) || contact.test(s) ? '' : s;
}
function safeAsset(path, directory) {
  // Public projection permits bundled canonical assets, never arbitrary remote URLs.
  return typeof path === 'string' && new RegExp(`^/images/${directory}/[a-zA-Z0-9_-]+\\.(png|webp)$`).test(path) ? path : null;
}
function course(c = {}) { return { id:text(c.id), name:text(c.name), tee:text(c.tee) }; }
function requireCondition(v) { if (!v) throw new Error('SPECTATOR_PROJECTION_UNAVAILABLE'); }

export function spectatorTournamentProjection({ core, guide, portraits }) {
  requireCondition(core?.tournament?.tournament_id === '2026' && Array.isArray(core.players) && core.players.length <= 64 &&
    Array.isArray(core.matches) && core.matches.length <= 48);
  const policy = validatePortraitPolicy(portraits);
  const content = guideParticipantProjection(guide).content;
  requireCondition(content.tournamentIdentity?.id === '2026' && content.tournamentIdentity?.timeZone === 'America/New_York');
  const base = leaderboardsCoreDataFromSupabaseView(core);
  requireCondition(base.slotVerification?.pass === true);
  const live = applyGuideProjectionToHome({liveData:base}, {content}).liveData;
  const players = base.players.map(p => {
    const entry = policy.players.find(row => row.playerId === p.id);
    return { id:text(p.id), name:text(p.name), teamSide:num(p.teamSide),
      portrait:entry?.policy === 'ACTIVE' ? safeAsset(playerPhoto(p.photo),'players') : null };
  });
  requireCondition(new Set(players.map(p=>p.id)).size === players.length);
  const ids = new Set(players.map(p=>p.id));
  const teams = canonicalTeamPresentationFromLeaderboardsView(core).map(t => ({
    id:text(t.id), side:num(t.side), name:text(t.name), logo:safeAsset(teamLogo(t.logo),'teams/logos'),
    points:num(t.side===1?live.tournament.teamOne.score:live.tournament.teamTwo.score),
  }));
  const raw = new Map(core.matches.map(m=>[m.match.match_id,m]));
  const matches = live.rounds.flatMap(r => r.matches.map(m => {
    const source = raw.get(m.id);
    const participants = side => (m[`team${side}Players`]||[]).filter(p=>ids.has(p.id)).map(p=>text(p.id));
    const lifecycle = status(source.match.status);
    return { id:text(m.id), round:num(r.number), number:text(m.match), format:text(m.formatName), status:lifecycle,
      scoreState:source.match.scoring_locked && lifecycle==='Live' ? 'Locked' : lifecycle,
      course:course(m.course), teeTime:text(m.teeTime), team1:participants(1), team2:participants(2),
      liveResult:publicText(m.liveStatusText), finalResult:lifecycle==='Final'?publicText(m.finalResult):'',
      team1Points:lifecycle==='Final'?num(m.team1Points):null, team2Points:lifecycle==='Final'?num(m.team2Points):null,
      holes:(source.holes||[]).slice(0,18).map(h=>{
        const s=(source.scores||[]).find(s=>s.hole_number===h.hole_number);
        return { number:num(h.hole_number), par:num(h.par), strokeIndex:num(h.stroke_index),
          team1Gross:s?(s.team_1_gross_scores||[]).slice(0,2).map(num):null,
          team2Gross:s?(s.team_2_gross_scores||[]).slice(0,2).map(num):null,
          team1Net:s?num(s.team_1_net_score):null, team2Net:s?num(s.team_2_net_score):null,
          winner:s?text(s.hole_winner):'' };
      }),
    };
  }));
  // These pure server calculations are the same canonical engine used by participant Leaders.
  const standings=leaderboardsCoreParityProjection(base);
  const schedule=(live.schedule||[]).filter(e=>!money.test([e.title,e.subtitle,e.location,e.type].join(' '))).map(e=>({
    id:text(e.id), date:text(e.date), startTime:text(e.startTime), endTime:text(e.endTime), title:publicText(e.title),
    subtitle:publicText(e.subtitle), location:publicText(e.location), type:text(e.type), status:text(e.status),
    roundStatusDerived:e.roundStatusDerived===true, order:num(e.order),
  })).filter(e=>e.title);
  return { contract:'bagger-spectator-v1', tournament:{ id:'2026', name:text(live.tournament.name),
    edition:text(content.tournamentIdentity.editionTitle), dates:text(content.tournamentIdentity.dates),
    location:text(content.tournamentIdentity.location), timeZone:'America/New_York', status:status(live.tournament.status),
    logo:safeAsset(tournamentLogo(content.tournamentIdentity.logoFileName),'tournaments/logos'),
    championSide:num(live.tournament.state?.championSide),
  }, teams, players, matches,
    rounds:live.rounds.map(r=>({number:num(r.number),label:text(r.label),format:text(r.format),status:status(r.status),course:course(r.course),
      paired:matches.filter(m=>m.round===r.number).every(m=>m.team1.length&&m.team2.length)})),
    schedule,
    leaders:{ teams:standings.teams, players:standings.players.filter(p=>ids.has(p.id)),
      rounds:standings.roundPlayers.map(r=>({...r,rows:r.rows.filter(row=>(row.playerIds||[row.id]).every(id=>ids.has(id)))})) },
    guide:{ rules:(content.ruleBook||[]).filter(r=>/^(handicaps|scoring|formats|golf|general|rules)$/i.test(r.Category||'') && !money.test(JSON.stringify(r)))
        .map(r=>({title:publicText(r.Title),body:publicText(r.Body)})).filter(r=>r.title&&r.body),
      courses:(content.courses||[]).slice(0,12).map(c=>({id:text(c['Course ID']),name:text(c.Course||c['Course Name']),
        description:publicText(c['Course Overview']||c.Description),designer:publicText(c.Designer),
        location:publicText(c.Destination||c.City)})),
      formats:(content.rounds||[]).slice(0,3).map(f=>({id:text(f['Format ID']),name:text(f.Name),description:publicText(f.Rules||f.Description)})),
    },
    portraitRevision:policy.revision,
  };
}

export function spectatorHistoryProjection(index) {
  requireCondition(Array.isArray(index.views) && index.views.length<=10);
  return { contract:'bagger-spectator-history-v1', tournaments:index.views.map(v=>({
    year:num(v.year), name:publicText(v.tournament?.['Tournament Name']||v.tournament?.name)||`${num(v.year)} Sandbagger Invitational`,
    status:status(v.tournament?.lifecycle),
    finalScore:status(v.tournament?.lifecycle)==='Final'?text(v.tournament?.['Final Score']):'',
    champion:status(v.tournament?.lifecycle)==='Final'?publicText(v.tournament?.championTeam?.name):'',
    teams:(v.teams||[]).slice(0,2).map(t=>({name:publicText(t.name),points:num(t.points)})),
    players:(v.leaderboardRows||[]).slice(0,64).map(p=>({id:text(p.id||p.playerId),name:text(p.player?.['Display Name']||p.name),
      wins:num(p.wins),losses:num(p.losses),halves:num(p.halves),points:num(p.points)})),
  })) };
}
