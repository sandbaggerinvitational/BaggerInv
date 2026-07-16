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

export function BogShieldIcon({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 64 72" aria-hidden="true">
      <path d="M32 3 58 12v20c0 18-10.5 30.2-26 37C16.5 62.2 6 50 6 32V12L32 3Z" fill="currentColor" />
      <path d="M32 8 53 15v17c0 14.3-7.8 24.8-21 31.2C18.8 56.8 11 46.3 11 32V15L32 8Z" fill="none" stroke="currentColor" strokeWidth="2" opacity=".45" />
      <text x="32" y="40" textAnchor="middle" fontFamily="Georgia, serif" fontSize="17" fontWeight="800" fill="#0b3529">BOG</text>
    </svg>
  );
}

export function CompactHonors({ championships = [], soyYears = [], isGovernor = false, styles }) {
  if (!championships.length && !soyYears.length && !isGovernor) return null;

  return (
    <div className={styles.compactHonors} aria-label="Career honors">
      {championships.length ? (
        <span className={styles.compactHonorBadge} title="Bagger Champion">
          <TrophyIcon className={styles.compactHonorIcon} />
          <b>{championships.length}×</b> Champion
        </span>
      ) : null}

      {soyYears.length ? (
        <span className={styles.compactHonorBadge} title="Sandbagger of the Year">
          <StarIcon className={styles.compactHonorIcon} />
          <b>{soyYears.length}×</b> SOY
        </span>
      ) : null}

      {isGovernor ? (
        <span className={`${styles.compactHonorBadge} ${styles.bogCompactBadge}`} title="Board of Governors">
          <BogShieldIcon className={styles.bogCompactIcon} />
          <b>BOG</b>
        </span>
      ) : null}
    </div>
  );
}

export function CareerHonors({ championships = [], soyYears = [], isGovernor = false, styles }) {
  if (!championships.length && !soyYears.length && !isGovernor) return null;

  return (
    <section className={styles.honorsSection}>
      <span className={styles.sectionLabel}>Career Distinctions</span>
      <h2>Career Honors</h2>

      <div className={styles.honorsGrid}>
        {championships.length ? (
          <div className={styles.honorCard}>
            <div className={styles.honorMedallion}><TrophyIcon className={styles.honorIcon} /></div>
            <div>
              <span>{championships.length}× Bagger Champion</span>
              <strong>{[...championships].sort((a, b) => a - b).join(" • ")}</strong>
            </div>
          </div>
        ) : null}

        {soyYears.length ? (
          <div className={styles.honorCard}>
            <div className={styles.honorMedallion}><StarIcon className={styles.honorIcon} /></div>
            <div>
              <span>{soyYears.length}× Sandbagger of the Year</span>
              <strong>{[...soyYears].sort((a, b) => a - b).join(" • ")}</strong>
            </div>
          </div>
        ) : null}

        {isGovernor ? (
          <div className={`${styles.honorCard} ${styles.bogHonorCard}`}>
            <div className={styles.bogMedallion}><BogShieldIcon className={styles.bogHonorIcon} /></div>
            <div>
              <span>Board of Governors</span>
              <strong>Lifetime Designation</strong>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
