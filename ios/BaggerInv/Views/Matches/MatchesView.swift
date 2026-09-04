import SwiftUI

struct MatchesRepositoryDiagnostics: Equatable, Sendable {
    let summary: String

    init(state: MobileReadState<MobileMatchesData>) {
        let availability = state.value == nil ? "no content" : "content"
        let source: String
        switch state.source {
        case .diskCache: source = "cache"
        case .network: source = "network"
        case nil: source = "none"
        }
        let validation = state.validatedAt.map { String(Int($0.timeIntervalSince1970 * 1_000)) } ?? "missing"
        summary = "\(availability); freshness \(state.freshness.rawValue); source \(source); revision \(state.revision == nil ? "missing" : "present"); validated \(validation)"
    }
}

struct MatchesRepositoryView: View {
    let participant: ParticipantSession
    @ObservedObject private var matches: MobileReadRepository<MobileMatchesResponse>
    @State private var selectedRoundID: MatchesRoundID?

    init(
        participant: ParticipantSession,
        repository: MobileReadRepository<MobileMatchesResponse>
    ) {
        self.participant = participant
        _matches = ObservedObject(wrappedValue: repository)
    }

    var body: some View {
        MatchesScreen(
            presentation: MatchesPresenter.make(
                participant: participant,
                state: matches.state,
                selectedRoundID: selectedRoundID
            ),
            selectedRoundID: $selectedRoundID,
            diagnostics: BaggerAcceptanceProbes.isEnabled()
                ? MatchesRepositoryDiagnostics(state: matches.state)
                : nil,
            onRefresh: { await matches.refresh() }
        )
    }
}

struct MatchesFixtureView: View {
    let participant: ParticipantSession
    let state: MobileReadState<MobileMatchesData>
    @State private var selectedRoundID: MatchesRoundID?

    var body: some View {
        MatchesScreen(
            presentation: MatchesPresenter.make(
                participant: participant,
                state: state,
                selectedRoundID: selectedRoundID
            ),
            selectedRoundID: $selectedRoundID,
            onRefresh: {}
        )
    }
}

struct MatchesScreen: View {
    let presentation: MatchesPresentation
    @Binding var selectedRoundID: MatchesRoundID?
    var diagnostics: MatchesRepositoryDiagnostics?
    let onRefresh: @MainActor @Sendable () async -> Void

    @State private var selectedTournamentID: String?

    init(
        presentation: MatchesPresentation,
        selectedRoundID: Binding<MatchesRoundID?>,
        diagnostics: MatchesRepositoryDiagnostics? = nil,
        onRefresh: @escaping @MainActor @Sendable () async -> Void
    ) {
        self.presentation = presentation
        _selectedRoundID = selectedRoundID
        self.diagnostics = diagnostics
        self.onRefresh = onRefresh
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: BaggerLayout.sectionSpacing) {
                tournamentMasthead

                if let banner = presentation.freshnessBanner {
                    MatchesFreshnessBannerView(banner: banner)
                }

                switch presentation.availability {
                case .loading:
                    MatchesLoadingState()
                case .empty:
                    MatchesEmptyState()
                case .unavailable:
                    MatchesUnavailableState(onRetry: onRefresh)
                case .content:
                    content
                }

                if presentation.isRefreshing, presentation.availability == .content {
                    HStack(spacing: 8) {
                        ProgressView()
                        Text("Refreshing matches")
                            .font(.footnote.weight(.semibold))
                    }
                    .foregroundStyle(BaggerPalette.muted)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .accessibilityElement(children: .combine)
                }
            }
            .padding(.horizontal, BaggerLayout.pageInset)
            .padding(.top, 12)
            .padding(.bottom, 28)
        }
        .background(BaggerPalette.canvas.ignoresSafeArea())
        .refreshable(action: onRefresh)
        .accessibilityIdentifier("matches.screen")
        .matchesReadDiagnostic(diagnostics?.summary)
        .navigationDestination(for: MatchesDestination.self) { destination in
            if let match = presentation.match(for: destination) {
                MatchDetailView(match: match)
            } else {
                MatchDetailUnavailableView()
            }
        }
        .onAppear(perform: reconcileSelection)
        .onChange(of: presentation.tournamentID) { _ in reconcileSelection() }
        .onChange(of: presentation.selectedRoundID) { _ in reconcileSelection() }
    }

    @ViewBuilder
    private var content: some View {
        MatchesRoundSelector(
            rounds: presentation.rounds,
            selectedRound: presentation.selectedRound,
            selection: Binding(
                get: { presentation.selectedRoundID },
                set: { selectedRoundID = $0 }
            )
        )

        if let round = presentation.selectedRound {
            YourMatchSection(round: round)

            AllMatchesSection(round: round)
        }
    }

    private var tournamentMasthead: some View {
        MatchesTournamentMasthead(
            name: presentation.tournamentName,
            year: presentation.tournamentYear
        )
    }

    private func reconcileSelection() {
        if selectedTournamentID != presentation.tournamentID {
            selectedTournamentID = presentation.tournamentID
            selectedRoundID = presentation.defaultRoundID
            return
        }
        let resolved = presentation.resolvedRoundID(preferred: selectedRoundID)
        if selectedRoundID != resolved {
            selectedRoundID = resolved
        }
    }
}

