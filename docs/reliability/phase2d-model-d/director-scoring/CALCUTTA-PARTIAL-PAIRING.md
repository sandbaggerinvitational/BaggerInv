# Partial-purchase competitive context

The predecessor `calcuttaPublicationRecords` filtered canonical round results to purchased player IDs before ranking. A purchased Scramble player with an unpurchased teammate therefore reached `rankScrambleTeams` with one member; that function returned null, and the payout map raised TypeError.

Scramble ranks complete two-player competitive pairings. Its configured team awards and occupied-place tie averages are unchanged; each member retains one half of the team award. The corrected input includes a purchased player's canonical teammate. It does not include wholly unpurchased pairings in the auction competition or add an auction asset. BB and SI remain purchased individual placement competitions.

Only purchased IDs create model golfers, overall financial standings, owner investments, or publication rows. An unpurchased teammate's half is not reassigned. Pot, purchase prices, ownership, auction revisions/history and publication authority are unchanged. Publication retains canonical team tie size so readback can calculate the same configured half-share without publishing the teammate as an asset.

Malformed canonical pairing data (missing/duplicate member or inconsistent team net score) raises `CALCUTTA_COMPETITIVE_PAIRING_INVALID`. Existing worker classification makes it terminal; recognized transport/database transient failures retain their existing retry policy. Legacy historical individual Scramble inputs without any pairing identity retain their existing adapter behavior.

The predecessor reproduction loads the exact base calculator from Git. Focused tests cover both purchased, either purchased, neither purchased, mixed pairing coverage, ties, malformed context, immutable input facts, purchased-only ownership, publication replay and unchanged BB/SI policy. Owned PostgreSQL/Queue replay evidence is reported separately; this document does not assert hosted acceptance.
