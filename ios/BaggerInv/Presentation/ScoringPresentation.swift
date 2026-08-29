import Foundation

enum ScoringScreenAvailability: Equatable, Sendable {
    case loading
    case noMatch
    case upcoming
    case active
    case readOnly
    case completed
    case offline
    case authenticationRequired
    case unavailable
}

enum ScoringFormatPresentation: Equatable, Hashable, Sendable {
    case bestBall
    case scramble
    case singles
    case unsupported(String)

    var title: String {
        switch self {
        case .bestBall: "Best Ball"
        case .scramble: "Scramble"
        case .singles: "Singles"
        case .unsupported(let value): value.isEmpty ? "Unsupported format" : value
        }
    }

    var isSupported: Bool {
        if case .unsupported = self { return false }
        return true
    }
}

enum ScoringMatchStatusPresentation: Equatable, Hashable, Sendable {
    case upcoming
    case live
    case final

    var title: String {
        switch self {
        case .upcoming: "Upcoming"
        case .live: "Live"
        case .final: "Match Final"
        }
    }
}

enum ScoringWinnerPresentation: Equatable, Hashable, Sendable {
    case side(Int)
    case halved

    func title(sides: [ScoringSidePresentation]) -> String {
        switch self {
        case .side(let side):
            return sides.first(where: { $0.side == side })?.name ?? "Side \(side)"
        case .halved:
            return "Halved"
        }
    }
}

struct ScoringParticipantPresentation: Identifiable, Equatable, Hashable, Sendable {
    let playerID: String
    let displayName: String
    let slot: Int
    let isAuthenticatedPlayer: Bool
    let handicapIndex: Double?
    let courseHandicap: Double?
    let playingHandicap: Double?
    let totalStrokes: Double?

    var id: String { playerID }

    var handicapSummary: String? {
        let components: [String] = [
            handicapIndex.map { "HI \(ScoringNumberFormatter.string($0))" },
            courseHandicap.map { "CH \(ScoringNumberFormatter.string($0))" },
            playingHandicap.map { "PH \(ScoringNumberFormatter.string($0))" },
        ].compactMap { $0 }
        return components.isEmpty ? nil : components.joined(separator: " · ")
    }
}

struct ScoringSidePresentation: Identifiable, Equatable, Hashable, Sendable {
    let side: Int
    let teamID: String?
    let name: String
    let participants: [ScoringParticipantPresentation]

    var id: Int { side }
}

struct ScoringCourseHolePresentation: Identifiable, Equatable, Hashable, Sendable {
    let holeNumber: Int
    let par: Double?
    let strokeIndex: Double?
    let yardage: Double?

    var id: Int { holeNumber }

    var contextText: String? {
        let details = [
            par.map { "Par \(ScoringNumberFormatter.string($0))" },
            yardage.map { "\(ScoringNumberFormatter.string($0)) yds" },
            strokeIndex.map { "HCP \(ScoringNumberFormatter.string($0))" },
        ].compactMap { $0 }
        return details.isEmpty ? nil : details.joined(separator: " · ")
    }
}

