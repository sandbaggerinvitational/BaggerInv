import ExternalLinkConfirm from "../ExternalLinkConfirm";
import { localGuideDirections, localGuideGroupDefaultOpen, localGuideGroups, localGuidePhone, localGuideRecordIcon, localGuideSectionIcon, localGuideViewModel, localGuideWebsite } from "../../lib/tournament-guide-local";
import styles from "./tournament-guide.module.css";

function LocalGuideCard({ record }) {
  const recordIcon = localGuideRecordIcon(record.title);
  return <article className={styles.localGuideCard}>
    <div><h3>{recordIcon ? <span className={styles.localGuideRecordIcon} aria-hidden="true">{recordIcon}</span> : null}{record.title}</h3>{record.description ? <p>{record.description}</p> : null}</div>
    {record.address || record.phone || record.website ? <div className={styles.localGuideActions}>
      {record.address ? <a href={localGuideDirections(record.address)}><span aria-hidden="true">📍</span> Directions<span className={styles.visuallyHidden}> to {record.title}</span></a> : null}
      {record.phone ? <a href={localGuidePhone(record.phone)}><span aria-hidden="true">📞</span> Call<span className={styles.visuallyHidden}> {record.title}</span></a> : null}
      {record.website ? <ExternalLinkConfirm href={localGuideWebsite(record.website)}><span aria-hidden="true">🌐</span> Website<span className={styles.visuallyHidden}> for {record.title}</span></ExternalLinkConfirm> : null}
    </div> : null}
  </article>;
}

export default function LocalGuide({ records = [] }) {
  const groups = localGuideGroups(localGuideViewModel(records));
  return <section className={`${styles.focusedContent} ${styles.localGuideExperience}`}>
    <header><p className={styles.eyebrow}>Local Concierge</p><h1>Local Guide</h1><p>Everything you may need beyond the golf course during tournament weekend.</p></header>
    {groups.size ? <div className={styles.localGuideSections}>
      {[...groups.entries()].map(([section, sectionRecords]) => <details className={styles.localGuideGroup} open={localGuideGroupDefaultOpen(section)} key={section}>
        <summary><h2><span aria-hidden="true">{localGuideSectionIcon(section)}</span>{section}</h2><b aria-hidden="true">⌄</b></summary>
        <div>{sectionRecords.map((record) => <LocalGuideCard record={record} key={record.id} />)}</div>
      </details>)}
    </div> : <div className={styles.empty}><span>Local Guide</span><h2>Local information is being prepared.</h2><p>Curated tournament-weekend recommendations will appear here when published.</p></div>}
  </section>;
}