private struct MatchesRoundSelector: View {
    let rounds: [MatchesRoundPresentation]
    let selectedRound: MatchesRoundPresentation?
    @Binding var selection: MatchesRoundID?

    var body: some View {
        VStack(alignment: .leading, spacing: BaggerDesign.Space.small) {
            BaggerSectionHeading(selectedRound?.contextTitle ?? "Rounds")
                .accessibilityIdentifier("matches.roundContext")
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(rounds) { round in
                        Button {
                            selection = round.id
                        } label: {
                            Text(roundSelectorTitle(round))
                                .font(.subheadline.weight(.bold))
                                .foregroundStyle(selection == round.id ? Color.white : BaggerPalette.deepEvergreen)
                                .fixedSize(horizontal: true, vertical: false)
                                .padding(.horizontal, 15)
                                .frame(minHeight: 44)
                                .background(
                                    selection == round.id ? BaggerPalette.evergreen : BaggerPalette.paper,
                                    in: Capsule()
                                )
                                .overlay {
                                    Capsule()
                                        .stroke(
                                            selection == round.id ? BaggerPalette.gold : BaggerPalette.warmBorder,
                                            lineWidth: selection == round.id ? 2 : 1
                                        )
                                }
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(round.title)
                        .accessibilityAddTraits(selection == round.id ? .isSelected : [])
                        .accessibilityIdentifier("matches.round.\(round.id.accessibilityComponent)")
                    }
                }
                .padding(.vertical, 2)
            }
            .accessibilityIdentifier("matches.roundSelector")
        }
    }

    private func roundSelectorTitle(_ round: MatchesRoundPresentation) -> String {
        if let number = round.id.number { return "Round \(number)" }
        return round.title
    }
}

