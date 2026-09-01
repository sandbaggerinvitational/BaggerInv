# Native asset inventory and distribution record

This document records the reviewed relationship between the website asset repository, the canonical data keys exposed to mobile, and the native iOS asset catalog. It is an inventory and release-control record, not evidence that any third-party image is licensed for native distribution.

## Audit baseline

| Item | Audited value |
| --- | --- |
| Website repository | Companion `BaggerInv` worktree |
| Website branch | `feature/mock-tournament-qa-integration` |
| Starting website HEAD | `1ee626d598ed91fad26d6fda455e3d109135f01d` |
| Website status at audit | Clean |
| Native repository | `BaggerInv-ios` worktree |
| Native branch / starting HEAD | `feature/native-ios-app` / `e6455ce9c4ddb8a3224e59cee832cd5f7c4114c1` |
| Native mapping snapshot | `ios/BaggerInv/Assets/BaggerAssetManifest.swift` and `ios/BaggerInv/Assets/BaggerAssets.swift` in the working tree |
| Audit date | 2026-08-31 |

The source counts below include only files tracked by Git at the starting website HEAD. The native counts describe the reviewed catalog in the native working tree at the time this document was written.

## Website asset inventory

The website contains **153 tracked raster assets totaling 40,281,255 bytes** (about 38.4 MiB): 91 WebP, 60 PNG, one ICO, and one JPG.

| Family | Website location | Files | Bytes | Source format and dimensions | Native disposition |
| --- | --- | ---: | ---: | --- | --- |
| App-router icons | `app/icon.png`, `app/apple-icon.png`, `app/favicon.ico` | 3 | 602,232 | PNG/ICO; 1024x1024, 180x180, and 48x48 | Not imported; PWA artwork is not automatically approved native icon artwork |
| Public icons | `public/apple-touch-icon.png`, `public/favicon-*.png`, `public/icon-*.png` | 6 | 363,157 | PNG; 16x16 through 512x512 | Not imported |
| PWA launch splashes | `public/splash/` | 12 | 1,916,663 | PNG; 640x1136 through 1320x2868 | Obsolete for native launch UI; remain website-owned |
| Primary brand | `public/images/sandbagger-logo.png` | 1 | 215,303 | PNG, 3004x4000 | Selected and resized as `brand_bagger_primary` |
| Web defaults | `public/images/defaults/` | 5 | 44,446 | Three 800x800 identity defaults; two 1600x900 hero defaults | Not imported; native uses semantic fallbacks |
| Home hero | `public/images/home-page-hero.webp` | 1 | 391,544 | WebP, 1600x900 | Deferred |
| Trophy photo | `public/images/trophy.jpg` | 1 | 584,305 | JPG, 1152x1536 | Deferred |
| Player portraits | `public/images/players/` | 27 | 5,734,560 | WebP, all 800x800 | All 27 available portraits selected as 512x512 JPEG |
| Team logos | `public/images/teams/logos/` | 18 | 1,311,316 | WebP, all 800x800 | 17 mapped logos selected; one orphan excluded |
| Course logos | `public/images/courses/logos/` | 29 | 4,198,476 | PNG; 18 are 800x800, 11 range from 300x163 to 800x670 | All 30 canonical course rows covered by 25 deduplicated native resources |
| Course/profile heroes | `public/images/courses/hero/` | 30 | 17,855,664 | WebP, all 1600x900 | Deferred remote imagery |
| Tournament logos | `public/images/tournaments/logos/` | 10 | 1,460,537 | PNG, all 800x800 | All 2017–2026 logos selected as 512x512 PNG |
| Tournament heroes | `public/images/tournaments/hero/` | 10 | 5,603,052 | WebP, all 1600x900 | Deferred remote imagery |
| **Total** |  | **153** | **40,281,255** |  |  |

## Canonical mapping sources

Canonical identity comes from data IDs and explicit asset keys. Runtime code must not derive an asset from a display name, arbitrary path, or guessed website URL.