enum ScoringPresenter {
    static func make(state: ScoringCurrentState) -> ScoringPresentation {
        guard let scoring = state.scoring else {
            return emptyPresentation(
                availability: availabilityWithoutScoring(state.phase),
                isRefreshing: state.isRefreshing,
                safeErrorCode: state.lastServerCode?.rawValue
            )
        }

        let sides = scoring.sides.map { side in
            ScoringSidePresentation(
                side: side.side,
                teamID: side.teamId,
                name: side.name,
                participants: side.participants.map { participant in
                    ScoringParticipantPresentation(
                        playerID: participant.playerId,
                        displayName: participant.displayName,
                        slot: participant.slot,
                        isAuthenticatedPlayer: participant.isAuthenticatedPlayer,
                        handicapIndex: participant.handicapIndex,
                        courseHandicap: participant.courseHandicap,
                        playingHandicap: participant.playingHandicap,
                        totalStrokes: participant.strokes
                    )
                }
            )
        }
        let format = format(scoring.match.format)
        let status = status(scoring.match.status)
        let presentation = ScoringPresentation(
            availability: availability(
                status: scoring.match.status,
                format: format,
                permission: scoring.permission,
                orientationOnly: state.isOrientationOnly
            ),
            matchID: scoring.match.matchId,
            roundText: scoring.match.roundNumber.map { "Round \($0)" },
            format: format,
            status: status,
            result: winner(scoring.match.result),
            sides: sides,
            courseName: scoring.course.name,
            tee: scoring.course.tee,
            courseHoles: scoring.course.holes.map {
                ScoringCourseHolePresentation(
                    holeNumber: $0.holeNumber,
                    par: $0.par,
                    strokeIndex: $0.strokeIndex,
                    yardage: $0.yardage
                )
            },
            officialHoles: scoring.scores.map { score in
                ScoringOfficialHolePresentation(
                    holeNumber: score.holeNumber,
                    revision: score.revision,
                    sides: sides.map { side in
                        ScoringSideValuesPresentation(
                            side: side.side,
                            gross: side.side == 1 ? score.gross.teamOne : score.gross.teamTwo,
                            strokes: side.side == 1 ? score.strokes.teamOne : score.strokes.teamTwo,
                            net: side.side == 1 ? score.net.teamOne : score.net.teamTwo
                        )
                    },
                    winner: winner(score.winner),
                    updatedAt: score.updatedAt?.date
                )
            },
            canonicalCurrentHole: scoring.progress.currentHole == 0 ? nil : scoring.progress.currentHole,
            holesRemaining: scoring.progress.holesRemaining,
            scorecardComplete: scoring.progress.scorecardComplete,
            statusText: scoring.progress.statusText,
            canScore: scoring.permission.canScore,
            readOnly: scoring.permission.readOnly,
            canFinalize: scoring.permission.canFinalize,
            permissionReason: scoring.permission.reason?.rawValue,
            matchRevision: scoring.match.matchRevision,
            permissionRevision: scoring.match.permissionRevision,
            snapshotID: scoring.snapshot.snapshotId,
            snapshotRevision: scoring.snapshot.revision,
            isRefreshing: state.isRefreshing,
            orientationOnly: state.isOrientationOnly,
            safeErrorCode: state.lastServerCode?.rawValue
        )
        return presentation
    }

    private static func emptyPresentation(
        availability: ScoringScreenAvailability,
        isRefreshing: Bool,
        safeErrorCode: String?
    ) -> ScoringPresentation {
        ScoringPresentation(
            availability: availability,
            matchID: nil,
            roundText: nil,
            format: nil,
            status: nil,
            result: nil,
            sides: [],
            courseName: nil,
            tee: nil,
            courseHoles: [],
            officialHoles: [],
            canonicalCurrentHole: nil,
            holesRemaining: nil,
            scorecardComplete: false,
            statusText: nil,
            canScore: false,
            readOnly: true,
            canFinalize: false,
            permissionReason: nil,
            matchRevision: 0,
            permissionRevision: 0,
            snapshotID: nil,
            snapshotRevision: 0,
            isRefreshing: isRefreshing,
            orientationOnly: false,
            safeErrorCode: safeErrorCode
        )
    }

    private static func availabilityWithoutScoring(_ phase: ScoringCurrentPhase) -> ScoringScreenAvailability {
        switch phase {
        case .idle, .loading: .loading
        case .noMatch: .noMatch
        case .authenticationRequired: .authenticationRequired
        case .ready, .offline, .unavailable, .authorizationRequired, .failed: .unavailable
        }
    }

    private static func availability(
        status: MobileMatchStatus,
        format: ScoringFormatPresentation,
        permission: MobileScoringPermission,
        orientationOnly: Bool
    ) -> ScoringScreenAvailability {
        if orientationOnly { return .offline }
        if status == .completed { return .completed }
        if status == .scheduled { return .upcoming }
        if permission.readOnly || !permission.canScore || !format.isSupported { return .readOnly }
        return .active
    }

    private static func format(_ value: MobileScoringFormat) -> ScoringFormatPresentation {
        switch value {
        case .bestBall: .bestBall
        case .scramble: .scramble
        case .singles: .singles
        case .unknown(let rawValue): .unsupported(rawValue)
        }
    }

