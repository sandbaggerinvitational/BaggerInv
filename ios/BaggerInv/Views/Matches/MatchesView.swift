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
    @ObservedObject private var repository: MobileReadRepository<MobileMatchesResponse>
    @State private var selectedRoundID: MatchesRoundID?

    init(
        participant: ParticipantSession,
        repository: MobileReadRepository<MobileMatchesResponse>
    ) {
        self.participant = participant
        _repository = ObservedObject(wrappedValue: repository)
    }

    var body: some View {
        MatchesScreen(
            presentation: MatchesPresenter.make(
                participant: participant,
                state: repository.state,
                selectedRoundID: selectedRoundID
            ),
            selectedRoundID: $selectedRoundID,
            diagnostics: BaggerAcceptanceProbes.isEnabled()
                ? MatchesRepositoryDiagnostics(state: repository.state)
                : nil,
            onRefresh: { await repository.refresh() }
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
                tournamentContext

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
            selection: Binding(
                get: { presentation.selectedRoundID },
                set: { selectedRoundID = $0 }
            )
        )

        if let round = presentation.selectedRound {
            YourMatchSection(round: round)
                .accessibilityIdentifier(round.yourMatch == nil ? "matches.hero.empty" : "matches.hero")

            AllMatchesSection(round: round)
        }
    }

    private var tournamentContext: some View {
        VStack(alignment: .leading, spacing: 4) {
            BaggerEyebrow(text: "Match Center")
            Text(presentation.tournamentName.isEmpty ? "Bagger Invitational" : presentation.tournamentName)
                .font(.system(.title2, design: .serif, weight: .bold))
                .foregroundStyle(BaggerPalette.ink)
                .fixedSize(horizontal: false, vertical: true)
            if let year = presentation.tournamentYear {
                Text(String(year))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(BaggerPalette.actionGreen)
            }
        }
        .padding(.horizontal, 2)
        .accessibilityElement(children: .combine)
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
    @Binding var selection: MatchesRoundID?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            BaggerSectionHeading("Selected Round")
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
                MatchesSidesView(
                    sides: [own, opponent],
                    ownedSide: own.side
                )
            }

            MatchContextLine(match: match)

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
                Label("View Match", systemImage: "chevron.right")
                    .font(.footnote.weight(.bold))
                    .foregroundStyle(BaggerPalette.actionGreen)
            }
        }
        .baggerCard(border: BaggerPalette.gold)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Your match, \(match.accessibilitySummary)")
    }

    @ViewBuilder
    private var header: some View {
        if dynamicTypeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: 10) {
                headerCopy
                MatchesStatusPill(status: match.status)
            }
        } else {
            HStack(alignment: .top, spacing: 10) {
                headerCopy
                Spacer(minLength: 4)
                MatchesStatusPill(status: match.status)
            }
        }
    }

    private var headerCopy: some View {
        VStack(alignment: .leading, spacing: 4) {
            BaggerEyebrow(text: "Your Match")
            Text([match.roundText, match.formatText].compactMap { $0 }.joined(separator: " · "))
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
            BaggerSectionHeading("All Matches", eyebrow: round.title)
                .accessibilityIdentifier("matches.allMatches")
            VStack(spacing: 0) {
                ForEach(Array(round.matches.enumerated()), id: \.element.id) { index, match in
                    NavigationLink(value: MatchesDestination.match(matchID: match.matchID)) {
                        CompactMatchRow(match: match)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("matches.card.\(match.matchID)")
                    .accessibilityLabel(match.accessibilitySummary)
                    .accessibilityHint("Opens Match Detail")

                    if index < round.matches.count - 1 {
                        Divider().overlay(BaggerPalette.warmBorder)
                    }
                }
            }
            .baggerCard()
        }
    }
}

private struct CompactMatchRow: View {
    let match: MatchesMatchPresentation
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            header

            CompactMatchSides(sides: match.teams)

            HStack(alignment: .firstTextBaseline, spacing: 8) {
                if let course = match.courseAndTeeText {
                    Label(course, systemImage: "flag")
                        .font(.caption)
                        .foregroundStyle(BaggerPalette.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 4)
                if let state = match.resultText ?? match.progressText {
                    Text(state)
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(match.status == .live ? BaggerPalette.liveRed : BaggerPalette.actionGreen)
                        .multilineTextAlignment(.trailing)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(BaggerPalette.goldText)
                    .accessibilityHidden(true)
            }
        }
        .padding(.vertical, 11)
        .contentShape(Rectangle())
    }

    @ViewBuilder
    private var header: some View {
        if dynamicTypeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: 8) {
                headerCopy
                MatchesStatusPill(status: match.status, compact: true)
            }
        } else {
            HStack(alignment: .top, spacing: 8) {
                headerCopy
                Spacer(minLength: 4)
                MatchesStatusPill(status: match.status, compact: true)
            }
        }
    }

    private var headerCopy: some View {
        VStack(alignment: .leading, spacing: 3) {
            if match.authenticatedPlayerInvolved {
                BaggerEyebrow(text: "Your Match")
            }
            Text([match.formatText, match.teeTimeLabel].compactMap { $0 }.joined(separator: " · ").nilIfEmpty ?? "Match")
                .font(.subheadline.weight(.bold))
                .foregroundStyle(BaggerPalette.ink)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

private struct CompactMatchSides: View {
    let sides: [MatchesSidePresentation]
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 7) {
                    ForEach(sides) { side in
                        compactSide(side)
                    }
                }
            } else {
                HStack(alignment: .center, spacing: 8) {
                    if let first = sides.first { compactSide(first) }
                    Text("VS")
                        .font(.caption2.weight(.black))
                        .foregroundStyle(BaggerPalette.goldText)
                        .accessibilityHidden(true)
                    if sides.count > 1 { compactSide(sides[1]) }
                }
            }
        }
    }

    private func compactSide(_ side: MatchesSidePresentation) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(side.displayName.uppercased())
                .font(.caption2.weight(.black))
                .foregroundStyle(BaggerPalette.goldText)
                .fixedSize(horizontal: false, vertical: true)
            Text(side.participants.map(\.displayName).joined(separator: " + ").nilIfEmpty ?? "Pairing to be announced")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(BaggerPalette.ink)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
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
        var parts = [status.rawValue, roundText]
        if authenticatedPlayerInvolved { parts.append("Your Match") }
        if let formatText { parts.append(formatText) }
        parts.append(teams.map { side in
            "\(side.displayName): \(side.participants.map(\.displayName).joined(separator: ", "))"
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
            participant.isAuthenticatedPlayer ? "\(participant.displayName), you" : participant.displayName
        }.joined(separator: ", ")
        return "\(prefix): \(players)"
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
