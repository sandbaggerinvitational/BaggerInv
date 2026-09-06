import SwiftUI

/// Optional protected /matches display context from the same coordinator. It
/// never enters the scoring presentation/draft or any write/finalization gate.
struct ScoreMatchDisplayContext: Equatable {
    let match: MobileMatchesMatch
    let isCached: Bool

    static func make(state: MobileReadState<MobileMatchesData>, scoring: MobileScoringCurrent?) -> Self? {
        guard let scoring, let match = state.value?.matches.first(where: {
            MobileOpaqueMatchID.isEqual($0.matchId, scoring.match.matchId)
        }), match.authenticatedPlayer.involved,
        match.teams.count == scoring.sides.count else { return nil }
        for (listed, side) in zip(match.teams, scoring.sides) {
            guard listed.side == side.side, listed.teamId == side.teamId,
                  listed.participants.map(\.playerId) == side.participants.map(\.playerId),
                  listed.participants.filter(\.isAuthenticatedPlayer).map(\.playerId) == side.participants.filter(\.isAuthenticatedPlayer).map(\.playerId)
            else { return nil }
        }
        return Self(match: match, isCached: state.freshness != .fresh || state.lastSafeError != nil)
    }

    func teamContext(side: Int) -> String? {
        guard let team = match.teams.first(where: { $0.side == side }) else { return nil }
        return MatchesGolfContextPresentation(scope: .team, playingHandicap: team.playingHandicap,
                                               strokesReceived: team.strokesReceived).compactText
    }
}

private struct ScoreMatchDisplayKey: EnvironmentKey {
    static let defaultValue: ScoreMatchDisplayContext? = nil
}

extension EnvironmentValues {
    var scoreMatchDisplay: ScoreMatchDisplayContext? {
        get { self[ScoreMatchDisplayKey.self] }
        set { self[ScoreMatchDisplayKey.self] = newValue }
    }
}
