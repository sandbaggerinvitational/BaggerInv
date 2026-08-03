import ExternalLinkConfirm from "../ExternalLinkConfirm";
import { contactCallHref, contactCategoryIcon, contactEmailHref, contactGroups, contactsViewModel, contactTextHref, contactWebsiteHref } from "../../lib/tournament-guide-contacts";
import styles from "./tournament-guide.module.css";

function ActionIcon({ icon, label }) {
  return <><span className={styles.contactActionGlyph} aria-hidden="true">{icon}</span><span className={styles.visuallyHidden}>{label}</span></>;
}

function ContactCard({ contact }) {
  const hasActions = contact.phone || contact.email || contact.website;
  const isTournamentDirector = String(contact.role || "").trim().toLowerCase() === "tournament director";
  return <article className={`${styles.contactCard} ${isTournamentDirector ? styles.primaryContactCard : ""}`}>
    <div><h3>{contact.name}</h3>{contact.role ? <p>{contact.role}</p> : null}</div>
    {hasActions ? <div className={styles.contactActions}>
      {contact.phone ? <a href={contactCallHref(contact.phone)}><ActionIcon icon="📞" label={`Call ${contact.name}`} /></a> : null}
      {contact.phone && contact.textEnabled ? <a href={contactTextHref(contact.phone)}><ActionIcon icon="💬" label={`Text ${contact.name}`} /></a> : null}
      {contact.email ? <a href={contactEmailHref(contact.email)}><ActionIcon icon="✉️" label={`Email ${contact.name}`} /></a> : null}
      {contact.website ? <ExternalLinkConfirm href={contactWebsiteHref(contact.website)}><ActionIcon icon="🌐" label={`Open ${contact.name} website`} /></ExternalLinkConfirm> : null}
    </div> : null}
  </article>;
}

export default function ImportantContacts({ records = [] }) {
  const groups = contactGroups(contactsViewModel(records));
  return <section className={`${styles.focusedContent} ${styles.contactsExperience}`}>
    <header><p className={styles.eyebrow}>Tournament Concierge</p><h1>Important Contacts</h1><p>One-tap access to the people and services you may need during tournament weekend.</p></header>
    {groups.size ? <div className={styles.contactSections}>
      {[...groups.entries()].map(([category, contacts]) => <section key={category}>
        <h2 className={category === "Emergency" ? styles.emergencyContactHeading : ""}><span aria-hidden="true">{contactCategoryIcon(category)}</span>{category}</h2>
        <div>{contacts.map((contact) => <ContactCard contact={contact} key={contact.id} />)}</div>
      </section>)}
    </div> : <div className={styles.empty}><span>Important Contacts</span><h2>Contact information is being prepared.</h2><p>Tournament-weekend contacts will appear here when published.</p></div>}
  </section>;
}
