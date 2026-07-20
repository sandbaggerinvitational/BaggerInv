export function TrophyIcon({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M20 8h24v8c0 10-4.8 18.2-12 21.2C24.8 34.2 20 26 20 16V8Z" fill="currentColor" />
      <path d="M20 14H10v5c0 9 5.2 15 14 16M44 14h10v5c0 9-5.2 15-14 16" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <path d="M32 37v10M22 55h20M26 47h12v8H26z" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function StarIcon({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="29" fill="none" stroke="currentColor" strokeWidth="4" />
      <path d="m32 12 5.9 12 13.2 1.9-9.6 9.3 2.3 13.2L32 42.2l-11.8 6.2 2.3-13.2-9.6-9.3L26.1 24 32 12Z" fill="currentColor" />
    </svg>
  );
}

export function PointsLeaderIcon({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="27" fill="none" stroke="currentColor" strokeWidth="4" />
      <path d="M18 43h28M22 36h7V23h-7v13Zm13 0h7V14h-7v22Z" fill="currentColor" />
      <path d="m48 13 1.8 3.7 4.1.6-3 2.9.7 4.1-3.6-1.9-3.6 1.9.7-4.1-3-2.9 4.1-.6L48 13Z" fill="currentColor" />
    </svg>
  );
}

export function BogShieldIcon({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 64 72" aria-hidden="true">
      <defs>
        <linearGradient id="bogGold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f5d77d" />
          <stop offset="52%" stopColor="#d7a83f" />
          <stop offset="100%" stopColor="#f0ca67" />
        </linearGradient>
      </defs>
      <path d="M32 3 58 12v20c0 18-10.5 30.2-26 37C16.5 62.2 6 50 6 32V12L32 3Z" fill="url(#bogGold)" stroke="#9f7422" strokeWidth="2" />
      <path d="M32 8 53 15v17c0 14.3-7.8 24.8-21 31.2C18.8 56.8 11 46.3 11 32V15L32 8Z" fill="none" stroke="rgba(255,255,255,.48)" strokeWidth="2" />
      <text x="32" y="40" textAnchor="middle" fontFamily="Georgia, serif" fontSize="17" fontWeight="800" fill="#0b3529">BOG</text>
    </svg>
  );
}

export function RookieBadgeIcon({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="28" fill="currentColor" opacity=".18" />
      <path d="M20 14h7v8h4v-8h7v8h4v-8h6v15l-6 7 4 13H18l4-13-6-7V14h4Zm3 35h18v5H23v-5Z" fill="currentColor" />
    </svg>
  );
}

function sortedYears(years) {
  return [...years].sort((a, b) => Number(a) - Number(b));
}

function HonorYears({ years, styles }) {
  const orderedYears = sortedYears(years);
  const rows = [];

  for (let index = 0; index < orderedYears.length; index += 5) {
    rows.push(orderedYears.slice(index, index + 5));
  }

  return (
    <div className={styles.honorYears}>
      {rows.map((row, rowIndex) => (
        <div className={styles.honorYearRow} key={rowIndex}>
          {row.map((year, index) => (
            <span className={styles.honorYearItem} key={year}>
              <b>{year}</b>
              {index < row.length - 1 ? (
                <i className={styles.honorYearDot} aria-hidden="true">
                  •
                </i>
              ) : null}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function soyProfileLabel(count) {
  return count === 1 ? "Sandbagger of the Year" : `${count}× Sandbagger of the Year`;
}

export function CompactHonors({
  championships = [],
  soyYears = [],
  pointsLeaderYears = [],
  isGovernor = false,
  isRookie = false,
  styles,
}) {
  if (!championships.length && !soyYears.length && !pointsLeaderYears.length && !isGovernor && !isRookie) return null;

  return (
    <div className={styles.playerCardHonorIcons} aria-label="Career honors">
      {championships.length ? (
        <div className={styles.playerCardHonorIconItem} title={`${championships.length}× Champion`}>
          <TrophyIcon className={styles.playerCardMiniIcon} />
          <span>{championships.length}×</span>
        </div>
      ) : null}

      {soyYears.length ? (
        <div className={styles.playerCardHonorIconItem} title="Sandbagger of the Year">
          <StarIcon className={styles.playerCardMiniIcon} />
          {soyYears.length > 1 ? <span>{soyYears.length}×</span> : null}
        </div>
      ) : null}

      {pointsLeaderYears.length ? (
        <div className={`${styles.playerCardHonorIconItem} ${styles.pointsLeaderHonorIconItem || ""}`} title={`${pointsLeaderYears.join(", ")} Individual Points Leader`}>
          <PointsLeaderIcon className={styles.playerCardMiniIcon} />
          <span className={styles.pointsLeaderLabel}>
            {pointsLeaderYears.length === 1 ? `${pointsLeaderYears[0]} Individual Points Leader` : `${pointsLeaderYears.length}× Individual Points Leader`}
          </span>
        </div>
      ) : null}

      {isGovernor ? (
        <div className={styles.playerCardHonorIconItem} title="Board of Governors">
          <BogShieldIcon className={styles.playerCardMiniShield} />
        </div>
      ) : null}

      {isRookie ? (
        <div className={`${styles.playerCardHonorIconItem} ${styles.rookieHonorIconItem || ""}`} title="Rookie">
          <span className={styles.rookieLabel}>
            <i aria-hidden="true">♜</i>
            Rookie
          </span>
        </div>
      ) : null}
    </div>
  );
}

export function CareerHonors({
  championships = [],
  soyYears = [],
  pointsLeaderYears = [],
  isGovernor = false,
  styles,
}) {
  if (!championships.length && !soyYears.length && !pointsLeaderYears.length && !isGovernor) return null;

  return (
    <section className={styles.honorsSection}>
      <span className={styles.sectionLabel}>Career Distinctions</span>
      <h2>Career Honors</h2>

      <div className={styles.honorsGrid}>
        {championships.length ? (
          <div className={styles.honorCard}>
            <div className={styles.honorMedallion}>
              <TrophyIcon className={styles.honorIcon} />
            </div>
            <div>
              <span>{championships.length}× Bagger Champion</span>
              <HonorYears years={championships} styles={styles} />
            </div>
          </div>
        ) : null}

        {soyYears.length ? (
          <div className={styles.honorCard}>
            <div className={styles.honorMedallion}>
              <StarIcon className={styles.honorIcon} />
            </div>
            <div>
              <span>{soyProfileLabel(soyYears.length)}</span>
              <HonorYears years={soyYears} styles={styles} />
            </div>
          </div>
        ) : null}

        {pointsLeaderYears.length ? (
          <div className={styles.honorCard}>
            <div className={styles.honorMedallion}>
              <PointsLeaderIcon className={styles.honorIcon} />
            </div>
            <div>
              <span>{pointsLeaderYears.length === 1 ? "Individual Points Leader" : `${pointsLeaderYears.length}× Individual Points Leader`}</span>
              <HonorYears years={pointsLeaderYears} styles={styles} />
            </div>
          </div>
        ) : null}

        {isGovernor ? (
          <div className={`${styles.honorCard} ${styles.bogHonorCard}`}>
            <div className={styles.bogMedallion}>
              <BogShieldIcon className={styles.bogHonorIcon} />
            </div>
            <div><span>Board of Governors</span></div>
          </div>
        ) : null}

      </div>
    </section>
  );
}