private struct MatchesTournamentMasthead: View {
    let name: String
    let year: Int?
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
        .padding(.vertical, BaggerDesign.Space.medium)
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
        .accessibilityIdentifier("matches.tournamentMasthead")
    }

    private var tournamentMark: some View {
        BaggerTournamentMark(
            year: year ?? -1,
            size: .medium,
            accessibility: .decorative
        )
        .accessibilityIdentifier("matches.tournamentMark")
    }

    private var tournamentCopy: some View {
        VStack(alignment: .leading, spacing: BaggerDesign.Space.xSmall) {
            HStack(alignment: .firstTextBaseline, spacing: BaggerDesign.Space.small) {
                BaggerEyebrow(text: year.map(String.init) ?? "TOURNAMENT")
                Spacer(minLength: BaggerDesign.Space.xSmall)
                MatchesPreviewIndicator()
            }
            Text(name.isEmpty ? "Bagger Invitational" : name)
                .font(BaggerDesign.Typography.titlePrimary)
                .foregroundStyle(BaggerDesign.Color.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

private struct MatchesPreviewIndicator: View {
    var body: some View {
        Text("PREVIEW")
            .font(.caption2.weight(.semibold))
            .dynamicTypeSize(...DynamicTypeSize.accessibility1)
            .tracking(0.65)
            .foregroundStyle(BaggerDesign.Color.brandEvergreenDeep)
            .padding(.horizontal, 6)
            .padding(.vertical, BaggerDesign.Space.hairline)
            .background(BaggerDesign.Color.brandGoldMuted.opacity(0.64), in: Capsule())
            .overlay {
                Capsule()
                    .stroke(BaggerDesign.Color.brandGold.opacity(0.66), lineWidth: BaggerDesign.Border.thin)
            }
            .fixedSize()
            .accessibilityLabel("Preview environment")
            .accessibilityIdentifier("matches.preview")
    }
}

private struct YourMatchSection: View {
    let round: MatchesRoundPresentation

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            BaggerSectionHeading("Your Match")
            if let match = round.yourMatch {
                NavigationLink(value: MatchesDestination.match(matchID: match.matchID)) {
                    YourMatchHero(match: match)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("matches.hero")
                .accessibilityHint("Opens Match Detail")
            } else {
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: "person.2")
                        .foregroundStyle(BaggerPalette.goldText)
                        .frame(width: 32, height: 32)
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 4) {
                        Text("No match for you in this Round")
                            .font(.headline)
                            .foregroundStyle(BaggerPalette.ink)
                        Text("All participant-visible Matches for \(round.title) remain available below.")
                            .font(.subheadline)
                            .foregroundStyle(BaggerPalette.muted)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .baggerCard()
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("matches.hero.empty")
            }
        }
    }
}

private struct YourMatchHero: View {
    let match: MatchesMatchPresentation
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            header

            if let own = match.ownSide, let opponent = match.opponentSide {
                MatchesHeroSides(
                    sides: [own, opponent],
                    ownedSide: own.side
                )
            }

            MatchesHeroContext(match: match)

            if let stateText = match.resultText ?? match.progressText {
                Label(
                    stateText,
                    systemImage: match.status == .final ? "checkmark.seal.fill" : "flag.fill"
                )
                .font(.headline)
                .foregroundStyle(match.status == .live ? BaggerPalette.liveRed : BaggerPalette.actionGreen)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
                .background(BaggerPalette.evergreen.opacity(0.09), in: RoundedRectangle(cornerRadius: 12))
            }

            HStack {
                Spacer()
                HStack(spacing: BaggerDesign.Space.xSmall) {
                    Text("View Match Details")
                        .accessibilityIdentifier("matches.hero.cta")
                    Image(systemName: "chevron.right")
                        .accessibilityHidden(true)
                }
                .font(.footnote.weight(.bold))
                .foregroundStyle(BaggerPalette.actionGreen)
                .accessibilityElement(children: .contain)
            }
        }
        .baggerCard(border: BaggerPalette.gold)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Your match, \(match.accessibilitySummary)")
        .accessibilityIdentifier("matches.hero.\(match.matchID)")
    }

    @ViewBuilder
    private var header: some View {
        if dynamicTypeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: 10) {
                headerCopy
                MatchesIndexStatusBadge(status: match.status)
                    .accessibilityIdentifier("matches.hero.\(match.matchID).status")
            }
        } else {
            HStack(alignment: .top, spacing: 10) {
                headerCopy
                Spacer(minLength: 4)
                MatchesIndexStatusBadge(status: match.status)
                    .accessibilityIdentifier("matches.hero.\(match.matchID).status")
            }
        }
    }

    private var headerCopy: some View {
        VStack(alignment: .leading, spacing: 4) {
            BaggerEyebrow(text: match.displayMatchNumber.map { "Your Match · Match \($0)" } ?? "Your Match")
                .accessibilityIdentifier("matches.hero.\(match.matchID).matchNumber")
            Text(match.contextTitle)
                .font(.system(.title3, design: .serif, weight: .bold))
                .foregroundStyle(BaggerPalette.ink)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

private struct AllMatchesSection: View {
    let round: MatchesRoundPresentation

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            BaggerSectionHeading("All Matches")
                .accessibilityIdentifier("matches.allMatches")
            VStack(spacing: 0) {
                ForEach(Array(round.matches.enumerated()), id: \.element.id) { index, match in
                    NavigationLink(value: MatchesDestination.match(matchID: match.matchID)) {
                        CompactMatchRow(
                            match: match,
                            showsFormat: round.showsPerMatchFormat
                        )
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("matches.card.\(match.matchID)")
                    .accessibilityLabel(
                        match.accessibilitySummary(includeFormat: round.showsPerMatchFormat)
                    )
                    .accessibilityHint("Opens Match Detail")

                    if index < round.matches.count - 1 {
                        Divider()
                            .overlay(BaggerDesign.Color.borderStrong.opacity(0.72))
                            .padding(.horizontal, BaggerDesign.Space.small)
                            .padding(.vertical, BaggerDesign.Space.hairline)
                    }
                }
            }
            .baggerCard()
        }
    }
}

private struct CompactMatchRow: View {
    let match: MatchesMatchPresentation
    let showsFormat: Bool
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        HStack(alignment: .center, spacing: BaggerDesign.Space.small) {
            VStack(alignment: .leading, spacing: 0) {
                header

                CompactMatchSides(sides: match.teams, matchID: match.matchID)
                    .padding(.top, BaggerDesign.Space.small)

                if let course = match.courseAndTeeText {
                    HStack(alignment: .center, spacing: BaggerDesign.Space.small) {
                        BaggerCourseLogo(
                            courseID: match.courseID ?? "",
                            courseName: match.courseName ?? "Course",
                            size: .small,
                            accessibility: .decorative
                        )
                        .scaleEffect(0.75)
                        .frame(width: 24, height: 24)
                        Text(course)
                            .font(.caption)
                            .foregroundStyle(BaggerPalette.muted)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                    }
                    .padding(.top, BaggerDesign.Space.medium)
                    .accessibilityIdentifier("matches.card.\(match.matchID).course")
                }

                if let state = match.resultText ?? match.progressText {
                    Text(state)
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(match.status == .live ? BaggerPalette.liveRed : BaggerPalette.actionGreen)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(
                            .top,
                            match.courseAndTeeText == nil
                                ? BaggerDesign.Space.medium
                                : BaggerDesign.Space.small
                        )
                        .accessibilityIdentifier("matches.card.\(match.matchID).result")
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            rowChevron
        }
        .padding(.horizontal, BaggerDesign.Space.small)
        .padding(.vertical, BaggerDesign.Space.medium)
        .background(
            match.authenticatedPlayerInvolved
                ? BaggerDesign.Color.surfaceMuted.opacity(0.74)
                : Color.clear,
            in: RoundedRectangle(cornerRadius: BaggerDesign.Radius.control, style: .continuous)
        )
        .overlay(alignment: .leading) {
            if match.authenticatedPlayerInvolved {
                Capsule()
                    .fill(BaggerDesign.Color.brandGold)
                    .frame(width: 3)
                    .padding(.vertical, BaggerDesign.Space.small)
                    .accessibilityHidden(true)
            }
        }
        .contentShape(Rectangle())
    }

    @ViewBuilder
    private var header: some View {
        if dynamicTypeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: 8) {
                headerCopy
                MatchesIndexStatusBadge(status: match.status)
                    .accessibilityIdentifier("matches.card.\(match.matchID).status")
            }
        } else {
            HStack(alignment: .top, spacing: 8) {
                headerCopy
                Spacer(minLength: 4)
                MatchesIndexStatusBadge(status: match.status)
                    .accessibilityIdentifier("matches.card.\(match.matchID).status")
            }
        }
    }

    private var headerCopy: some View {
        VStack(alignment: .leading, spacing: 3) {
            if match.authenticatedPlayerInvolved {
                BaggerEyebrow(text: "Your Match")
                    .accessibilityIdentifier("matches.card.\(match.matchID).yourMatch")
            }
            Text(
                [
                    match.displayMatchNumber.map { "Match \($0)" },
                    showsFormat ? match.formatText : nil,
                    match.teeTimeLabel,
                ]
                    .compactMap { $0 }
                    .joined(separator: " · ")
                    .nilIfEmpty ?? "Match"
            )
                .font(BaggerDesign.Typography.captionEmphasis)
                .foregroundStyle(BaggerPalette.ink)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("matches.card.\(match.matchID).band.time")
        }
    }

    private var rowChevron: some View {
        Image(systemName: "chevron.right")
            .font(.caption.weight(.bold))
            .foregroundStyle(BaggerPalette.goldText)
            .accessibilityHidden(true)
    }
}

