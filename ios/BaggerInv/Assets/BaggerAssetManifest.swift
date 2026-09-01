import Foundation

/// Audited compile-time mapping from canonical mobile/PWA identity keys to bundled assets.
///
/// Mapping evidence is recorded in `ios/ASSET_INVENTORY.md`. Runtime code must never
/// derive an asset name from a participant-facing display name or arbitrary path.
enum BaggerAssetManifest {
    struct Entry: Hashable, Sendable {
        let canonicalID: String
        let sourceAssetKey: String
        let catalogName: String
    }

    static let brandPrimary = Entry(
        canonicalID: "BAGGER_PRIMARY",
        sourceAssetKey: "sandbagger-logo",
        catalogName: "brand_bagger_primary"
    )

    static let playerEntries: [Entry] = [
        .init(canonicalID: "AM01", sourceAssetKey: "alex-monteleone-pic", catalogName: "player_am01"),
        .init(canonicalID: "BC01", sourceAssetKey: "brenan-cavanaugh-pic", catalogName: "player_bc01"),
        .init(canonicalID: "BA01", sourceAssetKey: "brian-atkinson-pic", catalogName: "player_ba01"),
        .init(canonicalID: "CL01", sourceAssetKey: "caleb-lewis-pic", catalogName: "player_cl01"),
        .init(canonicalID: "CP01", sourceAssetKey: "chase-patterson-pic", catalogName: "player_cp01"),
        .init(canonicalID: "CS01", sourceAssetKey: "chris-seekely-pic", catalogName: "player_cs01"),
        .init(canonicalID: "CO01", sourceAssetKey: "connor-o'reilly-pic", catalogName: "player_co01"),
        .init(canonicalID: "DR01", sourceAssetKey: "david-rees-jones-pic", catalogName: "player_dr01"),
        .init(canonicalID: "DT01", sourceAssetKey: "david-tatum-pic", catalogName: "player_dt01"),
        .init(canonicalID: "ES01", sourceAssetKey: "eric-stockley-pic", catalogName: "player_es01"),
        .init(canonicalID: "HM01", sourceAssetKey: "holman-moores-pic", catalogName: "player_hm01"),
        .init(canonicalID: "JS01", sourceAssetKey: "jack-samis-pic", catalogName: "player_js01"),
        .init(canonicalID: "JP01", sourceAssetKey: "jason-powell-pic", catalogName: "player_jp01"),
        .init(canonicalID: "JK01", sourceAssetKey: "jupjee-kochar-pic", catalogName: "player_jk01"),
        .init(canonicalID: "CB01", sourceAssetKey: "clay-beltran-pic", catalogName: "player_cb01"),
        .init(canonicalID: "MS02", sourceAssetKey: "matthew-smith-pic", catalogName: "player_ms02"),
        .init(canonicalID: "MM01", sourceAssetKey: "max-markley-pic", catalogName: "player_mm01"),
        .init(canonicalID: "MS01", sourceAssetKey: "memo-saldana-pic", catalogName: "player_ms01"),
        .init(canonicalID: "MH01", sourceAssetKey: "michael-hunnicutt-pic", catalogName: "player_mh01"),
        .init(canonicalID: "MB01", sourceAssetKey: "miles-berger-pic", catalogName: "player_mb01"),
        .init(canonicalID: "NJ01", sourceAssetKey: "nick-julian-pic", catalogName: "player_nj01"),
        .init(canonicalID: "RH01", sourceAssetKey: "raymond-hill-pic", catalogName: "player_rh01"),
        .init(canonicalID: "RM01", sourceAssetKey: "robert-murphy-pic", catalogName: "player_rm01"),
        .init(canonicalID: "SS01", sourceAssetKey: "sonny-stepp-pic", catalogName: "player_ss01"),
        .init(canonicalID: "TL01", sourceAssetKey: "taylor-lippincott-pic", catalogName: "player_tl01"),
        .init(canonicalID: "WC01", sourceAssetKey: "wade-caston-pic", catalogName: "player_wc01"),
        .init(canonicalID: "WO01", sourceAssetKey: "will-oliver-pic", catalogName: "player_wo01"),
    ]