| Layer | Source | Mapping responsibility |
| --- | --- | --- |
| Checked-in historical snapshot | `lib/historical-data.json` | Contains 41 players, 20 team/year rows, 30 course rows, and 10 tournaments. Asset fields are `Photo Filename`, `Team Logo`, `Course Logo`, `Course Profile Image`, `Annual Image`, and `Hero Image`. This is a fallback snapshot, not the live authority. |
| Live historical and Guide sources | `lib/google-sheets-data.js` | Names the production workbook sheets, including Players, Team Names, Courses, Tournaments, and the Guide sheets. Live data can drift after the audited website HEAD. |
| PWA key-to-path mapping | `lib/asset-paths.js` | Maps asset keys to website folders and extensions. Player filenames remove apostrophes only at the web-path boundary. It also provides five web defaults and hard-codes the three 2026 course-logo IDs. |
| PWA presentation fallback | `app/AssetImage.js`, `app/PlayerAvatar.js`, `app/TeamLogoPlate.js` | Selects web defaults or initials when a mapped file is unavailable. |
| Guide projection | `lib/tournament-guide-projection.js` | Normalizes tournament logo/hero aliases and passes course logo/profile keys into the Guide projection. |
| Mobile Guide contract | `lib/mobile-v1-guide.js` | Emits validated `logoAssetKey`, `heroAssetKey`, `mobileHeroAssetKey`, course `logoAssetKey`, and course `profileAssetKey`. It does not emit a URL, folder, extension, hash, or asset version. |
| Mobile Passport contract | `lib/mobile-v1-passport.js` | Emits a validated `portraitAssetKey`; no portrait URL or version is supplied. |
| Completed-history mapping | `lib/completed-history-contract.js`, `lib/completed-history-presentation-adapter.js` | Persists and rehydrates team, course, and tournament asset keys for completed history. |
| Current-to-history bridge | `lib/history-2026-adapter.js`, `lib/history-presentation.js` | Projects current Guide/player/team/tournament keys into historical presentation fields and converts history hero keys to PWA paths. |
| Native compile-time manifest | `ios/BaggerInv/Assets/BaggerAssetManifest.swift` | Maps reviewed canonical IDs and exact source asset keys to native catalog names. |
| Native resolver | `ios/BaggerInv/Assets/BaggerAssets.swift` | Trims and uppercases canonical IDs, requires an exact asset-key match when a key is supplied, and fails closed to a semantic fallback. |

The native app must not reproduce the folder/extension rules from `lib/asset-paths.js`. The current mobile contracts intentionally expose stable keys, not a remote-asset delivery contract.

## Selected native catalog and optimization

The native manifest contains **85 logical entries backed by 80 physical image resources**. Four reviewed course alias groups share a physical catalog resource. Source bytes below count each selected physical source only once.

| Family | Logical entries | Physical resources | Selected website bytes | Native bytes | Native dimensions/format | Change |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| Brand | 1 | 1 | 215,303 | 89,412 | 384x512 PNG | -58.5% |
| Players | 27 | 27 | 5,734,560 | 2,354,229 | 512x512 JPEG | -58.9% |
| Teams | 17 | 17 | 1,192,184 | 1,980,996 | 512x512 PNG | +66.2% |
| Courses | 30 | 25 | 3,719,232 | 2,169,040 | PNG; maximum dimension 512, aspect ratio preserved | -41.7% |
| Tournaments | 10 | 10 | 1,460,537 | 1,082,178 | 512x512 PNG | -25.9% |
| **Total** | **85** | **80** | **12,321,816** | **7,675,855** |  | **-37.7%** |

All selected imagesets currently contain one universal `1x` resource. Players, teams, and tournament marks are 512x512. Course outputs preserve source aspect ratio: 17 are 512x512 and eight range from 300x163 to 512x428. The 300x163, 300x180, 450x260, and 500x500 course sources were not upscaled.