    private static func status(_ value: MobileMatchStatus) -> ScoringMatchStatusPresentation {
        switch value {
        case .scheduled: .upcoming
        case .inProgress: .live
        case .completed: .final
        }
    }

    private static func winner(_ value: MobileScoringWinner?) -> ScoringWinnerPresentation? {
        switch value {
        case .teamOne: .side(1)
        case .teamTwo: .side(2)
        case .halved: .halved
        case nil: nil
        }
    }
}

struct ScoringSideValuesPresentation: Equatable, Hashable, Sendable {
    let side: Int
    let gross: [Int]
    let strokes: [Double]
    let net: Double?
}

struct ScoringOfficialHolePresentation: Identifiable, Equatable, Hashable, Sendable {
    let holeNumber: Int
    let revision: Int
    let sides: [ScoringSideValuesPresentation]
    let winner: ScoringWinnerPresentation?
    let updatedAt: Date?

    var id: Int { holeNumber }
}

struct ScoringInputKey: Equatable, Hashable, Sendable {
    let side: Int
    let slot: Int
}

struct ScoringInputRowPresentation: Identifiable, Equatable, Hashable, Sendable {
    let key: ScoringInputKey
    let title: String
    let detail: String?
    let isAuthenticatedPlayer: Bool
    let officialGross: Int?
    let canonicalStrokes: Double?

    var id: ScoringInputKey { key }
}

struct ScoringScorecardHolePresentation: Identifiable, Equatable, Hashable, Sendable {
    let hole: ScoringCourseHolePresentation
    let official: ScoringOfficialHolePresentation?

    var id: Int { hole.holeNumber }
}

struct ScoringDraft: Equatable, Sendable {
    let matchID: String
    let holeNumber: Int
    let snapshotID: String?
    let snapshotRevision: Int
    let permissionRevision: Int
    let structuralSignature: String
    private(set) var grossByInput: [ScoringInputKey: Int]

    init(
        matchID: String,
        holeNumber: Int,
        snapshotID: String?,
        snapshotRevision: Int,
        permissionRevision: Int,
        structuralSignature: String,
        grossByInput: [ScoringInputKey: Int] = [:]
    ) {
        self.matchID = matchID
        self.holeNumber = holeNumber
        self.snapshotID = snapshotID
        self.snapshotRevision = snapshotRevision
        self.permissionRevision = permissionRevision
        self.structuralSignature = structuralSignature
        self.grossByInput = grossByInput
    }

    func value(for key: ScoringInputKey) -> Int? {
        grossByInput[key]
    }

    mutating func set(_ value: Int?, for key: ScoringInputKey) {
        if let value {
            grossByInput[key] = min(max(value, ScoringPresentation.minimumGross), ScoringPresentation.maximumGross)
        } else {
            grossByInput.removeValue(forKey: key)
        }
    }

    var isEmpty: Bool { grossByInput.isEmpty }
}

struct ScoringCanonicalVersion: Equatable, Hashable, Sendable {
    let matchID: String?
    let matchRevision: Int
    let permissionRevision: Int
    let snapshotID: String?
    let snapshotRevision: Int
    let structuralSignature: String
    let isEditable: Bool
}

struct ScoringPresentation: Equatable, Sendable {
    static let minimumGross = 1
    static let maximumGross = 20

    let availability: ScoringScreenAvailability
    let matchID: String?
    let roundText: String?
    let format: ScoringFormatPresentation?
    let status: ScoringMatchStatusPresentation?
    let result: ScoringWinnerPresentation?
    let sides: [ScoringSidePresentation]
    let courseName: String?
    let tee: String?
    let courseHoles: [ScoringCourseHolePresentation]
    let officialHoles: [ScoringOfficialHolePresentation]
    let canonicalCurrentHole: Int?
    let holesRemaining: Int?
    let scorecardComplete: Bool
    let statusText: String?
    let canScore: Bool
    let readOnly: Bool
    let canFinalize: Bool
    let permissionReason: String?
    let matchRevision: Int
    let permissionRevision: Int
    let snapshotID: String?
    let snapshotRevision: Int
    let isRefreshing: Bool
    let orientationOnly: Bool
    let safeErrorCode: String?

