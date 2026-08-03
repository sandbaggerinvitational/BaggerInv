import ExternalLinkConfirm from "../ExternalLinkConfirm";
import { localGuideDirections, localGuideGroups, localGuidePhone, localGuideRecordIcon, localGuideSectionIcon, localGuideViewModel, localGuideWebsite } from "../../lib/tournament-guide-local";
import styles from "./tournament-guide.module.css";

function LocalGuideCard({ record }) {
  const recordIcon = localGuideRecordIcon(record.title);
  return <article className={styles.localGuideCard}>
    <div><h3>{recordIcon ? <span className={styles.localGuideRecordIcon} aria-hidden="true">{recordIcon}</span> : null}{record.title}</h3>{record.description ? <p>{record.description}</p> : null}</div>
    {record.address || record.phone || record.website ? <div className={styles.localGuideActions}>
      {record.address ? <a href={localGuideDirections(record.address)}>📍 Directions</a> : null}
      {record.phone ? <a href={localGuidePhone(record.phone)}>📞 Call</a> : null}
      {record.website ? <ExternalLinkConfirm href={localGuideWebsite(record.website)}>🌐 Website</ExternalLinkConfirm> : null}
    </div> : null}
  </article>;
}

export default function LocalGuide({ records = [] }) {
  const groups = localGuideGroups(localGuideViewModel(records));
  return <section className={`${styles.focusedContent} ${styles.localGuideExperience}`}>
    <header><p className={styles.eyebrow}>Local Concierge</p><h1>Local Guide</h1><p>Everything you may need beyond the golf course during tournament weekend.</p></header>
    {groups.size ? <div className={styles.localGuideSections}>
      {[...groups.entries()].map(([section, sectionRecords]) => <section key={section}>
        <h2><span aria-hidden="true">{localGuideSectionIcon(section)}</span>{section}</h2>
        <div>{sectionRecords.map((record) => <LocalGuideCard record={record} key={record.id} />)}</div>
      </section>)}
    </div> : <div className={styles.empty}><span>Local Guide</span><h2>Local information is being prepared.</h2><p>Curated tournament-weekend recommendations will appear here when published.</p></div>}
  </section>;
}