The team family grew by 788,812 bytes when 800x800 WebP files were converted to 512x512 transparency-preserving PNG. Before release, measure the compiled archive rather than only source-control bytes and losslessly optimize these PNGs if the archive confirms the increase. Do not use JPEG for marks that require transparency. Player JPEG crops and the resized primary brand mark require visual review on light and dark backgrounds.

The final clean Debug Simulator comparison measured the packaged app at 33,748 KiB before this step and 40,156 KiB after it: a 6,408 KiB (19.0%) increase. The compiled `Assets.car` is 6,127,592 bytes. This is an acceptable technical foundation for the 80 offline identity resources, but the eventual distribution archive must still be measured because App Store thinning and release optimization differ from a Debug Simulator bundle.

Native catalog naming is intentionally stable and data-oriented:

- primary brand: `brand_bagger_primary`;
- player: `player_<lowercased canonical player ID>`;
- team: `team_<reviewed stable mnemonic>`;
- course: `course_<lowercased canonical course ID>_logo`, except documented shared resources; and
- tournament: `tournament_<year>_logo`.

## Player coverage

The source snapshot has 41 canonical players. All 27 available website portraits are selected; 14 mapped keys have no tracked source file. Three missing portraits belong to active players. A missing or mismatched portrait always falls back to initials.