private struct CompactMatchSides: View {
    let sides: [MatchesSidePresentation]
    let matchID: String
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(spacing: BaggerDesign.Space.small) {
                    if let first = sides.first { compactSide(first) }
                    Text("VERSUS")
                        .font(.caption2.weight(.black))
                        .foregroundStyle(BaggerPalette.goldText)
                        .accessibilityHidden(true)
                    if sides.count > 1 { compactSide(sides[1]) }
                }
            } else {
                HStack(alignment: .top, spacing: 0) {
                    if let first = sides.first { compactSide(first) }
                    Text("VS")
                        .font(.caption2.weight(.black))
                        .foregroundStyle(BaggerPalette.goldText)
                        .frame(width: 36)
                        .padding(.top, BaggerDesign.Space.hairline)
                        .accessibilityHidden(true)
                        .accessibilityIdentifier("matches.card.\(matchID).vs")
                    if sides.count > 1 { compactSide(sides[1]) }
                }
            }
        }
    }

    private func compactSide(_ side: MatchesSidePresentation) -> some View {
        VStack(spacing: BaggerDesign.Space.xSmall) {
            HStack(alignment: .center, spacing: BaggerDesign.Space.xSmall) {
                BaggerTeamLogo(
                    teamID: side.teamID,
                    teamName: side.displayName,
                    size: .small,
                    accessibility: .decorative
                )
                .scaleEffect(dynamicTypeSize.isAccessibilitySize ? 0.875 : 0.9375)
                .frame(
                    width: dynamicTypeSize.isAccessibilitySize ? 28 : 30,
                    height: dynamicTypeSize.isAccessibilitySize ? 28 : 30
                )
                .accessibilityIdentifier("matches.card.\(matchID).side.\(side.side).logo")

                Text(side.displayName.uppercased())
                    .font(.caption2.weight(.black))
                    .foregroundStyle(BaggerPalette.goldText)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("matches.card.\(matchID).side.\(side.side).teamName")
            }
            .frame(maxWidth: .infinity, alignment: .center)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("matches.card.\(matchID).side.\(side.side).teamIdentity")

            if side.participants.isEmpty {
                Text("Pairing to be announced")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(BaggerPalette.ink)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                ForEach(side.participants) { participant in
                    participantIdentity(participant, side: side)
                }
            }

            if let context = side.golfContext, let text = context.compactText {
                Text(text)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(BaggerPalette.muted)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityLabel(context.accessibilityText ?? text)
                    .accessibilityIdentifier("matches.card.\(matchID).side.\(side.side).teamGolfContext")
            }
        }
        .frame(maxWidth: .infinity, alignment: .top)
        .accessibilityIdentifier("matches.card.\(matchID).side.\(side.side)")
    }

    private func participantIdentity(
        _ participant: MatchesParticipantPresentation,
        side: MatchesSidePresentation
    ) -> some View {
        VStack(spacing: BaggerDesign.Space.hairline) {
            Text(participant.displayName)
                .font(.subheadline.weight(participant.isAuthenticatedPlayer ? .bold : .semibold))
                .foregroundStyle(BaggerPalette.ink)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)

            if let context = participant.golfContext, let text = context.compactText {
                Text(text)
                    .font(.caption2)
                    .foregroundStyle(BaggerPalette.muted)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityLabel(context.accessibilityText ?? text)
                    .accessibilityIdentifier(
                        "matches.card.\(matchID).side.\(side.side).participant.\(participant.playerID).golfContext"
                    )
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(participant.accessibilitySummary)
        .accessibilityIdentifier(
            "matches.card.\(matchID).side.\(side.side).participant.\(participant.playerID)"
        )
    }
}

