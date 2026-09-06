import SwiftUI

/// Repository-backed rendering boundary for the participant Match Game Center.
/// All golf results arrive as canonical server projections; local state is
/// limited to navigation, disclosure, and selected-hole presentation.
struct MatchGameCenterContentView: View {
    let state: MobileReadState<MobileMatchDetailData>
    let requestedMatchID: String
    let onRefresh: @MainActor @Sendable () async -> Void
    let onNavigate: (String) -> Void
    let onBackToMyMatch: (String) -> Void

    @State private var selectedHoleNumber: Int?
    @State private var flowSelection = MatchDetailFlowSelection.overall
    @State private var scorecardExpanded = false
    @State private var presentedMatchID: String?
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        let presentation = MatchDetailPresenter.make(
            state: state,
            requestedMatchID: requestedMatchID
        )
        ScrollViewReader { proxy in
            ScrollView {
                // This is a bounded set of modules for one already-loaded Match.
                // Keep their layout stable when a local hole/flow selection
                // changes a card's height; lazy placement entered a repeated
                // layout transaction on the supported iOS 26.5 runtime.
                VStack(alignment: .leading, spacing: 14) {
                    switch presentation.availability {
                    case .loading:
                        BaggerLoadingState(title: "Match", lineCount: 8)
                            .accessibilityIdentifier("match.gameCenter.loading")
                    case .unavailable:
                        unavailableState
                    case .loadError:
                        loadErrorState
                    case .content:
                        if let tournament = presentation.tournament,
                           let match = presentation.match
                        {
                            MatchGameCenterTournamentMasthead(tournament: tournament)

                            if let banner = presentation.freshnessBanner {
                                MatchGameCenterFreshnessBanner(banner: banner)
                            }

                            MatchGameCenterContext(
                                match: match,
                                onPrevious: match.navigation.previousMatchID.map(navigate),
                                onNext: match.navigation.nextMatchID.map(navigate),
                                onBackToMyMatch: backToMyMatchAction(match)
                            )

                            MatchGameCenterScoreboard(match: match)

                            if match.freshnessText != nil || match.scorecard.state != .unavailable {
                                MatchGameCenterScorecardAction(
                                    match: match,
                                    onOpenScorecard: {
                                        scorecardExpanded = true
                                        if reduceMotion {
                                            proxy.scrollTo("match.gameCenter.scorecard", anchor: .top)
                                        } else {
                                            withAnimation(.easeInOut(duration: BaggerDesign.Motion.standard)) {
                                                proxy.scrollTo("match.gameCenter.scorecard", anchor: .top)
                                            }
                                        }
                                    }
                                )
                            }

                            MatchGameCenterHoleTracker(
                                holes: match.scorecard.holes,
                                teams: match.teams,
                                recordedHoleCount: match.progressHolesPlayed,
                                currentHoleNumber: match.progressCurrentHole,
                                clinchingHoleNumber: match.clinch?.holeNumber,
                                selectedHoleNumber: $selectedHoleNumber
                            )

                            if let selectedHole = match.hole(number: selectedHoleNumber) {
                                MatchGameCenterPolishSelectedHole(hole: selectedHole)
                                    .id("match.gameCenter.selectedHole")
                            }

                            MatchGameCenterPolishFlow(
                                flow: match.flow,
                                teams: match.teams,
                                clinch: match.clinch,
                                selection: $flowSelection
                            )

                            MatchGameCenterGolfScorecard(
                                match: match,
                                isExpanded: $scorecardExpanded
                            )
                            .id("match.gameCenter.scorecard")

                            if match.stats.holesPlayed > 0 {
                                MatchGameCenterPolishStats(
                                    stats: match.stats,
                                    teams: match.teams
                                )
                            } else {
                                Text("Hole results and Match statistics will appear when scoring begins.")
                                    .font(BaggerDesign.Typography.body)
                                    .foregroundStyle(BaggerDesign.Color.textSecondary)
                                    .fixedSize(horizontal: false, vertical: true)
                            }

                            MatchGameCenterCourse(course: match.course)
                        }
                    }

                    if presentation.isRefreshing, presentation.availability == .content {
                        Label("Refreshing Match", systemImage: "arrow.clockwise")
                            .font(BaggerDesign.Typography.captionEmphasis)
                            .foregroundStyle(BaggerDesign.Color.textSecondary)
                            .frame(maxWidth: .infinity, alignment: .center)
                            .padding(.vertical, BaggerDesign.Space.small)
                            .accessibilityIdentifier("match.gameCenter.refreshing")
                    }
                }
                .padding(.horizontal, BaggerDesign.Space.screenInset)
                .padding(.top, 10)
                .padding(.bottom, BaggerDesign.Space.xxxLarge)
            }
            .refreshable(action: onRefresh)
        }
        .background(BaggerDesign.Color.backgroundPrimary.ignoresSafeArea())
        .navigationTitle("Match")
        .navigationBarTitleDisplayMode(.inline)
        .matchGameCenterAcceptanceProbe(
            identifier: "matches.detail",
            label: "Native Match Game Center"
        )
        .overlay(alignment: .topLeading) {
            if BaggerAcceptanceProbes.isEnabled(), let matchID = presentation.match?.matchID {
                Text("Match identity")
                    .font(.system(size: 1))
                    .frame(width: 1, height: 1)
                    .opacity(0.01)
                    .allowsHitTesting(false)
                    .accessibilityIdentifier("matches.detail.\(matchID)")
            }
        }
        .onAppear { reconcileSelection(presentation.match) }
        .onChange(of: presentation.match.map { Data($0.matchID.utf8) }) { _ in
            reconcileSelection(presentation.match)
        }
        .onChange(of: presentation.match?.scorecard.holes) { _ in
            reconcileSelection(presentation.match)
        }
    }

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var unavailableState: some View {
        BaggerErrorState(
            title: "Match isn’t available right now",
            message: "This Match is unavailable for your current tournament access.",
            retryIdentifier: "match.gameCenter.retry"
        ) {
            Task { await onRefresh() }
        }
        .accessibilityIdentifier("match.gameCenter.unavailable")
    }

    private var loadErrorState: some View {
        BaggerErrorState(
            title: "Match details couldn’t load",
            message: "Try again when your connection and tournament access are available.",
            retryIdentifier: "match.gameCenter.loadError.retry"
        ) {
            Task { await onRefresh() }
        }
        .accessibilityIdentifier("match.gameCenter.loadError")
    }

    private func navigate(_ matchID: String) -> () -> Void {
        { onNavigate(matchID) }
    }

    private func backToMyMatchAction(_ match: MatchDetailMatchPresentation) -> (() -> Void)? {
        guard !match.navigation.isMyMatch,
              let myMatchID = match.navigation.myMatchID
        else { return nil }
        return { onBackToMyMatch(myMatchID) }
    }

    private func reconcileSelection(_ match: MatchDetailMatchPresentation?) {
        guard let match else {
            presentedMatchID = nil
            selectedHoleNumber = nil
            flowSelection = .overall
            scorecardExpanded = false
            return
        }

        guard MobileOpaqueMatchID.isEqual(presentedMatchID, match.matchID) else {
            presentedMatchID = match.matchID
            selectedHoleNumber = match.defaultSelectedHoleNumber
            flowSelection = .overall
            scorecardExpanded = false
            return
        }

        if match.hole(number: selectedHoleNumber) != nil { return }
        selectedHoleNumber = match.defaultSelectedHoleNumber
    }
}