| Player ID | Display name | Active | Canonical portrait key | Native catalog name | Coverage |
| --- | --- | --- | --- | --- | --- |
| AM01 | Alex Monteleone | Yes | `alex-monteleone-pic` | `player_am01` | Selected |
| BJ01 | Blake Jumonville | No | `blake-jumonville-pic` | — | Missing source; initials |
| BC01 | Brenan Cavanaugh | Yes | `brenan-cavanaugh-pic` | `player_bc01` | Selected |
| BA01 | Brian Atkinson | Yes | `brian-atkinson-pic` | `player_ba01` | Selected |
| CL01 | Caleb Lewis | Yes | `caleb-lewis-pic` | `player_cl01` | Selected |
| CO02 | Cameron O'Reilly | No | `cameron-o'reilly-pic` | — | Missing source; initials |
| CP01 | Chase Patterson | Yes | `chase-patterson-pic` | `player_cp01` | Selected |
| CM01 | Chris Micheal | Yes | `chris-micheal-pic` | — | **Missing active source; initials** |
| CS01 | Chris Seekely | Yes | `chris-seekely-pic` | `player_cs01` | Selected |
| CO01 | Connor O'Reilly | Yes | `connor-o'reilly-pic` | `player_co01` | Selected; apostrophe normalized only for website filename |
| CF01 | Conor Freeman | No | `conor-freeman-pic` | — | Missing source; initials |
| DR01 | David Rees-Jones | Yes | `david-rees-jones-pic` | `player_dr01` | Selected |
| DT01 | David Tatum | Yes | `david-tatum-pic` | `player_dt01` | Selected |
| ES01 | Eric Stockley | Yes | `eric-stockley-pic` | `player_es01` | Selected |
| HM01 | Holman Moores | Yes | `holman-moores-pic` | `player_hm01` | Selected |
| JK02 | Jack Keffler | Yes | `jack-keffler-pic` | — | **Missing active source; initials** |
| JS01 | Jack Samis | Yes | `jack-samis-pic` | `player_js01` | Selected |
| JS02 | Jack Stickney | No | `jack-stickney-pic` | — | Missing source; initials |
| JP01 | Jason Powell | Yes | `jason-powell-pic` | `player_jp01` | Selected |
| JG01 | John Geibel | No | `john-geibel-pic` | — | Missing source; initials |
| JK01 | Jupjee Kochar | Yes | `jupjee-kochar-pic` | `player_jk01` | Selected |
| KW01 | Kelly Whaley | No | `kelly-whaley-pic` | — | Missing source; initials |
| CB01 | Clay Beltran | Yes | `clay-beltran-pic` | `player_cb01` | Selected |
| MS02 | Matthew Smith | Yes | `matthew-smith-pic` | `player_ms02` | Selected |
| MM01 | Max Markley | Yes | `max-markley-pic` | `player_mm01` | Selected |
| MS01 | Memo Saldana | Yes | `memo-saldana-pic` | `player_ms01` | Selected |
| MH01 | Michael Hunnicutt | Yes | `michael-hunnicutt-pic` | `player_mh01` | Selected |
| MO01 | Michael O'Brien | No | `michael-o'brien-pic` | — | Missing source; initials |
| MB01 | Miles Berger | Yes | `miles-berger-pic` | `player_mb01` | Selected |
| NJ01 | Nick Julian | Yes | `nick-julian-pic` | `player_nj01` | Selected |
| PN01 | Patrick Noonan | Yes | `patrick-noonan-pic` | — | **Missing active source; initials** |
| PC01 | Phillip Curry | No | `phillip-curry-pic` | — | Missing source; initials |
| RH01 | Raymond Hill | Yes | `raymond-hill-pic` | `player_rh01` | Selected |
| RM01 | Robert Murphy | Yes | `robert-murphy-pic` | `player_rm01` | Selected |
| SS01 | Sonny Stepp | Yes | `sonny-stepp-pic` | `player_ss01` | Selected |
| SL01 | Stephen Levy | No | `stephen-levy-pic` | — | Missing source; initials |
| TL01 | Taylor Lippincott | Yes | `taylor-lippincott-pic` | `player_tl01` | Selected |
| TG01 | Tim Gregg | No | `tim-gregg-pic` | — | Missing source; initials |
| WC01 | Wade Caston | Yes | `wade-caston-pic` | `player_wc01` | Selected |
| WD01 | William Dace | No | `william-dace-pic` | — | Missing source; initials |
| WO01 | Will Oliver | Yes | `will-oliver-pic` | `player_wo01` | Selected |

## Team coverage

The source snapshot has two team rows per tournament year. Seventeen of 20 canonical keys have a tracked logo and are selected. The three absent historical logos remain text/initials-only. The unreferenced `jupjays-logo` is not a substitute for any missing canonical key.

| Year | Team ID | Display name | Canonical logo key | Native catalog name | Coverage |
| ---: | --- | --- | --- | --- | --- |
| 2017 | HORNITOS | Team Hornitos | `hornitos-logo` | `team_hornitos` | Selected |
| 2017 | THONGCHAI | Thongchai's Army | `thongchai-logo` | `team_thongchai` | Selected |
| 2018 | HOSUNG | Hosung Choi's Sauce | `hosung-logo` | `team_hosung` | Selected |
| 2018 | PHMAFIA | Phil's Mafia | `philsmafia-logo` | `team_phmafia` | Selected |
| 2019 | VJSINGH | Vijay's Singh Squad | `vijays-logo` | — | Missing source; initials |
| 2019 | PHBOMBS | Phil's Calvity Bombs | `philscb-logo` | — | Missing source; initials |
| 2020 | BRYSON | Bryson's Beefcakes | `brysons-logo` | — | Missing source; initials |
| 2020 | MAKINIT | Makin' It Wayne | `makinit-logo` | `team_makinit` | Selected |
| 2021 | PERROS | Nasty Perros | `nasty-logo` | `team_perros` | Selected |
| 2021 | DIRTYMIKE | Dirty Mike and The Boys | `dirtymike-logo` | `team_dirtymike` | Selected |
| 2022 | NUMBA1 | Numba 1 Stunnas | `numba1-logo` | `team_numba1` | Selected |
| 2022 | HOLYMEN | The Holymen | `holymen-logo` | `team_holymen` | Selected |
| 2023 | FLOPPERS | DT Floppers | `dtfloppers-logo` | `team_floppers` | Selected |
| 2023 | DHC | Dick's High Cutters | `dhc-logo` | `team_dhc` | Selected |
| 2024 | MONTLEY | Möntley Crüe | `montley-logo` | `team_montley` | Selected |
| 2024 | QUEENS | Queen's Mafia | `queens-logo` | `team_queens` | Selected |
| 2025 | BANDONBROS | Bandon Brothers | `bandonbrothers-logo` | `team_bandonbros` | Selected |
| 2025 | CRIPSYBOYS | The Crispy Boys | `crispyboys-logo` | `team_cripsyboys` | Selected; catalog preserves canonical ID spelling |
| 2026 | PICKLES | The Pickles | `pickles-logo` | `team_pickles` | Selected |
| 2026 | LIPPIT | Lipp it and Rip it | `lippit-logo` | `team_lippit` | Selected |

## Course coverage

All 30 canonical course rows have a selected logo mapping. Exact duplicate resort marks and the two Pete Dye rows share reviewed physical resources, reducing 30 logical mappings to 25 images. Every course profile/hero key remains deferred; no course photography is bundled.

| Year | Course ID | Course | Canonical logo key | Native catalog name | Canonical profile key | Coverage |
| ---: | --- | --- | --- | --- | --- | --- |
| 2017 | TNGC01 | Troon North Golf Club | `troon-north-logo` | `course_tngc01_logo` | `troon-north-profile` | Logo selected; profile deferred |
| 2017 | WKPS01 | We-Ko-Pa Golf Club - Saguaro | `wekopa-saguaro-logo` | `course_wkps01_logo` | `wekopa-saguaro-profile` | Logo selected; profile deferred |
| 2017 | GGCR01 | Grayhawk Golf Club - Raptor | `grayhawk-raptor-logo` | `course_ggcr01_logo` | `grayhawk-raptor-profile` | Logo selected; profile deferred |
| 2018 | ARGC01 | Apple Rock Golf Course | `apple-rock-logo` | `course_argc01_logo` | `apple-rock-profile` | Logo selected; shared resort mark |
| 2018 | SRGC01 | Slick Rock Golf Course | `slick-rock-logo` | `course_argc01_logo` | `slick-rock-profile` | Logo selected; shared resort mark |
| 2018 | SRGC02 | Summit Rock Golf Course | `summit-rock-logo` | `course_argc01_logo` | `summit-rock-profile` | Logo selected; shared resort mark |
| 2019 | RSF01 | Red Sky - Fazio Course | `redsky-fazio-logo` | `course_rsf01_logo` | `redsky-fazio-profile` | Logo selected; shared resort mark |
| 2019 | EVGC01 | Eagle Vail Golf Club | `eagle-vail-logo` | `course_evgc01_logo` | `eagle-vail-profile` | Logo selected; profile deferred |
| 2019 | RSN01 | Red Sky - Norman Course | `redsky-norman-logo` | `course_rsf01_logo` | `redsky-norman-profile` | Logo selected; shared resort mark |
| 2020 | GTW01 | Grand Traverse Resort and Spa - The Wolverine | `the-wolverine-logo` | `course_gtw01_logo` | `the-wolverine-profile` | Logo selected; shared resort mark |
| 2020 | GTB01 | Grand Traverse Resort and Spa - The Bear | `the-bear-logo` | `course_gtw01_logo` | `the-bear-profile` | Logo selected; shared resort mark |
| 2020 | FDGC01 | Forest Dunes Golf Club | `forest-dunes-logo` | `course_fdgc01_logo` | `forest-dunes-profile` | Logo selected; profile deferred |
| 2021 | ONGC01 | Ozarks National Golf Course | `ozarks-national-logo` | `course_ongc01_logo` | `ozarks-national-profile` | Logo selected; profile deferred |
| 2021 | BRGC01 | Buffalo Ridge Golf Course | `buffalo-ridge-logo` | `course_brgc01_logo` | `buffalo-ridge-profile` | Logo selected; profile deferred |
| 2021 | PVGC01 | Payne's Valley Golf Course | `paynes-valley-logo` | `course_pvgc01_logo` | `paynes-valley-profile` | Logo selected; profile deferred |
| 2022 | P201 | Pinehurst No. 2 | `pinehurst-no2-logo` | `course_p201_logo` | `pinehurst-no2-profile` | Logo selected; profile deferred |
| 2022 | P701 | Pinehurst No. 7 | `pinehurst-no7-logo` | `course_p701_logo` | `pinehurst-no7-profile` | Logo selected; profile deferred |
| 2022 | P401 | Pinehurst No.4 | `pinehurst-no4-logo` | `course_p401_logo` | `pinehurst-no4-profile` | Logo selected; profile deferred |
| 2023 | PDC01 | The Pete Dye Course | `pete-dye-logo` | `course_pdc01_logo` | `pete-dye-profile` | Logo selected; shared canonical key; profile deferred |
| 2023 | PDC02 | The Pete Dye Course | `pete-dye-logo` | `course_pdc01_logo` | `pete-dye-profile` | Logo selected; shared canonical key; profile deferred |
| 2023 | DRC01 | The Donald Ross Course | `donald-ross-logo` | `course_drc01_logo` | `donald-ross-profile` | Logo selected; profile deferred |
| 2024 | SVGC01 | Sedge Valley | `sedge-valley-logo` | `course_svgc01_logo` | `sedge-valley-profile` | Logo selected; profile deferred |
| 2024 | MDGC01 | Mammoth Dunes | `mammoth-dunes-logo` | `course_mdgc01_logo` | `mammoth-dunes-profile` | Logo selected; profile deferred |
| 2024 | SVGC02 | Sand Valley | `sand-valley-logo` | `course_svgc02_logo` | `sand-valley-profile` | Logo selected; profile deferred |
| 2025 | OMGC01 | Old Macdonald | `old-macdonald-logo` | `course_omgc01_logo` | `old-macdonald-profile` | Logo selected; profile deferred |
| 2025 | BDGC01 | Bandon Dunes | `bandon-dunes-logo` | `course_bdgc01_logo` | `bandon-dunes-profile` | Logo selected; profile deferred |
| 2025 | PDGC03 | Pacific Dunes | `pacific-dunes-logo` | `course_pdgc03_logo` | `pacific-dunes-profile` | Logo selected; profile deferred |
| 2026 | TPGC01 | Turtle Point | `turtle-point-logo` | `course_tpgc01_logo` | `turtle-point-profile` | Logo selected; profile deferred |
| 2026 | CPGC01 | Cougar Point | `cougar-point-logo` | `course_cpgc01_logo` | `cougar-point-profile` | Logo selected; profile deferred |
| 2026 | OCGC01 | The Ocean Course | `ocean-course-logo` | `course_ocgc01_logo` | `ocean-course-profile` | Logo selected; profile deferred |

## Tournament coverage

`Annual Image` is empty in all ten checked-in tournament rows. The PWA/native convention derives the logo key as `sandbagger-<year>`. All derived logos and all canonical hero keys resolve in the website repository; only the logos are bundled.

| Year | Edition | Derived canonical logo key | Native catalog name | Canonical hero key | Coverage |
| ---: | --- | --- | --- | --- | --- |
| 2017 | 1st | `sandbagger-2017` | `tournament_2017_logo` | `grayhawk-raptor` | Logo selected; hero deferred |
| 2018 | 2nd | `sandbagger-2018` | `tournament_2018_logo` | `summit-rock` | Logo selected; hero deferred |
| 2019 | 3rd | `sandbagger-2019` | `tournament_2019_logo` | `redsky-norman` | Logo selected; hero deferred |
| 2020 | 4th | `sandbagger-2020` | `tournament_2020_logo` | `forest-dunes` | Logo selected; hero deferred |
| 2021 | 5th | `sandbagger-2021` | `tournament_2021_logo` | `paynes-valley` | Logo selected; hero deferred |
| 2022 | 6th | `sandbagger-2022` | `tournament_2022_logo` | `pinehurst-no4` | Logo selected; hero deferred |
| 2023 | 7th | `sandbagger-2023` | `tournament_2023_logo` | `donald-ross` | Logo selected; hero deferred |
| 2024 | 8th | `sandbagger-2024` | `tournament_2024_logo` | `sand-valley` | Logo selected; hero deferred |
| 2025 | 9th | `sandbagger-2025` | `tournament_2025_logo` | `pacific-dunes` | Logo selected; hero deferred |
| 2026 | 10th | `sandbagger-2026` | `tournament_2026_logo` | `ocean-course` | Logo selected; hero deferred |

## Duplicate, orphan, ambiguous, and native-obsolete groups

| Classification | Website files or keys | Evidence / decision |
| --- | --- | --- |
| Exact duplicate course marks | `apple-rock-logo.png`, `slick-rock-logo.png`, `summit-rock-logo.png` | Same SHA-256 (`29687000…`). ARGC01, SRGC01, and SRGC02 intentionally share `course_argc01_logo`. |
| Exact duplicate course marks | `redsky-fazio-logo.png`, `redsky-norman-logo.png` | Same SHA-256 (`875d851f…`). RSF01 and RSN01 intentionally share `course_rsf01_logo`. |
| Exact duplicate course marks | `the-bear-logo.png`, `the-wolverine-logo.png` | Same SHA-256 (`ee2db9ab…`). GTB01 and GTW01 intentionally share `course_gtw01_logo`. |
| Shared logical source | PDC01 and PDC02 both use `pete-dye-logo` and `pete-dye-profile` | One canonical source key by current data contract; both IDs intentionally share `course_pdc01_logo`. Do not infer a different mapping from filenames. |
| Exact duplicate photography | `courses/hero/paynes-valley-profile.webp`, `tournaments/hero/paynes-valley.webp` | Same SHA-256 (`8a6ead13…`) and 479,630 bytes. Both are deferred; a future remote manifest may alias one stored object. |
| Exact duplicate icons | `app/apple-icon.png`, `public/apple-touch-icon.png` | Same SHA-256 (`3d3ebbdd…`) and 15,123 bytes. Website framework duplication; not native inputs. |
| Exact duplicate PWA icons | `public/icon-512.png`, `public/icon-maskable-512.png` | Same SHA-256 (`bad1963f…`) and 164,486 bytes. The maskable variant has no distinct artwork/safe-zone treatment; both are excluded from native. |
| Orphan team logo | `public/images/teams/logos/jupjays-logo.webp` | 119,132 bytes; no canonical Team Names mapping and no source reference. Excluded. Do not guess an ID. |
| Ambiguous course photo | `public/images/courses/hero/pete-dye-profile2.webp` | 358,762 bytes; visually distinct from `pete-dye-profile.webp`, but no canonical row references it. It may have been intended for PDC02, but the data maps PDC01 and PDC02 to `pete-dye-profile`. Excluded pending an authoritative mapping and rights review. |
| Missing player sources | 14 portrait keys listed in the player table | No tracked source file. Do not synthesize a path or substitute another portrait. |
| Missing team sources | `vijays-logo`, `philscb-logo`, `brysons-logo` | Canonical rows exist but files do not. Do not use `jupjays-logo` as a substitute. |
| Native-obsolete web shell art | 3 app icons, 6 public icons, 12 PWA splashes | Remain valid website/PWA assets, but are obsolete as native import candidates. Native app-icon and launch artwork require a separately approved design. |
| Web-only fallback/decorative art | Five web defaults, home hero, trophy photo | Not used by the current native catalog. Native semantic fallbacks replace the defaults; decorative photography is deferred. |

No duplicate catalog payload is intentionally copied for the four shared course groups. `BaggerAssetManifest.intentionalSharedCatalogNames` is the executable allowlist for shared native names.

## Deferred remote imagery

No website photo URL is part of the current native contract. These families remain excluded from the application bundle:

| Deferred family | Files | Website bytes | Current behavior |
| --- | ---: | ---: | --- |
| Course/profile heroes | 30 | 17,855,664 | Course identity uses a selected logo or `flag.fill`; the current native Guide/Courses presentation remains text-first without this photography |
| Tournament heroes | 10 | 5,603,052 | Tournament identity uses its bundled annual logo or primary-brand fallback |
| Home hero | 1 | 391,544 | Website-only decorative image |
| Trophy photo | 1 | 584,305 | Website-only decorative image |

If native remote imagery is approved later, add a versioned public HTTPS manifest rather than hard-coding production website paths. At minimum, each manifest entry must bind a canonical ID and asset key to an allowlisted URL, MIME type, pixel dimensions, content length, immutable version or digest, cache policy, accessibility purpose, and documented distribution-rights status. Downloads must retain the existing semantic fallback when offline, missing, invalid, or revoked. Missing portraits and team marks do not become remote automatically; they remain fallback-only until the canonical source and rights record are approved.

## Runtime fallback strategy

| Family | Resolver behavior | Fallback |
| --- | --- | --- |
| Player portrait | Resolve reviewed player ID; require exact projected key when supplied | Initials |
| Team mark | Resolve reviewed team ID; require exact projected key when supplied | Initials and team name |
| Course logo | Resolve reviewed course ID or documented alias; require exact projected key when supplied | SF Symbol `flag.fill` and course name |
| Tournament logo | Resolve canonical year; require exact projected key when supplied | Primary Bagger brand |
| Primary brand | Compile-time catalog reference | Required catalog resource; visual surfaces must still retain readable text if image loading fails |

Unknown IDs, unsafe paths, URLs, extensions, and key mismatches never trigger name guessing or a network request. Color and imagery are supplementary identity; accessible team, player, course, and tournament text remains authoritative.

## Copyright, privacy, trademark, and distribution flags

At the audited website HEAD, no tracked LICENSE, NOTICE, CREDITS, attribution file, image-source register, or per-asset provenance manifest was found. Therefore **every imported asset has an unverified native-distribution status until documented otherwise**. A file being publicly served by the website or present in source control is not proof of permission to modify, embed, redistribute offline, or distribute through the App Store.

| Asset class | Release flag | Required evidence before production distribution |
| --- | --- | --- |
| Player portraits | **Blocked pending verification** | The depicted person's consent or another valid likeness/privacy basis that explicitly covers native app and offline distribution; source owner; modification/cropping permission; removal process |
| Bagger primary and annual tournament marks | **Blocked pending verification** | Ownership or written authorization for native/App Store use, including resizing and recompression |
| Team marks | **Blocked pending verification** | Ownership/creator authorization and confirmation that any embedded third-party names or marks may be distributed |
| Course/resort logos | **Blocked pending verification** | Trademark/brand-use permission or documented authorized-use basis for native distribution and modification |
| Course/tournament/home/trophy photography | **Deferred and blocked pending verification** | Photographer or rights-holder license, subject/property releases when required, attribution terms, modification permission, and remote/native distribution scope |
| PWA icons and splash art | **Not approved for native** | Separate native icon/design approval plus the same provenance record if reused |

The release rights register should record, per physical asset: canonical IDs that use it, original source, rights holder, license or consent evidence, allowed platforms and territories, modification rights, attribution requirements, expiration or revocation terms, approver, and approval date. Remote delivery does not remove these obligations. Until that register is complete, the safe production posture is to ship text/system-symbol fallbacks or a separately verified first-party brand asset.

## Maintenance rules

1. Re-run this inventory when the website HEAD, canonical data snapshot, or mobile DTO asset-key fields change.
2. Add a native mapping only from a canonical ID plus an exact reviewed key; never from display text.
3. Keep missing rows explicit and preserve fallbacks instead of inventing mappings.
4. Add shared catalog names only after byte/content comparison and document them in `intentionalSharedCatalogNames` and this file.
5. Verify catalog loadability, coverage counts, fail-closed behavior, dark/light rendering, VoiceOver labels, and compiled archive size before release.
6. Do not add remote image loading until a versioned manifest, cache/revocation policy, and rights approval exist.