private struct MatchesHeroSides: View {
    let sides: [MatchesSidePresentation]
    let ownedSide: Int?
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(spacing: BaggerDesign.Space.medium) {
                    if let first = sides.first { heroSide(first) }
                    Text("VERSUS")
                        .font(.caption.weight(.black))
                        .foregroundStyle(BaggerPalette.liveRed)
                        .accessibilityHidden(true)
                    if sides.count > 1 { heroSide(sides[1]) }
                }
            } else {
                HStack(alignment: .top, spacing: 0) {
                    if let first = sides.first { heroSide(first) }
                    Text("VS")
                        .font(.caption.weight(.black))
                        .foregroundStyle(BaggerPalette.liveRed)
                        .frame(width: 40)
                        .padding(.top, 30)
                        .accessibilityHidden(true)
                    if sides.count > 1 { heroSide(sides[1]) }
                }
            }
        }
        .accessibilityElement(children: .contain)
    }

    private func heroSide(_ side: MatchesSidePresentation) -> some View {
        let isOwnedSide = side.side == ownedSide
        return VStack(spacing: BaggerDesign.Space.small) {
            BaggerTeamLogo(
                teamID: side.teamID,
                teamName: side.displayName,
                size: .large,
                accessibility: .decorative
            )
            .accessibilityIdentifier("matches.hero.team.\(side.side).logo")

            Text(side.displayName)
                .font(.footnote.weight(.bold))
                .foregroundStyle(BaggerDesign.Color.brandEvergreenSoft)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("matches.hero.team.\(side.side).name")

            if side.participants.isEmpty {
                Text("Pairing to be announced")
                    .font(.subheadline)
                    .foregroundStyle(BaggerPalette.muted)
                    .multilineTextAlignment(.center)
            } else {
                ForEach(side.participants) { participant in
                    heroParticipant(participant, side: side)
                }
            }

            if let context = side.golfContext, let text = context.compactText {
                Text(text)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(BaggerPalette.muted)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityLabel(context.accessibilityText ?? text)
                    .accessibilityIdentifier("matches.hero.side.\(side.side).teamGolfContext")
            }
        }
        .frame(maxWidth: .infinity, alignment: .top)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(side.accessibilitySummary(isOwnedSide: isOwnedSide))
        .accessibilityIdentifier("matches.hero.side.\(side.side)")
    }

    private func heroParticipant(
        _ participant: MatchesParticipantPresentation,
        side: MatchesSidePresentation
    ) -> some View {
        VStack(spacing: BaggerDesign.Space.hairline) {
            Text(participant.displayName)
                .font(.subheadline.weight(participant.isAuthenticatedPlayer ? .bold : .medium))
                .foregroundStyle(BaggerPalette.ink)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)

            if let context = participant.golfContext, let text = context.compactText {
                Text(text)
                    .font(.caption)
                    .foregroundStyle(BaggerPalette.muted)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityLabel(context.accessibilityText ?? text)
                    .accessibilityIdentifier(
                        "matches.hero.side.\(side.side).participant.\(participant.playerID).golfContext"
                    )
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(participant.accessibilitySummary)
        .accessibilityIdentifier("matches.hero.side.\(side.side).participant.\(participant.playerID)")
    }
}

private struct MatchesHeroContext: View {
    let match: MatchesMatchPresentation