    var courseAndTeeText: String? {
        let value = [courseName, tee].compactMap { $0 }.joined(separator: " · ")
        return value.isEmpty ? nil : value
    }

    var isEditable: Bool {
        availability == .active &&
            status == .live &&
            canScore &&
            !readOnly &&
            format?.isSupported == true &&
            !courseHoles.isEmpty &&
            hasValidInputShape &&
            !orientationOnly
    }

    var structuralSignature: String {
        let formatValue = format?.title ?? "none"
        let sideValue = sides.map { side in
            let slots = side.participants.map { String($0.slot) }.joined(separator: ",")
            return "\(side.side):\(slots)"
        }.joined(separator: "|")
        let holes = courseHoles.map { String($0.holeNumber) }.joined(separator: ",")
        return "\(formatValue);\(sideValue);\(holes)"
    }

    var canonicalVersion: ScoringCanonicalVersion {
        ScoringCanonicalVersion(
            matchID: matchID,
            matchRevision: matchRevision,
            permissionRevision: permissionRevision,
            snapshotID: snapshotID,
            snapshotRevision: snapshotRevision,
            structuralSignature: structuralSignature,
            isEditable: isEditable
        )
    }

    var hasValidInputShape: Bool {
        guard sides.map(\.side) == [1, 2], let format else { return false }
        switch format {
        case .bestBall:
            return sides.allSatisfy { $0.participants.map(\.slot) == [1, 2] }
        case .scramble:
            return sides.allSatisfy { !$0.participants.isEmpty && inputRowsForShape(side: $0).count == 1 }
        case .singles:
            return sides.allSatisfy { $0.participants.map(\.slot) == [1] }
        case .unsupported:
            return false
        }
    }

    var officialHoleNumbers: Set<Int> {
        Set(officialHoles.map(\.holeNumber))
    }

    var canonicalHoleNumbers: [Int] {
        reviewHoles.map(\.holeNumber)
    }

    /// Official score rows remain reviewable when the canonical scoring
    /// projection has not published course metadata. Missing par, stroke index,
    /// and yardage stay nil; only the server-provided hole number is retained.
    var reviewHoles: [ScoringCourseHolePresentation] {
        if !courseHoles.isEmpty { return courseHoles }
        return officialHoles.map {
            ScoringCourseHolePresentation(
                holeNumber: $0.holeNumber,
                par: nil,
                strokeIndex: nil,
                yardage: nil
            )
        }
    }

    func hole(_ number: Int) -> ScoringCourseHolePresentation? {
        reviewHoles.first { $0.holeNumber == number }
    }

    func officialHole(_ number: Int) -> ScoringOfficialHolePresentation? {
        officialHoles.first { $0.holeNumber == number }
    }

    func initialSelectedHole() -> Int? {
        guard !canonicalHoleNumbers.isEmpty else { return nil }

        if status == .final {
            return officialHoles.map(\.holeNumber).max() ?? canonicalHoleNumbers.max()
        }
        if let canonicalCurrentHole, canonicalHoleNumbers.contains(canonicalCurrentHole) {
            return canonicalCurrentHole
        }
        return canonicalHoleNumbers.first
    }

    func reconciledSelectedHole(_ preferred: Int?) -> Int? {
        if let preferred, canonicalHoleNumbers.contains(preferred) { return preferred }
        return initialSelectedHole()
    }