    static let teamEntries: [Entry] = [
        .init(canonicalID: "HORNITOS", sourceAssetKey: "hornitos-logo", catalogName: "team_hornitos"),
        .init(canonicalID: "THONGCHAI", sourceAssetKey: "thongchai-logo", catalogName: "team_thongchai"),
        .init(canonicalID: "HOSUNG", sourceAssetKey: "hosung-logo", catalogName: "team_hosung"),
        .init(canonicalID: "PHMAFIA", sourceAssetKey: "philsmafia-logo", catalogName: "team_phmafia"),
        .init(canonicalID: "MAKINIT", sourceAssetKey: "makinit-logo", catalogName: "team_makinit"),
        .init(canonicalID: "PERROS", sourceAssetKey: "nasty-logo", catalogName: "team_perros"),
        .init(canonicalID: "DIRTYMIKE", sourceAssetKey: "dirtymike-logo", catalogName: "team_dirtymike"),
        .init(canonicalID: "NUMBA1", sourceAssetKey: "numba1-logo", catalogName: "team_numba1"),
        .init(canonicalID: "HOLYMEN", sourceAssetKey: "holymen-logo", catalogName: "team_holymen"),
        .init(canonicalID: "FLOPPERS", sourceAssetKey: "dtfloppers-logo", catalogName: "team_floppers"),
        .init(canonicalID: "DHC", sourceAssetKey: "dhc-logo", catalogName: "team_dhc"),
        .init(canonicalID: "MONTLEY", sourceAssetKey: "montley-logo", catalogName: "team_montley"),
        .init(canonicalID: "QUEENS", sourceAssetKey: "queens-logo", catalogName: "team_queens"),
        .init(canonicalID: "BANDONBROS", sourceAssetKey: "bandonbrothers-logo", catalogName: "team_bandonbros"),
        .init(canonicalID: "CRIPSYBOYS", sourceAssetKey: "crispyboys-logo", catalogName: "team_cripsyboys"),
        .init(canonicalID: "PICKLES", sourceAssetKey: "pickles-logo", catalogName: "team_pickles"),
        .init(canonicalID: "LIPPIT", sourceAssetKey: "lippit-logo", catalogName: "team_lippit"),
    ]