    var body: some View {
        VStack(alignment: .leading, spacing: BaggerDesign.Space.small) {
            if let course = match.courseAndTeeText {
                HStack(alignment: .center, spacing: BaggerDesign.Space.small) {
                    BaggerCourseLogo(
                        courseID: match.courseID ?? "",
                        courseName: match.courseName ?? "Course",
                        size: .medium,
                        accessibility: .decorative
                    )
                    VStack(alignment: .leading, spacing: BaggerDesign.Space.hairline) {
                        Text(course)
                            .font(BaggerDesign.Typography.bodyEmphasis)
                            .foregroundStyle(BaggerPalette.ink)
                            .fixedSize(horizontal: false, vertical: true)
                        if let time = match.teeTimeLabel {
                            Label(time, systemImage: "clock")
                                .font(BaggerDesign.Typography.captionEmphasis)
                                .foregroundStyle(BaggerPalette.muted)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .accessibilityIdentifier("matches.hero.course")
            } else if let time = match.teeTimeLabel {
                Label(time, systemImage: "clock")
                    .font(BaggerDesign.Typography.bodyEmphasis)
                    .foregroundStyle(BaggerPalette.muted)
            }
        }
    }
}

private struct MatchesSidesView: View {
    let sides: [MatchesSidePresentation]
    let ownedSide: Int?
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(spacing: 12) {
                    sideViews
                }
            } else {
                HStack(alignment: .top, spacing: 12) {
                    sideViews
                }
            }
        }
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder
    private var sideViews: some View {
        ForEach(Array(sides.enumerated()), id: \.element.id) { index, side in
            if index > 0 {
                Text("VS")
                    .font(.caption.weight(.black))
                    .foregroundStyle(BaggerPalette.liveRed)
                    .accessibilityHidden(true)
            }
            MatchSidePanel(side: side, isOwnedSide: side.side == ownedSide)
                .frame(maxWidth: .infinity)
        }
    }
}

private struct MatchSidePanel: View {
    let side: MatchesSidePresentation
    let isOwnedSide: Bool

    var body: some View {
        VStack(spacing: 7) {
            ZStack {
                Circle()
                    .fill(isOwnedSide ? BaggerPalette.scoreGold.opacity(0.5) : BaggerPalette.cream)
                Text(initials)
                    .font(.caption.weight(.black))
                    .foregroundStyle(BaggerPalette.deepEvergreen)
            }
            .frame(width: 44, height: 44)
            .accessibilityHidden(true)

            Text(side.displayName)
                .font(.caption.weight(.bold))
                .foregroundStyle(BaggerPalette.muted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)

            ForEach(side.participants) { participant in
                HStack(spacing: 5) {
                    Text(participant.displayName)
                        .font(.subheadline.weight(participant.isAuthenticatedPlayer ? .bold : .medium))
                        .foregroundStyle(BaggerPalette.ink)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                    if participant.isAuthenticatedPlayer {
                        Text("YOU")
                            .font(.caption2.weight(.black))
                            .foregroundStyle(BaggerPalette.goldText)
                    }
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(side.accessibilitySummary(isOwnedSide: isOwnedSide))
    }

    private var initials: String {
        let words = side.displayName.split(separator: " ").prefix(2)
        let value = words.compactMap(\.first).map(String.init).joined().uppercased()
        return value.isEmpty ? "T\(side.side)" : value
    }
}

private struct MatchContextLine: View {
    let match: MatchesMatchPresentation

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            if let time = match.teeTimeLabel {
                Label(time, systemImage: "clock")
            }
            if let course = match.courseAndTeeText {
                Label(course, systemImage: "flag")
            }
        }
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(BaggerPalette.muted)
        .fixedSize(horizontal: false, vertical: true)
    }
}

/// Matches-index statuses intentionally delegate to the same semantic badge
/// used by Today. Match Detail keeps its existing presentation until 2J.3B.
private struct MatchesIndexStatusBadge: View {
    let status: MatchesMatchStatusPresentation

    var body: some View {
        BaggerStatusBadge(kind: kind, title: status.rawValue)
            .accessibilityLabel("Match status: \(status.rawValue)")
    }

    private var kind: BaggerStatusKind {
        switch status {
        case .upcoming: .upcoming
        case .live: .live
        case .final: .final
        }
    }
}

private struct MatchesStatusPill: View {
    let status: MatchesMatchStatusPresentation
    var compact = false

    var body: some View {
        HStack(spacing: 5) {
            if status == .live {
                Circle()
                    .fill(BaggerPalette.liveRed)
                    .frame(width: 7, height: 7)
                    .accessibilityHidden(true)
            }
            Text(status.rawValue.uppercased())
                .font((compact ? Font.caption2 : Font.caption).weight(.black))
                .tracking(0.7)
        }
        .foregroundStyle(foreground)
        .padding(.horizontal, compact ? 8 : 10)
        .padding(.vertical, compact ? 5 : 6)
        .background(background, in: Capsule())
        .overlay { Capsule().stroke(border, lineWidth: 1) }
        .fixedSize()
        .accessibilityLabel(status.rawValue)
    }