private struct MatchGameCenterTournamentMasthead: View {
    let tournament: MatchDetailTournamentPresentation
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: BaggerDesign.Space.small) {
                    tournamentMark
                    tournamentCopy
                }
            } else {
                HStack(alignment: .center, spacing: BaggerDesign.Space.medium) {
                    tournamentMark
                    tournamentCopy
                    Spacer(minLength: 0)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, BaggerDesign.Space.large)
        .padding(.vertical, 10)
        .background(
            LinearGradient(
                colors: [
                    BaggerDesign.Color.surfacePrimary,
                    BaggerDesign.Color.backgroundSecondary.opacity(0.72),
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            in: RoundedRectangle(cornerRadius: BaggerDesign.Radius.hero, style: .continuous)
        )
        .overlay {
            RoundedRectangle(cornerRadius: BaggerDesign.Radius.hero, style: .continuous)
                .stroke(
                    BaggerDesign.Color.borderDefault.opacity(0.38),
                    lineWidth: BaggerDesign.Border.thin
                )
        }
        .accessibilityIdentifier("match.gameCenter.tournament")
    }

    private var tournamentMark: some View {
        BaggerTournamentMark(
            year: tournament.year ?? -1,
            size: .medium,
            accessibility: .decorative
        )
    }

    private var tournamentCopy: some View {
        VStack(alignment: .leading, spacing: BaggerDesign.Space.xSmall) {
            HStack(alignment: .firstTextBaseline, spacing: BaggerDesign.Space.small) {
                BaggerEyebrow(text: tournament.year.map(String.init) ?? "TOURNAMENT")
                Spacer(minLength: BaggerDesign.Space.xSmall)
                Text("PREVIEW")
                    .font(.caption2.weight(.semibold))
                    .tracking(0.65)
                    .foregroundStyle(BaggerDesign.Color.brandEvergreenDeep)
                    .padding(.horizontal, 6)
                    .padding(.vertical, BaggerDesign.Space.hairline)
                    .background(BaggerDesign.Color.brandGoldMuted.opacity(0.64), in: Capsule())
                    .overlay {
                        Capsule().stroke(
                            BaggerDesign.Color.brandGold.opacity(0.66),
                            lineWidth: BaggerDesign.Border.thin
                        )
                    }
                    .fixedSize()
                    .accessibilityLabel("Preview environment")
            }
            Text(tournament.name)
                .font(BaggerDesign.Typography.titlePrimary)
                .foregroundStyle(BaggerDesign.Color.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
            if let location = tournament.location {
                Text(location)
                    .font(BaggerDesign.Typography.captionEmphasis)
                    .foregroundStyle(BaggerDesign.Color.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                    // Give the scaled line box room beyond its intrinsic glyph
                    // bounds; the XXXL audit flagged this masthead location.
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, BaggerDesign.Space.hairline)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

private struct MatchGameCenterFreshnessBanner: View {
    let banner: MatchDetailFreshnessBannerPresentation

    var body: some View {
        BaggerFreshnessBanner(kind: kind, message: banner.message)
            .accessibilityIdentifier("match.gameCenter.freshness")
    }

    private var kind: BaggerFreshnessKind {
        switch banner.kind {
        case .cached: .cached
        case .stale: .stale
        case .offline: .offline
        }
    }
}

private struct MatchGameCenterContext: View {
    let match: MatchDetailMatchPresentation
    let onPrevious: (() -> Void)?
    let onNext: (() -> Void)?
    let onBackToMyMatch: (() -> Void)?
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            BaggerEyebrow(text: match.contextEyebrow)
                .accessibilityIdentifier("match.gameCenter.context.position")

            Text(match.formatName)
                .font(BaggerDesign.Typography.titleSecondary)
                .foregroundStyle(BaggerDesign.Color.textPrimary)
                .fixedSize(horizontal: false, vertical: true)

            if let course = match.course {
                HStack(alignment: .center, spacing: BaggerDesign.Space.small) {
                    BaggerCourseLogo(
                        courseID: course.courseID ?? "",
                        courseName: course.name,
                        size: .medium,
                        accessibility: .decorative
                    )
                    VStack(alignment: .leading, spacing: BaggerDesign.Space.hairline) {
                        Text([course.name, course.tee].compactMap { $0 }.joined(separator: " · "))
                            .font(BaggerDesign.Typography.bodyEmphasis)
                            .foregroundStyle(BaggerDesign.Color.textPrimary)
                            .fixedSize(horizontal: false, vertical: true)
                        if let teeTimeLabel = match.teeTimeLabel {
                            Label(teeTimeLabel, systemImage: "clock")
                                .font(BaggerDesign.Typography.captionEmphasis)
                                .foregroundStyle(BaggerDesign.Color.textSecondary)
                        }
                    }
                }
                .accessibilityElement(children: .combine)
            } else if let teeTimeLabel = match.teeTimeLabel {
                Label(teeTimeLabel, systemImage: "clock")
                    .font(BaggerDesign.Typography.bodyEmphasis)
                    .foregroundStyle(BaggerDesign.Color.textSecondary)
            }

            navigationControls

            if let onBackToMyMatch {
                Button(action: onBackToMyMatch) {
                    Label("Back to My Match", systemImage: "person.crop.circle")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(BaggerSecondaryButtonStyle(expands: true))
                .accessibilityIdentifier("match.gameCenter.backToMyMatch")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(
            BaggerDesign.Color.backgroundSecondary,
            in: RoundedRectangle(cornerRadius: BaggerDesign.Radius.card, style: .continuous)
        )
        .matchGameCenterAcceptanceProbe(
            identifier: "match.gameCenter.context",
            label: [
                match.contextEyebrow,
                match.formatName,
                "Match \(match.navigation.roundMatchIndex) of \(match.navigation.roundMatchCount)",
            ].joined(separator: ", ")
        )
    }

    @ViewBuilder
    private var navigationControls: some View {
        if dynamicTypeSize.isAccessibilitySize {
            VStack(spacing: BaggerDesign.Space.small) {
                positionText
                previousButton
                nextButton
            }
        } else {
            HStack(spacing: BaggerDesign.Space.small) {
                previousButton
                Spacer(minLength: BaggerDesign.Space.small)
                positionText
                Spacer(minLength: BaggerDesign.Space.small)
                nextButton
            }
        }
    }

    private var previousButton: some View {
        Button(action: { onPrevious?() }) {
            Label("Previous", systemImage: "chevron.left")
                .fixedSize(horizontal: true, vertical: false)
        }
        .buttonStyle(BaggerTertiaryButtonStyle())
        .disabled(onPrevious == nil)
        .accessibilityHint(onPrevious == nil ? "First Match in this Round" : "Opens the previous Match in this Round")
        .accessibilityIdentifier("match.gameCenter.previous")
    }

    private var nextButton: some View {
        Button(action: { onNext?() }) {
            Label("Next", systemImage: "chevron.right")
                .labelStyle(.titleAndIcon)
                .fixedSize(horizontal: true, vertical: false)
        }
        .buttonStyle(BaggerTertiaryButtonStyle())
        .disabled(onNext == nil)
        .accessibilityHint(onNext == nil ? "Last Match in this Round" : "Opens the next Match in this Round")
        .accessibilityIdentifier("match.gameCenter.next")
    }

    private var positionText: some View {
        Text("Match \(match.navigation.roundMatchIndex) of \(match.navigation.roundMatchCount)")
            .font(BaggerDesign.Typography.numericCompact)
            .foregroundStyle(BaggerDesign.Color.textSecondary)
            .fixedSize(horizontal: true, vertical: false)
            .accessibilityLabel("Match \(match.navigation.roundMatchIndex) of \(match.navigation.roundMatchCount) in this Round")
    }
}

private struct MatchGameCenterScoreboard: View {
    let match: MatchDetailMatchPresentation
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        VStack(spacing: BaggerDesign.Space.medium) {
            BaggerStatusBadge(kind: match.statusKind)
                .accessibilityLabel("Match status, \(match.status.rawValue)")
                .accessibilityIdentifier("matches.detail.status")

            Text(match.headlineResult)
                .font(BaggerDesign.Typography.displaySection)
                .monospacedDigit()
                .foregroundStyle(BaggerDesign.Color.brandGoldMuted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("match.gameCenter.scoreboard.result")

            if match.status == .live,
               let progress = match.progressStatusText,
               progress != match.headlineResult
            {
                Text(progress)
                    .font(BaggerDesign.Typography.bodyEmphasis)
                    .foregroundStyle(.white.opacity(0.82))
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityLabel("Match progress, \(progress)")
                    .accessibilityIdentifier("match.gameCenter.scoreboard.progress")
            }

            Group {
                if dynamicTypeSize.isAccessibilitySize {
                    VStack(spacing: BaggerDesign.Space.medium) {
                        teamViews
                    }
                } else {
                    HStack(alignment: .top, spacing: 0) {
                        teamViews
                    }
                }
            }
            .matchGameCenterAcceptanceProbe(
                identifier: "matches.detail.sides",
                label: match.teams.map(\.name).joined(separator: " versus ")
            )
        }
        .frame(maxWidth: .infinity)
        .padding(BaggerDesign.Space.large)
        .background(
            LinearGradient(
                colors: [BaggerDesign.Color.brandEvergreenDeep, BaggerDesign.Color.brandAction],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            in: RoundedRectangle(cornerRadius: BaggerDesign.Radius.hero, style: .continuous)
        )
        .overlay {
            RoundedRectangle(cornerRadius: BaggerDesign.Radius.hero, style: .continuous)
                .stroke(BaggerDesign.Color.brandGold.opacity(0.62), lineWidth: BaggerDesign.Border.thin)
        }
        .shadow(
            color: BaggerDesign.Color.brandEvergreenDeep.opacity(0.15),
            radius: 13,
            y: 7
        )
        .matchGameCenterAcceptanceProbe(
            identifier: "match.gameCenter.scoreboard",
            label: "Match scoreboard, \(match.status.rawValue), \(match.headlineResult)"
        )
        .overlay(alignment: .topLeading) {
            if BaggerAcceptanceProbes.isEnabled() {
                Text("Legacy Match state")
                    .font(.system(size: 1))
                    .frame(width: 1, height: 1)
                    .opacity(0.01)
                    .allowsHitTesting(false)
                    .accessibilityIdentifier(
                        match.status == .final ? "matches.detail.result" : "matches.detail.progress"
                    )
            }
        }
    }

    @ViewBuilder
    private var teamViews: some View {
        ForEach(Array(match.teams.enumerated()), id: \.element.id) { index, team in
            if index > 0 {
                Text(dynamicTypeSize.isAccessibilitySize ? "VERSUS" : "VS")
                    .font(.caption.weight(.black))
                    .foregroundStyle(BaggerDesign.Color.brandGoldMuted)
                    .frame(width: dynamicTypeSize.isAccessibilitySize ? nil : 38)
                    .padding(.top, dynamicTypeSize.isAccessibilitySize ? 0 : 34)
                    .accessibilityHidden(true)
            }
            MatchGameCenterScoreboardTeam(
                team: team,
                isAuthenticatedSide: team.side == match.authenticatedPlayerSide
            )
            .frame(maxWidth: .infinity, alignment: .top)
        }
    }
}

private struct MatchGameCenterScoreboardTeam: View {
    let team: MatchDetailTeamPresentation
    let isAuthenticatedSide: Bool

    var body: some View {
        VStack(spacing: BaggerDesign.Space.small) {
            BaggerTeamLogo(
                teamID: team.teamID,
                teamName: team.name,
                size: .large,
                accessibility: .decorative
            )

            Text(team.name.uppercased())
                .font(.caption.weight(.bold))
                .tracking(0.6)
                .foregroundStyle(.white.opacity(0.82))
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .overlay(alignment: .trailing) {
                    if isAuthenticatedSide {
                        Image(systemName: "person.fill")
                            .font(.caption2)
                            .foregroundStyle(BaggerDesign.Color.brandGoldMuted)
                            .offset(x: BaggerDesign.Space.large)
                            .accessibilityLabel("Your team")
                    }
                }

            ForEach(team.players) { player in
                VStack(spacing: BaggerDesign.Space.hairline) {
                    Text(player.displayName)
                        .font(.subheadline.weight(player.isAuthenticatedPlayer ? .bold : .medium))
                        .foregroundStyle(.white)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                    if let context = player.golfContext, let text = context.compactText {
                        Text(text)
                            .font(.caption)
                            .foregroundStyle(.white.opacity(0.76))
                            .multilineTextAlignment(.center)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityLabel(context.accessibilityText ?? text)
                    }
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel(playerAccessibilityLabel(player))
            }

            if let context = team.golfContext, let text = context.compactText {
                Text(text)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white.opacity(0.78))
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityLabel(context.accessibilityText ?? text)
            }
        }
        .multilineTextAlignment(.center)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(teamAccessibilityLabel)
        .accessibilityIdentifier("match.gameCenter.scoreboard.team.\(team.side)")
    }

    private func playerAccessibilityLabel(_ player: MatchDetailPlayerPresentation) -> String {
        [
            player.displayName,
            player.isAuthenticatedPlayer ? "you" : nil,
            player.golfContext?.accessibilityText,
        ]
        .compactMap { $0 }
        .joined(separator: ", ")
    }

    private var teamAccessibilityLabel: String {
        var parts = [team.name]
        if isAuthenticatedSide { parts.append("your team") }
        parts.append(contentsOf: team.players.map(playerAccessibilityLabel))
        if let context = team.golfContext?.accessibilityText { parts.append(context) }
        return parts.joined(separator: ", ")
    }
}

private struct MatchGameCenterScorecardAction: View {
    let match: MatchDetailMatchPresentation
    let onOpenScorecard: () -> Void
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: BaggerDesign.Space.small) {
                    freshness
                    scorecardButton
                }
            } else {
                HStack(spacing: BaggerDesign.Space.medium) {
                    freshness
                    Spacer(minLength: BaggerDesign.Space.small)
                    scorecardButton
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, BaggerDesign.Space.medium)
        .padding(.vertical, BaggerDesign.Space.xSmall)
        .background(
            BaggerDesign.Color.brandGoldMuted.opacity(0.16),
            in: RoundedRectangle(cornerRadius: BaggerDesign.Radius.control, style: .continuous)
        )
        .matchGameCenterAcceptanceProbe(
            identifier: "match.gameCenter.scorecardAction",
            label: "Scorecard and Match freshness actions"
        )
    }

    @ViewBuilder
    private var freshness: some View {
        if let freshnessText = match.freshnessText {
            Label(freshnessText, systemImage: "clock.arrow.circlepath")
                .font(BaggerDesign.Typography.captionEmphasis)
                .foregroundStyle(BaggerDesign.Color.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    @ViewBuilder
    private var scorecardButton: some View {
        if match.scorecard.state != .unavailable {
            Button(action: onOpenScorecard) {
                Label(
                    match.status == .final ? "View Final Scorecard" : "View Scorecard",
                    systemImage: "list.bullet.rectangle"
                )
            }
            .buttonStyle(BaggerTertiaryButtonStyle())
            .accessibilityHint("Expands the native Hole-by-Hole Scorecard")
            .accessibilityIdentifier("match.gameCenter.scorecardAction.open")
        }
    }
}

private struct MatchGameCenterHoleTracker: View {
    let holes: [MatchDetailHolePresentation]
    let teams: [MatchDetailTeamPresentation]
    let recordedHoleCount: Int
    let currentHoleNumber: Int
    let clinchingHoleNumber: Int?
    @Binding var selectedHoleNumber: Int?
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        VStack(alignment: .leading, spacing: BaggerDesign.Space.headingToContent) {
            BaggerSectionHeader(
                "Hole Tracker",
                subtitle: "\(recordedHoleCount) of 18 recorded. Choose any hole for its details."
            )

            trackerGrid

            if currentHoleNumber > 0 || clinchingHoleNumber != nil {
                VStack(alignment: .leading, spacing: BaggerDesign.Space.xSmall) {
                    if currentHoleNumber > 0 {
                        Label("Current: Hole \(currentHoleNumber)", systemImage: "circle.fill")
                    }
                    if let clinchingHoleNumber {
                        Label("Clinching hole: \(clinchingHoleNumber)", systemImage: "flag.checkered")
                    }
                }
                .font(BaggerDesign.Typography.captionEmphasis)
                .foregroundStyle(BaggerDesign.Color.textSecondary)
                .accessibilityElement(children: .combine)
            }
        }
        .matchGameCenterAcceptanceProbe(
            identifier: "match.gameCenter.holeTracker",
            label: "Hole Tracker"
        )
    }

    @ViewBuilder
    private var trackerGrid: some View {
        MatchGameCenterHoleLayout(
            accessibilityColumns: dynamicTypeSize.isAccessibilitySize ? 3 : nil,
            rowSpacing: BaggerDesign.Space.xSmall
        ) {
            ForEach(holes) { hole in
                holeButton(hole)
            }
        }
        // Nine independent 44-point targets require 396 points. Only this compact
        // control receives the full phone width; its heading retains screen inset.
        .padding(
            .horizontal,
            dynamicTypeSize.isAccessibilitySize ? 0 : -BaggerDesign.Space.screenInset
        )
    }

    private func holeButton(_ hole: MatchDetailHolePresentation) -> some View {
        Button {
            selectedHoleNumber = hole.holeNumber
        } label: {
            Group {
                if dynamicTypeSize.isAccessibilitySize {
                    // The backplate follows the two scaled text lines. A fixed
                    // circle would leave white winner labels outside its fill.
                    holeLabel(hole)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(BaggerDesign.Space.small)
                        .frame(maxWidth: .infinity, minHeight: BaggerDesign.Size.minimumTouchTarget)
                        .background {
                            holeBackplate(
                                RoundedRectangle(cornerRadius: BaggerDesign.Radius.control, style: .continuous),
                                hole: hole
                            )
                        }
                        .padding(.horizontal, BaggerDesign.Space.xSmall)
                } else {
                    ZStack {
                        holeBackplate(Circle(), hole: hole)
                            .frame(width: 40, height: 40)
                        holeLabel(hole)
                    }
                }
            }
            .frame(
                maxWidth: .infinity,
                minHeight: BaggerDesign.Size.minimumTouchTarget
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(
            hole.accessibilityLabel(
                teams: teams,
                selected: selectedHoleNumber == hole.holeNumber,
                current: currentHoleNumber == hole.holeNumber,
                clinching: clinchingHoleNumber == hole.holeNumber
            )
        )
        .accessibilityAddTraits(selectedHoleNumber == hole.holeNumber ? .isSelected : [])
        .accessibilityIdentifier("match.gameCenter.hole.\(hole.holeNumber)")
    }

    private func holeLabel(_ hole: MatchDetailHolePresentation) -> some View {
        VStack(spacing: BaggerDesign.Space.hairline) {
            Text(String(hole.holeNumber))
                .font(.caption2.weight(.bold))
                .monospacedDigit()
            Text(outcomeToken(hole))
                .font(.caption2.weight(.black))
                .lineLimit(1)
                .minimumScaleFactor(dynamicTypeSize.isAccessibilitySize ? 1 : 0.6)
        }
        .foregroundStyle(foreground(hole))
    }

    private func holeBackplate<Plate: Shape>(_ plate: Plate, hole: MatchDetailHolePresentation) -> some View {
        plate.fill(background(hole))
            .overlay {
                plate.stroke(
                    selectedHoleNumber == hole.holeNumber
                        ? BaggerDesign.Color.brandGold
                        : BaggerDesign.Color.borderDefault.opacity(0.72),
                    lineWidth: selectedHoleNumber == hole.holeNumber
                        ? BaggerDesign.Border.strong
                        : BaggerDesign.Border.thin
                )
            }
            .overlay(alignment: .topLeading) {
                if hole.holeNumber == currentHoleNumber {
                    Image(systemName: "circle.fill")
                        .font(.system(size: 6, weight: .bold))
                        .foregroundStyle(BaggerDesign.Color.brandEvergreenDeep)
                        .frame(width: 12, height: 12)
                        .background(.white, in: Circle())
                        .accessibilityHidden(true)
                }
            }
            .overlay(alignment: .topTrailing) {
                if hole.holeNumber == clinchingHoleNumber {
                    Image(systemName: "flag.checkered")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(BaggerDesign.Color.brandEvergreenDeep)
                        .frame(width: 16, height: 16)
                        .background(BaggerDesign.Color.brandGoldMuted, in: Circle())
                        .accessibilityHidden(true)
                }
            }
    }

    private func outcomeToken(_ hole: MatchDetailHolePresentation) -> String {
        switch hole.outcome {
        case .unplayed: "—"
        case .halved: "½"
        case .sideOne:
            BaggerInitials.make(from: teams.first(where: { $0.side == 1 })?.name ?? "Team 1")
        case .sideTwo:
            BaggerInitials.make(from: teams.first(where: { $0.side == 2 })?.name ?? "Team 2")
        }
    }

    private func background(_ hole: MatchDetailHolePresentation) -> Color {
        switch hole.outcome {
        case .unplayed: BaggerDesign.Color.surfaceMuted
        case .halved: BaggerDesign.Color.surfaceElevated
        case .sideOne: BaggerDesign.Color.brandEvergreen
        case .sideTwo: BaggerDesign.Color.brandGoldMuted
        }
    }

    private func foreground(_ hole: MatchDetailHolePresentation) -> Color {
        switch hole.outcome {
        case .sideOne: .white
        case .unplayed, .halved, .sideTwo: BaggerDesign.Color.brandEvergreenDeep
        }
    }
}

/// Phone-first tracker layout that preserves the preferred 9-by-2 presentation
/// whenever nine independent 44-point targets fit. Narrower phones use a balanced
/// six-column fallback; accessibility sizes use the requested three columns.
private struct MatchGameCenterHoleLayout: Layout {
    let accessibilityColumns: Int?
    let rowSpacing: CGFloat

    func sizeThatFits(
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout ()
    ) -> CGSize {
        let width = proposal.width ?? minimumWidth(for: accessibilityColumns ?? 9)
        let metrics = metrics(width: width, subviews: subviews)
        return CGSize(width: width, height: metrics.totalHeight)
    }

    func placeSubviews(
        in bounds: CGRect,
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout ()
    ) {
        let metrics = metrics(width: bounds.width, subviews: subviews)
        var rowOriginY = bounds.minY

        for row in 0..<metrics.rowHeights.count {
            let start = row * metrics.columnCount
            let end = min(start + metrics.columnCount, subviews.count)
            for index in start..<end {
                let column = index - start
                subviews[index].place(
                    at: CGPoint(
                        x: bounds.minX + (CGFloat(column) * metrics.cellWidth),
                        y: rowOriginY
                    ),
                    anchor: .topLeading,
                    proposal: ProposedViewSize(
                        width: metrics.cellWidth,
                        height: metrics.rowHeights[row]
                    )
                )
            }
            rowOriginY += metrics.rowHeights[row] + rowSpacing
        }
    }

    private func metrics(width: CGFloat, subviews: Subviews) -> Metrics {
        let columnCount = resolvedColumnCount(width: width)
        let cellWidth = width / CGFloat(columnCount)
        let rowCount = Int(ceil(Double(subviews.count) / Double(columnCount)))
        let rowHeights = (0..<rowCount).map { row in
            let start = row * columnCount
            let end = min(start + columnCount, subviews.count)
            return (start..<end).reduce(BaggerDesign.Size.minimumTouchTarget) { height, index in
                max(
                    height,
                    subviews[index].sizeThatFits(
                        ProposedViewSize(width: cellWidth, height: nil)
                    ).height
                )
            }
        }
        let spacing = rowSpacing * CGFloat(max(0, rowCount - 1))
        return Metrics(
            columnCount: columnCount,
            cellWidth: cellWidth,
            rowHeights: rowHeights,
            totalHeight: rowHeights.reduce(0, +) + spacing
        )
    }

    private func resolvedColumnCount(width: CGFloat) -> Int {
        if let accessibilityColumns { return accessibilityColumns }
        if width >= minimumWidth(for: 9) { return 9 }
        return max(3, min(6, Int(width / BaggerDesign.Size.minimumTouchTarget)))
    }

    private func minimumWidth(for columns: Int) -> CGFloat {
        BaggerDesign.Size.minimumTouchTarget * CGFloat(columns)
    }

    private struct Metrics {
        let columnCount: Int
        let cellWidth: CGFloat
        let rowHeights: [CGFloat]
        let totalHeight: CGFloat
    }
}

private struct MatchGameCenterCourse: View {
    let course: MatchDetailCoursePresentation?
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        VStack(alignment: .leading, spacing: BaggerDesign.Space.headingToContent) {
            BaggerSectionHeading("Course Information")
            if let course {
                VStack(alignment: .leading, spacing: BaggerDesign.Space.medium) {
                    HStack(alignment: .center, spacing: BaggerDesign.Space.medium) {
                        BaggerCourseLogo(
                            courseID: course.courseID ?? "",
                            courseName: course.name,
                            size: .large,
                            accessibility: .decorative
                        )
                        VStack(alignment: .leading, spacing: BaggerDesign.Space.xSmall) {
                            Text(course.name)
                                .font(BaggerDesign.Typography.titleSecondary)
                                .foregroundStyle(BaggerDesign.Color.textPrimary)
                                .fixedSize(horizontal: false, vertical: true)
                            if let tee = course.tee {
                                Text(MatchGameCenterFormatter.tees(tee))
                                    .font(BaggerDesign.Typography.bodyEmphasis)
                                    .foregroundStyle(BaggerDesign.Color.textSecondary)
                            }
                        }
                    }

                    let metrics = courseMetrics(course)
                    if !metrics.isEmpty {
                        LazyVGrid(columns: columns, spacing: BaggerDesign.Space.medium) {
                            ForEach(metrics, id: \.label) { metric in
                                VStack(alignment: .leading, spacing: BaggerDesign.Space.xSmall) {
                                    Text(metric.label)
                                        .font(BaggerDesign.Typography.captionEmphasis)
                                        .foregroundStyle(BaggerDesign.Color.textSecondary)
                                    Text(metric.value)
                                        .font(BaggerDesign.Typography.statMedium)
                                        .foregroundStyle(BaggerDesign.Color.textPrimary)
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .accessibilityElement(children: .combine)
                                .accessibilityIdentifier("match.gameCenter.course.metric.\(metric.label.lowercased())")
                            }
                        }
                    }
                }
                .baggerCard(style: .muted)
            } else {
                BaggerEmptyState(
                    title: "Course information unavailable",
                    message: "This Match does not include a published course snapshot.",
                    systemImage: "flag"
                )
            }
        }
        .accessibilityIdentifier("match.gameCenter.course")
    }

    private var columns: [GridItem] {
        Array(
            repeating: GridItem(.flexible(), alignment: .topLeading),
            count: dynamicTypeSize.isAccessibilitySize ? 1 : 2
        )
    }

    private func courseMetrics(_ course: MatchDetailCoursePresentation) -> [(label: String, value: String)] {
        [
            course.yardage.map { ("Yardage", "\(MatchGameCenterFormatter.integer($0)) yards") },
            course.par.map { ("Par", MatchGameCenterFormatter.number($0)) },
            course.rating.map { ("Rating", MatchGameCenterFormatter.number($0)) },
            course.slope.map { ("Slope", String($0)) },
        ].compactMap { $0 }
    }
}

enum MatchGameCenterFormatter {
    static func score(_ value: Int?) -> String {
        value.map(String.init) ?? "—"
    }

    static func accessibilityScore(_ value: Int?, label: String) -> String {
        value.map { "\(label) \($0)" } ?? "\(label) unavailable"
    }

    static func accessibilityStrokes(_ value: Int?) -> String {
        guard let value else { return "applied strokes unavailable" }
        if value == 0 { return "no applied strokes" }
        return "\(value) applied \(value == 1 ? "stroke" : "strokes")"
    }

    static func integer(_ value: Int) -> String {
        value.formatted(.number.grouping(.automatic))
    }

    static func number(_ value: Double) -> String {
        // Preserve the decoded canonical rating/par value. A fixed decimal
        // precision would silently round valid Match-time course snapshots.
        let text = String(value)
        return text.hasSuffix(".0") ? String(text.dropLast(2)) : text
    }

    static func tees(_ value: String) -> String {
        value.localizedCaseInsensitiveContains("tee") ? value : "\(value) Tees"
    }
}

extension View {
    func matchGameCenterAcceptanceProbe(identifier: String, label: String) -> some View {
        overlay(alignment: .topLeading) {
            if BaggerAcceptanceProbes.isEnabled() {
                Text(label)
                    .font(.system(size: 1))
                    .frame(width: 1, height: 1)
                    .opacity(0.01)
                    .allowsHitTesting(false)
                    .accessibilityIdentifier(identifier)
            }
        }
    }
}