    func inputRows(for holeNumber: Int) -> [ScoringInputRowPresentation] {
        guard let format else { return [] }
        let official = officialHole(holeNumber)

        return sides.flatMap { side -> [ScoringInputRowPresentation] in
            let sideValues = official?.sides.first { $0.side == side.side }
            switch format {
            case .bestBall:
                return side.participants.map { participant in
                    let index = participant.slot - 1
                    return ScoringInputRowPresentation(
                        key: ScoringInputKey(side: side.side, slot: participant.slot),
                        title: participant.displayName,
                        detail: participant.handicapSummary,
                        isAuthenticatedPlayer: participant.isAuthenticatedPlayer,
                        officialGross: sideValues?.gross[safe: index],
                        canonicalStrokes: sideValues?.strokes[safe: index]
                    )
                }
            case .scramble:
                return [ScoringInputRowPresentation(
                    key: ScoringInputKey(side: side.side, slot: 1),
                    title: side.name,
                    detail: side.participants.map(\.displayName).joined(separator: " + "),
                    isAuthenticatedPlayer: side.participants.contains(where: \.isAuthenticatedPlayer),
                    officialGross: sideValues?.gross.first,
                    canonicalStrokes: sideValues?.strokes.first
                )]
            case .singles:
                guard let participant = side.participants.first else { return [] }
                return [ScoringInputRowPresentation(
                    key: ScoringInputKey(side: side.side, slot: participant.slot),
                    title: participant.displayName,
                    detail: participant.handicapSummary,
                    isAuthenticatedPlayer: participant.isAuthenticatedPlayer,
                    officialGross: sideValues?.gross.first,
                    canonicalStrokes: sideValues?.strokes.first
                )]
            case .unsupported:
                return []
            }
        }
    }

    var scorecardSections: [(title: String, holes: [ScoringScorecardHolePresentation])] {
        let rows = reviewHoles.map { hole in
            ScoringScorecardHolePresentation(hole: hole, official: officialHole(hole.holeNumber))
        }
        let front = rows.filter { $0.hole.holeNumber <= 9 }
        let back = rows.filter { $0.hole.holeNumber > 9 }
        return [
            ("Front 9", front),
            ("Back 9", back),
        ].filter { !$0.holes.isEmpty }
    }

    func makeDraft(for holeNumber: Int) -> ScoringDraft? {
        guard isEditable, canonicalHoleNumbers.contains(holeNumber), let matchID else { return nil }
        return ScoringDraft(
            matchID: matchID,
            holeNumber: holeNumber,
            snapshotID: snapshotID,
            snapshotRevision: snapshotRevision,
            permissionRevision: permissionRevision,
            structuralSignature: structuralSignature
        )
    }

    func isDraftCompatible(_ draft: ScoringDraft?) -> Bool {
        guard isEditable, let draft, let matchID else { return false }
        return draft.matchID == matchID &&
            draft.snapshotID == snapshotID &&
            draft.snapshotRevision == snapshotRevision &&
            draft.permissionRevision == permissionRevision &&
            draft.structuralSignature == structuralSignature &&
            canonicalHoleNumbers.contains(draft.holeNumber)
    }

    private func inputRowsForShape(side: ScoringSidePresentation) -> [ScoringInputKey] {
        guard let format else { return [] }
        switch format {
        case .bestBall:
            return side.participants.map { ScoringInputKey(side: side.side, slot: $0.slot) }
        case .scramble:
            return side.participants.isEmpty ? [] : [ScoringInputKey(side: side.side, slot: 1)]
        case .singles:
            guard let participant = side.participants.first else { return [] }
            return [ScoringInputKey(side: side.side, slot: participant.slot)]
        case .unsupported:
            return []
        }
    }
}

enum ScoringInteraction {
    static func displayedGross(
        for row: ScoringInputRowPresentation,
        draft: ScoringDraft?
    ) -> Int? {
        draft?.value(for: row.key) ?? row.officialGross
    }

    static func isEdited(
        row: ScoringInputRowPresentation,
        draft: ScoringDraft?
    ) -> Bool {
        guard let draftValue = draft?.value(for: row.key) else { return false }
        return draftValue != row.officialGross
    }

    static func changing(
        row: ScoringInputRowPresentation,
        by delta: Int,
        in draft: ScoringDraft,
        defaultValue: Int
    ) -> ScoringDraft {
        var updated = draft
        let current = displayedGross(for: row, draft: draft) ?? defaultValue
        let next = min(max(current + delta, ScoringPresentation.minimumGross), ScoringPresentation.maximumGross)
        updated.set(next == row.officialGross ? nil : next, for: row.key)
        return updated
    }
}

enum ScoringNumberFormatter {
    static func string(_ value: Double) -> String {
        guard value.isFinite else { return "—" }
        if value.rounded() == value { return String(Int(value)) }
        return String(format: "%.1f", value)
    }
}

private extension Collection {
    subscript(safe index: Index) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