    /// Several historical course IDs intentionally share a single physical mark:
    /// resort-level source files are byte-identical, and PDC01/PDC02 are two rounds
    /// on the same Pete Dye course. These reviewed aliases avoid duplicate resources.
    static let courseEntries: [Entry] = [
        .init(canonicalID: "TNGC01", sourceAssetKey: "troon-north-logo", catalogName: "course_tngc01_logo"),
        .init(canonicalID: "WKPS01", sourceAssetKey: "wekopa-saguaro-logo", catalogName: "course_wkps01_logo"),
        .init(canonicalID: "GGCR01", sourceAssetKey: "grayhawk-raptor-logo", catalogName: "course_ggcr01_logo"),
        .init(canonicalID: "ARGC01", sourceAssetKey: "apple-rock-logo", catalogName: "course_argc01_logo"),
        .init(canonicalID: "SRGC01", sourceAssetKey: "slick-rock-logo", catalogName: "course_argc01_logo"),
        .init(canonicalID: "SRGC02", sourceAssetKey: "summit-rock-logo", catalogName: "course_argc01_logo"),
        .init(canonicalID: "RSF01", sourceAssetKey: "redsky-fazio-logo", catalogName: "course_rsf01_logo"),
        .init(canonicalID: "EVGC01", sourceAssetKey: "eagle-vail-logo", catalogName: "course_evgc01_logo"),
        .init(canonicalID: "RSN01", sourceAssetKey: "redsky-norman-logo", catalogName: "course_rsf01_logo"),
        .init(canonicalID: "GTW01", sourceAssetKey: "the-wolverine-logo", catalogName: "course_gtw01_logo"),
        .init(canonicalID: "GTB01", sourceAssetKey: "the-bear-logo", catalogName: "course_gtw01_logo"),
        .init(canonicalID: "FDGC01", sourceAssetKey: "forest-dunes-logo", catalogName: "course_fdgc01_logo"),
        .init(canonicalID: "ONGC01", sourceAssetKey: "ozarks-national-logo", catalogName: "course_ongc01_logo"),
        .init(canonicalID: "BRGC01", sourceAssetKey: "buffalo-ridge-logo", catalogName: "course_brgc01_logo"),
        .init(canonicalID: "PVGC01", sourceAssetKey: "paynes-valley-logo", catalogName: "course_pvgc01_logo"),
        .init(canonicalID: "P201", sourceAssetKey: "pinehurst-no2-logo", catalogName: "course_p201_logo"),
        .init(canonicalID: "P701", sourceAssetKey: "pinehurst-no7-logo", catalogName: "course_p701_logo"),
        .init(canonicalID: "P401", sourceAssetKey: "pinehurst-no4-logo", catalogName: "course_p401_logo"),
        .init(canonicalID: "PDC01", sourceAssetKey: "pete-dye-logo", catalogName: "course_pdc01_logo"),
        .init(canonicalID: "PDC02", sourceAssetKey: "pete-dye-logo", catalogName: "course_pdc01_logo"),
        .init(canonicalID: "DRC01", sourceAssetKey: "donald-ross-logo", catalogName: "course_drc01_logo"),
        .init(canonicalID: "SVGC01", sourceAssetKey: "sedge-valley-logo", catalogName: "course_svgc01_logo"),
        .init(canonicalID: "MDGC01", sourceAssetKey: "mammoth-dunes-logo", catalogName: "course_mdgc01_logo"),
        .init(canonicalID: "SVGC02", sourceAssetKey: "sand-valley-logo", catalogName: "course_svgc02_logo"),
        .init(canonicalID: "OMGC01", sourceAssetKey: "old-macdonald-logo", catalogName: "course_omgc01_logo"),
        .init(canonicalID: "BDGC01", sourceAssetKey: "bandon-dunes-logo", catalogName: "course_bdgc01_logo"),
        .init(canonicalID: "PDGC03", sourceAssetKey: "pacific-dunes-logo", catalogName: "course_pdgc03_logo"),
        .init(canonicalID: "TPGC01", sourceAssetKey: "turtle-point-logo", catalogName: "course_tpgc01_logo"),
        .init(canonicalID: "CPGC01", sourceAssetKey: "cougar-point-logo", catalogName: "course_cpgc01_logo"),
        .init(canonicalID: "OCGC01", sourceAssetKey: "ocean-course-logo", catalogName: "course_ocgc01_logo"),
    ]

    static let tournamentEntries: [Entry] = (2017...2026).map { year in
        Entry(
            canonicalID: String(year),
            sourceAssetKey: "sandbagger-\(year)",
            catalogName: "tournament_\(year)_logo"
        )
    }

    static let playersByID = indexed(playerEntries)
    static let teamsByID = indexed(teamEntries)
    static let coursesByID = indexed(courseEntries)
    static let tournamentsByYear = indexed(tournamentEntries)

    static let allEntries = [brandPrimary] + playerEntries + teamEntries + courseEntries + tournamentEntries

    static let intentionalSharedCatalogNames: Set<String> = [
        "course_argc01_logo",
        "course_rsf01_logo",
        "course_gtw01_logo",
        "course_pdc01_logo",
    ]

    private static func indexed(_ entries: [Entry]) -> [String: Entry] {
        Dictionary(uniqueKeysWithValues: entries.map { ($0.canonicalID, $0) })
    }
}
