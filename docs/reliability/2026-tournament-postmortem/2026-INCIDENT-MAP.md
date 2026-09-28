# Incident relationships

```text
Independent immediate defects
 ├─ SQL special-expression misuse: 010, 012
 ├─ Missing PWA Production key: 014
 ├─ Fractional local Date equality: 006
 ├─ Shipping appearance versus gallery: 003
 └─ Odds numeric semantic bounds: 008

Shared architectural contributors
 ├─ Feature and global-session coupling: 007; amplifies symptoms in 008, 009, 012
 ├─ Broad lifecycle, activation, and dependency coupling: 011, 013, 016, 017, 019
 ├─ Live historical work: proven for 019; risk for 023, with causation unknown
 └─ Hidden operational state and missing recovery UI: 016–021

Infrastructure observations, not one proven causal chain
 ├─ Authority outages: 022, 023
 ├─ Disk I/O warning: 024
 └─ Missing correlation: 025; exact physical spectator cause for 026 is unknown

Certification escape layer crosses all groups above
 └─ Wrong layer, fixture, sequence, volume, or physical scope; see 04
```

The stable full identifiers and independent distinctions are in the [incident register](02-INCIDENT-REGISTER.md). This compact map does not count every arrow as an independent incident. The SQL syntax defects, Native Date defect, and missing secret were not caused by Supabase capacity.