    private var foreground: Color {
        status == .live ? BaggerPalette.liveRed : BaggerPalette.actionGreen
    }

    private var background: Color {
        status == .final ? BaggerPalette.evergreen.opacity(0.09) : BaggerPalette.paper
    }

    private var border: Color {
        switch status {
        case .live: return BaggerPalette.liveRed.opacity(0.55)
        case .upcoming: return BaggerPalette.warmBorder
        case .final: return BaggerPalette.actionGreen.opacity(0.45)
        }
    }
}

private struct MatchesFreshnessBannerView: View {
    let banner: MatchesFreshnessBanner

    var body: some View {
        Label(title, systemImage: symbol)
            .font(.footnote.weight(.semibold))
            .foregroundStyle(BaggerPalette.deepEvergreen)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 13)
            .padding(.vertical, 10)
            .background(BaggerPalette.scoreGold.opacity(0.28), in: RoundedRectangle(cornerRadius: 12))
            .accessibilityIdentifier(banner.kind == .offline ? "matches.offlineStatus" : "matches.staleStatus")
    }

    private var title: String {
        switch banner.kind {
        case .cached: return "Showing saved Matches while Bagger refreshes."
        case .stale: return "Showing the last saved Matches. Refresh is temporarily unavailable."
        case .offline: return "Offline — showing the last saved Matches."
        }
    }

    private var symbol: String {
        banner.kind == .offline ? "wifi.slash" : "clock.arrow.circlepath"
    }
}

private struct MatchesLoadingState: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(0..<5, id: \.self) { index in
                RoundedRectangle(cornerRadius: 5)
                    .fill(BaggerPalette.warmBorder.opacity(0.58))
                    .frame(maxWidth: index.isMultiple(of: 2) ? .infinity : 230)
                    .frame(height: index == 0 ? 20 : 14)
            }
        }
        .redacted(reason: .placeholder)
        .baggerCard()
        .accessibilityLabel("Loading Matches")
    }
}

private struct MatchesEmptyState: View {
    var body: some View {
        Label("No Matches have been published yet.", systemImage: "flag.checkered")
            .font(.headline)
            .foregroundStyle(BaggerPalette.ink)
            .frame(maxWidth: .infinity, alignment: .leading)
            .baggerCard()
            .accessibilityIdentifier("matches.empty")
    }
}

private struct MatchesUnavailableState: View {
    let onRetry: @MainActor @Sendable () async -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Matches aren’t available right now", systemImage: "wifi.exclamationmark")
                .font(.headline)
                .foregroundStyle(BaggerPalette.ink)
            Text("Bagger could not load Matches and there is no saved update on this device.")
                .font(.subheadline)
                .foregroundStyle(BaggerPalette.muted)
            Button("Try Again") { Task { await onRetry() } }
                .buttonStyle(.borderedProminent)
                .tint(BaggerPalette.actionGreen)
                .controlSize(.large)
                .accessibilityIdentifier("matches.retry")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .baggerCard(border: BaggerPalette.matchBorder)
    }
}

private struct MatchDetailView: View {
    let match: MatchesMatchPresentation
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: BaggerLayout.sectionSpacing) {
                VStack(alignment: .leading, spacing: 7) {
                    if match.authenticatedPlayerInvolved {
                        BaggerEyebrow(text: "Your Match")
                    }
                    detailHeader
                }

                MatchContextLine(match: match)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .baggerCard()

                VStack(alignment: .leading, spacing: 12) {
                    BaggerSectionHeading("Matchup")
                    MatchesSidesView(
                        sides: match.teams,
                        ownedSide: match.authenticatedPlayerSide
                    )
                    .accessibilityIdentifier("matches.detail.sides")
                }
                .baggerCard(border: match.authenticatedPlayerInvolved ? BaggerPalette.gold : BaggerPalette.warmBorder)

                if match.status == .live {
                    MatchDetailStateCard(
                        title: "Current Progress",
                        value: match.progressText ?? "Progress has not been posted.",
                        symbol: "flag.fill",
                        identifier: "matches.detail.progress"
                    )
                } else if match.status == .final {
                    MatchDetailStateCard(
                        title: "Final Result",
                        value: match.resultText ?? "Final result has not been posted.",
                        symbol: "checkmark.seal.fill",
                        identifier: "matches.detail.result"
                    )
                }
            }
            .padding(.horizontal, BaggerLayout.pageInset)
            .padding(.top, 12)
            .padding(.bottom, 28)
        }
        .background(BaggerPalette.canvas.ignoresSafeArea())
        .navigationTitle("Match")
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("matches.detail")
        .overlay(alignment: .topLeading) {
            if BaggerAcceptanceProbes.isEnabled() {
                Text("Match identity")
                    .font(.system(size: 1))
                    .frame(width: 1, height: 1)
                    .opacity(0.01)
                    .allowsHitTesting(false)
                    .accessibilityIdentifier("matches.detail.\(match.matchID)")
            }
        }
    }

    @ViewBuilder
    private var detailHeader: some View {
        if dynamicTypeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: 10) {
                detailHeaderCopy
                detailStatus
            }
        } else {
            HStack(alignment: .top, spacing: 10) {
                detailHeaderCopy
                Spacer(minLength: 4)
                detailStatus
            }
        }
    }

    private var detailHeaderCopy: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(match.roundText)
                .font(.system(.title, design: .serif, weight: .bold))
                .foregroundStyle(BaggerPalette.ink)
                .fixedSize(horizontal: false, vertical: true)
            if let format = match.formatText {
                Text(format)
                    .font(.headline)
                    .foregroundStyle(BaggerPalette.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var detailStatus: some View {
        MatchesStatusPill(status: match.status)
            .accessibilityIdentifier("matches.detail.status")
    }
}

private struct MatchDetailStateCard: View {
    let title: String
    let value: String
    let symbol: String
    let identifier: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            BaggerEyebrow(text: title)
            Label(value, systemImage: symbol)
                .font(.system(.title3, design: .serif, weight: .bold))
                .foregroundStyle(BaggerPalette.actionGreen)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .baggerCard(border: BaggerPalette.matchBorder)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier(identifier)
    }
}

private struct MatchDetailUnavailableView: View {
    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "exclamationmark.circle")
                .font(.largeTitle)
                .foregroundStyle(BaggerPalette.goldText)
            Text("This Match is no longer available.")
                .font(.headline)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(24)
        .background(BaggerPalette.canvas.ignoresSafeArea())
        .navigationTitle("Match")
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("matches.detail.unavailable")
    }
}

private extension MatchesRoundID {
    var accessibilityComponent: String {
        switch self {
        case .number(let number): return "number.\(number)"
        case .name(let name): return "name.\(name.normalizedAccessibilityComponent)"
        case .unspecified: return "unspecified"
        }
    }
}

private extension MatchesMatchPresentation {
    var accessibilitySummary: String {
        accessibilitySummary(includeFormat: true)
    }

    var contextTitle: String {
        let base = roundID.number.map { "Round \($0)" } ?? roundText
        guard let formatText,
              !base.localizedCaseInsensitiveContains(formatText)
        else {
            return base
        }
        return "\(base) · \(formatText)"
    }

    func accessibilitySummary(includeFormat: Bool) -> String {
        var parts = [status.rawValue, roundText]
        if let displayMatchNumber { parts.append("Match \(displayMatchNumber)") }
        if authenticatedPlayerInvolved { parts.append("Your Match") }
        if includeFormat, let formatText { parts.append(formatText) }
        parts.append(teams.map { side in
            var sideParts = [
                "\(side.displayName): \(side.participants.map(\.accessibilitySummary).joined(separator: ", "))",
            ]
            if let context = side.golfContext?.accessibilityText {
                sideParts.append(context)
            }
            return sideParts.joined(separator: ", ")
        }.joined(separator: " versus "))
        if let teeTimeLabel { parts.append(teeTimeLabel) }
        if let courseAndTeeText { parts.append(courseAndTeeText) }
        if let state = resultText ?? progressText { parts.append(state) }
        return parts.joined(separator: ", ")
    }
}

private extension MatchesSidePresentation {
    func accessibilitySummary(isOwnedSide: Bool) -> String {
        var prefix = isOwnedSide ? "Your side" : displayName
        if isOwnedSide, name != nil { prefix += ", \(displayName)" }
        let players = participants.map { participant in
            participant.accessibilitySummary
        }.joined(separator: ", ")
        let teamContext = golfContext?.accessibilityText.map { ", \($0)" } ?? ""
        return "\(prefix): \(players)\(teamContext)"
    }
}

private extension MatchesParticipantPresentation {
    var accessibilitySummary: String {
        var parts = [isAuthenticatedPlayer ? "\(displayName), you" : displayName]
        if let context = golfContext?.accessibilityText { parts.append(context) }
        return parts.joined(separator: ", ")
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }

    var normalizedAccessibilityComponent: String {
        let allowed = CharacterSet.alphanumerics
        return unicodeScalars.map { allowed.contains($0) ? String($0).lowercased() : "-" }.joined()
    }
}

private struct MatchesReadDiagnosticModifier: ViewModifier {
    let value: String?

    @ViewBuilder
    func body(content: Content) -> some View {
        if let value {
            content.accessibilityValue(Text(value))
        } else {
            content
        }
    }
}

private extension View {
    func matchesReadDiagnostic(_ value: String?) -> some View {
        modifier(MatchesReadDiagnosticModifier(value: value))
    }
}
