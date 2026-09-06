import SwiftUI

enum ScoreScreenDestination: Hashable { case scorecard }

enum ScoringFinalizationUIPhase: Equatable {
    case hidden
    case ready
    case submitting
    case reconciling
    case acknowledgedRefreshPending
    case outcomeUnknown
    case confirmationRequired
    case blocked(ScoringFinalizationBlocker)
    case matchFinal
}

struct ScoringFinalizationUIModel: Equatable {
    let phase: ScoringFinalizationUIPhase
    let canRequestFinalization: Bool

    static func make(
        presentation: ScoringPresentation,
        queueState: ScoringQueueCoordinatorState,
        coordinatorState: ScoringFinalizationState,
        liveFinalizationSendingEnabled: Bool = true,
        hasActiveLocalReview: Bool = false
    ) -> Self {
        guard liveFinalizationSendingEnabled else {
            return Self(phase: .hidden, canRequestFinalization: false)
        }
        guard let matchID = presentation.matchID else {
            return Self(phase: .hidden, canRequestFinalization: false)
        }
        let stateMatches = coordinatorState.matchId.map { $0 == matchID } ?? true
        guard stateMatches else {
            return Self(phase: .blocked(.contract), canRequestFinalization: false)
        }

        // A durable unknown/acknowledged probe must remain visible until its
        // coordinator removes it and releases the queue guard. A separately
        // refreshed final presentation cannot hide that unresolved recovery.
        switch coordinatorState.phase {
        case .submitting:
            return Self(phase: .submitting, canRequestFinalization: false)
        case .reconciling:
            return Self(phase: .reconciling, canRequestFinalization: false)
        case .acknowledgedRefreshPending:
            return Self(phase: .acknowledgedRefreshPending, canRequestFinalization: false)
        case .outcomeUnknown:
            return Self(phase: .outcomeUnknown, canRequestFinalization: false)
        case .blocked:
            return Self(
                phase: .blocked(coordinatorState.blocker ?? .contract),
                canRequestFinalization: false
            )
        case .matchFinal:
            return Self(phase: .matchFinal, canRequestFinalization: false)
        case .idle, .confirmationRequired:
            break
        }
        if presentation.status == .final {
            return Self(phase: .matchFinal, canRequestFinalization: false)
        }
        // Presentation priority only: never hide active/unknown recovery or
        // alter canonical readiness. A local correction must be resolved first.
        if hasActiveLocalReview {
            return Self(phase: .hidden, canRequestFinalization: false)
        }

        let unresolvedForMatch = queueState.records.contains {
            $0.partition.matchId == matchID && $0.isUnresolved
        }
        let queueReady = !unresolvedForMatch &&
            !queueState.isOffline &&
            !queueState.isSuspended &&
            !queueState.lastPersistenceFailure &&
            !queueState.hasHiddenQuarantinedRecords
        let canonicalReady = presentation.availability == .active &&
            presentation.status == .live &&
            presentation.canFinalize &&
            presentation.scorecardComplete &&
            !presentation.readOnly &&
            !presentation.isRefreshing &&
            !presentation.orientationOnly
        let ready = queueReady && canonicalReady

        switch coordinatorState.phase {
        case .submitting:
            return Self(phase: .submitting, canRequestFinalization: false)
        case .reconciling:
            return Self(phase: .reconciling, canRequestFinalization: false)
        case .acknowledgedRefreshPending:
            return Self(phase: .acknowledgedRefreshPending, canRequestFinalization: false)
        case .outcomeUnknown:
            return Self(phase: .outcomeUnknown, canRequestFinalization: false)
        case .confirmationRequired:
            if ready {
                return Self(phase: .confirmationRequired, canRequestFinalization: true)
            }
            return Self(
                phase: .blocked(blocker(presentation: presentation, queueReady: queueReady)),
                canRequestFinalization: false
            )
        case .blocked:
            return Self(
                phase: .blocked(coordinatorState.blocker ?? .contract),
                canRequestFinalization: false
            )
        case .matchFinal:
            return Self(phase: .matchFinal, canRequestFinalization: false)
        case .idle:
            if ready {
                return Self(phase: .ready, canRequestFinalization: true)
            }
            let shouldExplain = presentation.canFinalize ||
                presentation.scorecardComplete ||
                coordinatorState.matchId == matchID
            guard shouldExplain else {
                return Self(phase: .hidden, canRequestFinalization: false)
            }
            return Self(
                phase: .blocked(blocker(presentation: presentation, queueReady: queueReady)),
                canRequestFinalization: false
            )
        }
    }

    private static func blocker(
        presentation: ScoringPresentation,
        queueReady: Bool
    ) -> ScoringFinalizationBlocker {
        if !queueReady { return .queue }
        if presentation.readOnly { return .readOnly }
        if presentation.status == .final { return .lifecycle }
        if presentation.orientationOnly || presentation.isRefreshing { return .canonicalUnavailable }
        return .notReady
    }
}

struct ScoringLocalIntentRow: Identifiable, Equatable {
    let side: Int
    let slot: Int
    let label: String
    let officialGross: Int?
    let savedGross: Int

    var id: String { "\(side):\(slot)" }
}

struct ScoringLocalIntentComparison: Equatable {
    let recordID: String
    let holeNumber: Int
    let rows: [ScoringLocalIntentRow]
    let state: ScoringQueueState
    let reason: ScoringQueueStateReasonCode?
    let allowsKeepOfficial: Bool
    let allowsReapply: Bool

    static func make(
        record: ScoringQueueRecord,
        presentation: ScoringPresentation
    ) -> Self {
        let officialGross: ScoringQueueGross? = record.conflict?.officialGross ?? presentation
            .officialHole(record.intent.holeNumber)
            .flatMap { hole in
                guard let teamOne = hole.sides.first(where: { $0.side == 1 })?.gross,
                      let teamTwo = hole.sides.first(where: { $0.side == 2 })?.gross
                else { return nil }
                return ScoringQueueGross(teamOne: teamOne, teamTwo: teamTwo)
            }

        let rows = presentation.sides.flatMap { side -> [ScoringLocalIntentRow] in
            let saved = side.side == 1
                ? record.intent.teamOneGrossScores
                : record.intent.teamTwoGrossScores
            let official = side.side == 1
                ? officialGross?.teamOne
                : officialGross?.teamTwo
            return saved.enumerated().map { index, value in
                let participant = side.participants.indices.contains(index)
                    ? side.participants[index]
                    : nil
                let label = saved.count == side.participants.count
                    ? participant?.displayName ?? "\(side.name) slot \(index + 1)"
                    : side.name
                return ScoringLocalIntentRow(
                    side: side.side,
                    slot: participant?.slot ?? index + 1,
                    label: label,
                    officialGross: official.flatMap { $0.indices.contains(index) ? $0[index] : nil },
                    savedGross: value
                )
            }
        }
        let reviewable = record.state == .conflict &&
            record.stateReasonCode == .revision &&
            record.conflict?.refreshRequired == false
        let reapplicationIsCanonicallyEligible = presentation.canCreateDurableIntent &&
            presentation.matchID == record.partition.matchId &&
            presentation.snapshotID == record.base.snapshotId &&
            presentation.snapshotRevision == record.base.snapshotRevision
        return Self(
            recordID: record.localQueueRecordId,
            holeNumber: record.intent.holeNumber,
            rows: rows,
            state: record.state,
            reason: record.stateReasonCode,
            allowsKeepOfficial: reviewable,
            allowsReapply: reviewable && reapplicationIsCanonicallyEligible
        )
    }
}

enum ScoringQueueUIProjection {
    static func records(
        matchID: String,
        state: ScoringQueueCoordinatorState
    ) -> [ScoringQueueRecord] {
        state.records
            .filter { $0.partition.matchId == matchID }
            .sorted { $0.sequence < $1.sequence }
    }

    static func reviewRecords(
        matchID: String,
        state: ScoringQueueCoordinatorState
    ) -> [ScoringQueueRecord] {
        records(matchID: matchID, state: state).filter {
            $0.state == .conflict || $0.state == .actionRequired || $0.state == .quarantined
        }
    }

    static func latestUnresolvedPerHole(
        matchID: String,
        state: ScoringQueueCoordinatorState
    ) -> [ScoringQueueRecord] {
        let grouped = Dictionary(
            grouping: records(matchID: matchID, state: state).filter(\.isUnresolved)
        ) { $0.intent.holeNumber }
        return grouped.values.compactMap { records in
            records.max { $0.sequence < $1.sequence }
        }
        .sorted { lhs, rhs in
            if lhs.intent.holeNumber != rhs.intent.holeNumber {
                return lhs.intent.holeNumber < rhs.intent.holeNumber
            }
            return lhs.sequence < rhs.sequence
        }
    }
}

struct ScoreScreen: View {
    let presentation: ScoringPresentation
    let queueState: ScoringQueueCoordinatorState
    let finalizationState: ScoringFinalizationState
    let liveHoleMutationSendingEnabled: Bool
    let liveFinalizationSendingEnabled: Bool
    let onRefresh: @MainActor @Sendable () async -> Void
    let onSave: @MainActor @Sendable (ScoringDraft) async throws -> ScoringQueueSaveResult
    let onManualRetry: @MainActor @Sendable (String) async throws -> Void
    let onKeepOfficial: @MainActor @Sendable (String) async throws -> Void
    let onReapplyMyScore: @MainActor @Sendable (String) async throws -> Void
    let onFinalize: @MainActor @Sendable (String) async throws -> Void
    let onRefreshFinalizationOutcome: @MainActor @Sendable () async -> Void
    let matchSelection: ScoreMatchSelectionStore?
    let onSelectMatch: @MainActor @Sendable (String) async throws -> Void

    @Environment(\.scoreMatchDisplay) private var scorecardMatchDisplay
    @State private var selectedHole: Int?
    @State private var editors: [Int: ScoreEntryEditor] = [:]
    @State private var isDiscardRefreshPresented = false
    @State private var correctionSaveHole: Int?
    @State private var isCorrectionSavePresented = false
    @State private var isSaving = false
    @State private var saveFailure = false
    @State private var pendingReviewAction: PendingScoringReviewAction?
    @State private var isReviewConfirmationPresented = false
    @State private var reviewRecordIDInFlight: String?
    @State private var reviewActionFailed = false
    @State private var isFinalizeConfirmationPresented = false
    @State private var finalizationActionFailed = false
    @State private var isMatchSelectionPresented = false
    @State private var isDiscardMatchSelectionPresented = false
    @State private var correctionFocusHole: Int?

    init(
        presentation: ScoringPresentation,
        queueState: ScoringQueueCoordinatorState = .inactive,
        finalizationState: ScoringFinalizationState = .idle,
        liveHoleMutationSendingEnabled: Bool = false,
        liveFinalizationSendingEnabled: Bool = true,
        matchSelection: ScoreMatchSelectionStore? = nil,
        onSelectMatch: @escaping @MainActor @Sendable (String) async throws -> Void = { _ in throw ScoreMatchSelectionError.unavailable },
        onRefresh: @escaping @MainActor @Sendable () async -> Void,
        onSave: @escaping @MainActor @Sendable (ScoringDraft) async throws -> ScoringQueueSaveResult = { _ in
            throw ScoringQueueCoordinatorError.inactiveIdentity
        },
        onManualRetry: @escaping @MainActor @Sendable (String) async throws -> Void = { _ in
            throw ScoringQueueCoordinatorError.notEligibleForRetry
        },
        onKeepOfficial: @escaping @MainActor @Sendable (String) async throws -> Void = { _ in
            throw ScoringQueueCoordinatorError.notReviewable
        },
        onReapplyMyScore: @escaping @MainActor @Sendable (String) async throws -> Void = { _ in
            throw ScoringQueueCoordinatorError.notReviewable
        },
        onFinalize: @escaping @MainActor @Sendable (String) async throws -> Void = { _ in
            throw ScoringFinalizationCoordinatorError.notReady
        },
        onRefreshFinalizationOutcome: @escaping @MainActor @Sendable () async -> Void = {}
    ) {
        self.presentation = presentation
        self.queueState = queueState
        self.finalizationState = finalizationState
        self.liveHoleMutationSendingEnabled = liveHoleMutationSendingEnabled
        self.liveFinalizationSendingEnabled = liveFinalizationSendingEnabled
        self.onRefresh = onRefresh
        self.onSave = onSave
        self.onManualRetry = onManualRetry
        self.onKeepOfficial = onKeepOfficial
        self.onReapplyMyScore = onReapplyMyScore
        self.onFinalize = onFinalize
        self.onRefreshFinalizationOutcome = onRefreshFinalizationOutcome
        self.matchSelection = matchSelection
        self.onSelectMatch = onSelectMatch
        _selectedHole = State(initialValue: presentation.initialSelectedHole())
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if presentation.matchID == nil { header }

                if presentation.orientationOnly {
                    ScoreNotice(
                        symbol: "wifi.slash",
                        title: orientationNoticeTitle,
                        message: orientationNoticeMessage
                    )
                    .accessibilityIdentifier("score.offline")
                }

                content

                if presentation.isRefreshing {
                    HStack(spacing: 8) {
                        ProgressView()
                        Text("Refreshing official scoring state")
                            .font(.footnote.weight(.semibold))
                    }
                    .foregroundStyle(BaggerPalette.muted)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                    .accessibilityElement(children: .combine)
                }
            }
            .padding(.horizontal, BaggerLayout.pageInset)
            .padding(.top, 12)
            .padding(.bottom, 32)
        }
        .background(BaggerPalette.canvas.ignoresSafeArea())
        .refreshable(action: refreshCanonicalState)
        .accessibilityIdentifier("score.screen")
        .navigationDestination(for: ScoreScreenDestination.self) { _ in
            ScoringScorecardView(
                presentation: presentation,
                selectedHole: effectiveSelectedHole,
                pendingRecords: pendingScorecardRecords,
                onSelectHole: { if !isSaving { selectHoleForReview($0) } }
            )
            .environment(\.scoreMatchDisplay, scorecardMatchDisplay)
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if let hole = effectiveSelectedHole, presentation.canCreateDurableIntent {
                saveDock(holeNumber: hole)
            }
        }
        .alert("Discard unsaved entries and refresh?", isPresented: $isDiscardRefreshPresented) {
            Button("Discard and Refresh", role: .destructive) {
                editors.removeAll()
                Task { await onRefresh() }
            }
            Button("Keep Editing", role: .cancel) {}
        }
        .alert("Discard unsaved entries and choose a Match?", isPresented: $isDiscardMatchSelectionPresented) {
            Button("Discard and Choose", role: .destructive) {
                editors.removeAll(); correctionFocusHole = nil
                isMatchSelectionPresented = true
            }
            Button("Keep Editing", role: .cancel) {}
        } message: {
            Text("Only unsaved keypad edits are discarded. Scores already saved on this iPhone stay with their original Match.")
        }
        .sheet(isPresented: $isMatchSelectionPresented) {
            if let matchSelection {
                ScoreMatchSelectionSheet(store: matchSelection, currentMatchID: presentation.matchID, onSelect: onSelectMatch)
            }
        }
        .alert("Save this correction?", isPresented: $isCorrectionSavePresented) {
            Button("Save Correction") {
                if let hole = correctionSaveHole { saveAndAdvance(holeNumber: hole) }
            }
            Button("Keep Editing", role: .cancel) {}
        } message: {
            Text("Your changed gross scores will be saved on this iPhone. They are not Official until Bagger confirms them.")
        }
        .confirmationDialog(
            "Resolve saved score?",
            isPresented: $isReviewConfirmationPresented,
            titleVisibility: .visible,
            presenting: pendingReviewAction
        ) { action in
            Button(action.buttonTitle, role: action.kind == .keepOfficial ? .destructive : nil) {
                performReviewAction(action)
            }
            Button("Cancel", role: .cancel) {}
        } message: { action in
            Text(action.message)
        }
        .confirmationDialog(
            "Finalize this Match?",
            isPresented: $isFinalizeConfirmationPresented,
            titleVisibility: .visible
        ) {
            Button("Finalize Match", role: .destructive) {
                submitFinalization()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("All saved scores must be Official first. Once finalized, this Match becomes read-only.")
        }
        .onChange(of: presentation.canonicalVersion) { _ in
            editors.removeAll()
            correctionFocusHole = nil
            reconcileSelection()
        }
        .onChange(of: presentation.matchID) { _ in
            editors.removeAll(); correctionFocusHole = nil
            selectedHole = presentation.initialSelectedHole()
        }
        .onChange(of: presentation.canonicalHoleNumbers) { _ in
            reconcileSelection()
        }
        .onChange(of: allowsLocalIntentAdmission) { allowed in
            guard !allowed else { return }
            editors.removeAll()
        }
        .onAppear {
            // TabView may construct Score while scoring-current is still
            // loading, then keep its @State alive until the golfer opens the
            // tab. Reconcile again on first visibility so the canonical
            // current/review hole is selected even when the data transition
            // occurred while this tab was off-screen.
            reconcileSelection()
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 5) {
            BaggerEyebrow(text: "Official Match Scoring")
            Text("Score")
                .font(.system(.largeTitle, design: .serif, weight: .bold))
                .foregroundStyle(BaggerPalette.ink)
            if let statusText = presentation.statusText, presentation.matchID != nil {
                Text(statusText)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(BaggerPalette.actionGreen)
            }
        }
        .padding(.horizontal, 2)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var content: some View {
        switch presentation.availability {
        case .loading:
            ScoreLoadingCard()
        case .noMatch:
            ScoreEmptyState(
                symbol: "calendar.badge.minus",
                title: "No scoring match",
                message: "Your owned Match scoring context will appear here when one is available."
            )
        case .authenticationRequired:
            ScoreEmptyState(
                symbol: "person.crop.circle.badge.exclamationmark",
                title: "Sign in again",
                message: "Bagger must verify your participant identity before showing scoring."
            )
        case .unavailable:
            ScoreRetryState(
                title: "Scoring unavailable",
                message: "Official scoring state could not be loaded. No score has changed.",
                onRetry: refreshCanonicalState
            )
        case .upcoming, .active, .readOnly, .completed, .offline:
            matchContent
        }
    }

    private var matchContent: some View {
        Group {
            matchContext

            availabilityNotice

            if let matchID = presentation.matchID,
               !queueState.isOffline || unresolvedQueueCount(matchID: matchID) > 0
            {
                if reliabilityStatus(matchID: matchID) != .official {
                    ScoringReliabilityStatusView(
                        status: reliabilityStatus(matchID: matchID),
                        unresolvedCount: unresolvedQueueCount(matchID: matchID),
                        onRetry: retryAction(matchID: matchID)
                    )
                }
                if let notice = queueAgeNotice(matchID: matchID) {
                    ScoreNotice(
                        symbol: "clock.badge.exclamationmark",
                        title: notice.title,
                        message: notice.message
                    )
                    .accessibilityIdentifier("score.queue.ageNotice")
                }
            }

            if let matchID = presentation.matchID {
                let reviewRecords = reviewQueueRecords(matchID: matchID)
                if !reviewRecords.isEmpty {
                    ScoringReviewCenter(
                        comparisons: reviewRecords.map {
                            ScoringLocalIntentComparison.make(
                                record: $0,
                                presentation: presentation
                            )
                        },
                        recordIDInFlight: reviewRecordIDInFlight,
                        actionFailed: reviewActionFailed,
                        onKeepOfficial: { requestReviewAction(.keepOfficial, for: $0) },
                        onReapply: { requestReviewAction(.reapply, for: $0) }
                    )
                }
            }

            if let activeHoleNumber = effectiveSelectedHole,
               let hole = presentation.hole(activeHoleNumber)
            {
                HoleNavigator(
                    holes: presentation.reviewHoles,
                    officialHoleNumbers: presentation.officialHoleNumbers,
                    currentHole: presentation.canonicalCurrentHole,
                    pendingHoleNumbers: Set(pendingScorecardRecords.map { $0.intent.holeNumber }),
                    selectedHole: selectedHoleBinding
                )

                HStack(spacing: 4) {
                    Button { selectPreviousHole(before: hole.holeNumber) } label: {
                        Image(systemName: "chevron.left").frame(width: 44, height: 44)
                    }
                    .disabled(isSaving || presentation.canonicalHoleNumbers.first == hole.holeNumber)
                    .accessibilityLabel("Previous hole").accessibilityIdentifier("score.previousHole")
                    HoleHeader(hole: hole)
                    Button { selectNextHole(after: hole.holeNumber) } label: {
                        Image(systemName: "chevron.right").frame(width: 44, height: 44)
                    }
                    .disabled(isSaving || presentation.canonicalHoleNumbers.last == hole.holeNumber)
                    .accessibilityLabel("Next hole").accessibilityIdentifier("score.nextHole")
                NavigationLink(value: ScoreScreenDestination.scorecard) {
                    Image(systemName: "list.bullet.clipboard")
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .tint(BaggerPalette.actionGreen)
                .accessibilityIdentifier("score.scorecard.quick")
                .accessibilityLabel("Scorecard")
                .accessibilityHint("Opens the official Scorecard")
                .disabled(isSaving)
                }
                .foregroundStyle(BaggerPalette.actionGreen)

                if presentation.officialHole(hole.holeNumber) != nil {
                    compactOfficialContext(holeNumber: hole.holeNumber)
                }

                if presentation.format?.isSupported == false {
                    ScoreNotice(
                        symbol: "exclamationmark.shield",
                        title: "Read-only format",
                        message: "This Match format is not supported for native score entry. Official Scorecard review remains available."
                    )
                } else {
                    ScoreEntryControls(
                        presentation: presentation,
                        holeNumber: hole.holeNumber,
                        editor: editor(for: hole.holeNumber),
                        enabled: allowsLocalIntentAdmission && !isSaving,
                        correctionActive: correctionFocusHole == hole.holeNumber || editor(for: hole.holeNumber)?.hasChanges == true,
                        onFinishReview: { correctionFocusHole = nil },
                        onSelect: { key in
                            if editor(for: hole.holeNumber)?.isCorrection == true { correctionFocusHole = hole.holeNumber }
                            updateEditor(hole.holeNumber) { $0.select(key) }
                        },
                        onAction: { action in updateEditor(hole.holeNumber) { $0.apply(action) } },
                        onDiscard: { editors.removeValue(forKey: hole.holeNumber); correctionFocusHole = nil }
                    )
                }

                if let matchID = presentation.matchID,
                   let record = latestQueueRecord(matchID: matchID, holeNumber: hole.holeNumber),
                   record.isUnresolved
                {
                    LocalScoringIntentCard(
                        record: record,
                        status: reliabilityStatus(matchID: matchID, holeNumber: hole.holeNumber)
                    )
                }

            } else {
                ScoreNotice(
                    symbol: "flag.checkered",
                    title: "Scorecard orientation unavailable",
                    message: "This canonical scoring snapshot does not currently include hole details."
                )
            }

            ScoringFinalizationCard(
                model: finalizationUIModel,
                actionFailed: finalizationActionFailed,
                onRequestFinalization: {
                    guard finalizationUIModel.canRequestFinalization else { return }
                    isFinalizeConfirmationPresented = true
                },
                onRefreshOfficialState: {
                    Task { @MainActor in
                        if finalizationUIModel.phase == .outcomeUnknown ||
                            finalizationUIModel.phase == .acknowledgedRefreshPending
                        {
                            await onRefreshFinalizationOutcome()
                        } else {
                            await refreshCanonicalState()
                        }
                    }
                }
            )
        }
    }

    @ViewBuilder
    private var availabilityNotice: some View {
        switch presentation.availability {
        case .upcoming:
            ScoreNotice(
                symbol: "clock.badge.exclamationmark",
                title: "Scoring not available yet",
                message: "This upcoming Match is available for orientation. Official score entry remains disabled."
            )
        case .readOnly:
            ScoreNotice(
                symbol: "lock.fill",
                title: "Read-only",
                message: "Bagger’s canonical permission does not allow score changes. Official Scorecard review remains available."
            )
        case .completed:
            ScoreNotice(
                symbol: "checkmark.seal.fill",
                title: "Match Final",
                message: "This Match is complete. Its official Scorecard is read-only."
            )
        default:
            EmptyView()
        }
    }

    @ViewBuilder private var matchContext: some View {
        let official = presentation.matchID.map { reliabilityStatus(matchID: $0) == .official } ?? false
        if matchSelection != nil {
            ScoreMatchContext(presentation: presentation, showsOfficial: official,
                              onChooseMatch: { requestMatchSelection() }, switchingDisabled: !canChooseMatch)
        } else {
            ScoreMatchContext(presentation: presentation, showsOfficial: official)
        }
    }

    private var orientationNoticeTitle: String {
        presentation.safeErrorCode == nil ? "Offline · scoring unavailable" : "Scoring unavailable · orientation only"
    }

    private var orientationNoticeMessage: String {
        let hasDurableIntent = presentation.matchID.map {
            unresolvedQueueCount(matchID: $0) > 0
        } ?? false
        if hasDurableIntent {
            return "The last official snapshot remains visible. Completed Save & Next scores remain stored on this iPhone, but they are not Official until Bagger confirms them."
        }
        return "The last official snapshot remains visible for orientation. A completed Save & Next must finish saving on this iPhone before it can be shown as Saved on iPhone."
    }

    /// TabView may retain Score's local state from an earlier loading render.
    /// Always derive a safe canonical fallback for presentation while keeping
    /// explicit golfer navigation in `selectedHole`.
    private var effectiveSelectedHole: Int? {
        presentation.reconciledSelectedHole(selectedHole)
    }

    private var selectedHoleBinding: Binding<Int?> {
        Binding(
            get: { presentation.reconciledSelectedHole(selectedHole) },
            set: { if !isSaving, let number = $0 { selectHoleForReview(number) } }
        )
    }

    private func reconcileSelection() {
        selectedHole = presentation.reconciledSelectedHole(selectedHole)
        editors = editors.filter { presentation.isDraftCompatible($0.value.base) }
    }

    private func editor(for number: Int) -> ScoreEntryEditor? {
        guard allowsLocalIntentAdmission else { return nil }
        if let existing = editors[number], presentation.isDraftCompatible(existing.base) {
            return existing
        }
        guard let base = presentation.makeDraft(for: number) else { return nil }
        let rows = presentation.inputRows(for: number)
        var pending: [ScoringInputKey: Int] = [:]
        if let record = pendingScorecardRecords.first(where: { $0.intent.holeNumber == number }) {
            for row in rows {
                let values = row.key.side == 1 ? record.intent.teamOneGrossScores : record.intent.teamTwoGrossScores
                let index = row.key.slot - 1
                if values.indices.contains(index) { pending[row.key] = values[index] }
            }
        }
        return ScoreEntryEditor(base: base, rows: rows, pending: pending)
    }

    private func updateEditor(_ number: Int, change: (inout ScoreEntryEditor) -> Void) {
        guard !isSaving, var value = editor(for: number) else { return }
        change(&value)
        editors[number] = value
        saveFailure = false
    }

    private func compactOfficialContext(holeNumber: Int) -> some View {
        let copy = ScoreHoleResultPresentation(official: presentation.officialHole(holeNumber), sides: presentation.sides)
        return VStack(alignment: .leading, spacing: 3) {
            Text(copy.resultText)
                .font(.caption.weight(.semibold))
                .foregroundStyle(BaggerPalette.ink)
                .accessibilityIdentifier("score.holeResult.result")
            if let net = copy.netText {
                Text(net)
                    .font(.caption)
                    .accessibilityIdentifier("score.holeResult.net")
            }
            if let authority = copy.authorityText {
                Text(authority)
                .font(.caption2)
                .accessibilityIdentifier("score.holeResult.authority")
            }
        }
        .foregroundStyle(BaggerPalette.muted)
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("score.holeResult")
    }

    private func saveDock(holeNumber: Int) -> some View {
        let current = editor(for: holeNumber)
        return VStack(spacing: 3) {
            Button {
                if current?.isCorrection == true {
                    correctionSaveHole = holeNumber
                    isCorrectionSavePresented = true
                } else {
                    saveAndAdvance(holeNumber: holeNumber)
                }
            } label: {
                HStack {
                    if isSaving { ProgressView().tint(.white) }
                    Text(isSaving ? "Saving on iPhone…" : current?.isCorrection == true ? "Save Correction" : holeNumber == presentation.canonicalHoleNumbers.last ? "Save Hole \(holeNumber)" : "Save & Next")
                        .font(.headline)
                }
                .frame(maxWidth: .infinity, minHeight: 56)
                .foregroundStyle(Color.white)
                .background(current?.canSave == true ? BaggerPalette.evergreen : BaggerPalette.muted,
                            in: RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
            .disabled(!allowsLocalIntentAdmission || isSaving || current?.canSave != true)
            .accessibilityIdentifier("score.saveNext")
            .accessibilityHint("Saves on this iPhone before advancing. Not Official until Bagger confirms it. Never finalizes the Match.")
            Text(saveFailure ? "Not saved. Your entries remain here. Try again." :
                    current?.hasChanges == true ? current?.isComplete == true ? "Ready · Not Official until confirmed" : "\(current?.enteredCount ?? 0) of \(current?.rows.count ?? 0) entered · Complete all scores" :
                    current?.isCorrection == true ? "Recorded scores · Select a target to correct" : "Enter gross scores · Save stays on this iPhone first")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(saveFailure ? BaggerPalette.liveRed : BaggerPalette.muted)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("score.saveState")
        }
        .padding(.horizontal, BaggerLayout.pageInset).padding(.vertical, 6)
        .background(BaggerPalette.canvas)
    }

    private func selectNextHole(after number: Int) {
        guard let index = presentation.canonicalHoleNumbers.firstIndex(of: number),
              presentation.canonicalHoleNumbers.indices.contains(index + 1)
        else { return }
        selectHoleForReview(presentation.canonicalHoleNumbers[index + 1])
    }

    private func selectPreviousHole(before number: Int) {
        guard let index = presentation.canonicalHoleNumbers.firstIndex(of: number), index > 0 else { return }
        selectHoleForReview(presentation.canonicalHoleNumbers[index - 1])
    }

    private func selectHoleForReview(_ number: Int) {
        selectedHole = number
        correctionFocusHole = presentation.officialHole(number) == nil ? nil : number
    }

    private var canChooseMatch: Bool {
        !isSaving && reviewRecordIDInFlight == nil && !presentation.isRefreshing &&
        !finalizationState.hasUnresolvedOutcome && !isFinalizeConfirmationPresented &&
        !queueState.isSuspended
    }

    private func requestMatchSelection() {
        guard canChooseMatch else { return }
        if editors.values.contains(where: \.hasChanges) { isDiscardMatchSelectionPresented = true }
        else { isMatchSelectionPresented = true }
    }

    @MainActor
    private func refreshCanonicalState() async {
        guard !isSaving else { return }
        if editors.values.contains(where: \.hasChanges) {
            isDiscardRefreshPresented = true
            return
        }
        editors.removeAll()
        await onRefresh()
    }

    private func saveAndAdvance(holeNumber: Int) {
        guard allowsLocalIntentAdmission,
              !isSaving,
              let draft = editor(for: holeNumber)?.saveDraft(),
              !draft.isEmpty
        else { return }
        isSaving = true
        saveFailure = false
        Task { @MainActor in
            defer { isSaving = false }
            do {
                _ = try await onSave(draft)
                editors.removeValue(forKey: holeNumber)
                correctionFocusHole = nil
                selectNextHole(after: holeNumber)
            } catch {
                saveFailure = true
            }
        }
    }

    private var pendingScorecardRecords: [ScoringQueueRecord] {
        guard let matchID = presentation.matchID else { return [] }
        return ScoringQueueUIProjection.latestUnresolvedPerHole(
            matchID: matchID,
            state: queueState
        )
    }

    private var allowsLocalIntentAdmission: Bool {
        guard presentation.canCreateDurableIntent,
              let matchID = presentation.matchID
        else { return false }
        return queueState.allowsNewLocalIntent(matchId: matchID)
    }

    private var finalizationUIModel: ScoringFinalizationUIModel {
        ScoringFinalizationUIModel.make(
            presentation: presentation,
            queueState: queueState,
            coordinatorState: finalizationState,
            liveFinalizationSendingEnabled: liveFinalizationSendingEnabled,
            hasActiveLocalReview: correctionFocusHole != nil || editors.values.contains(where: \.hasChanges)
        )
    }

    private func reviewQueueRecords(matchID: String) -> [ScoringQueueRecord] {
        ScoringQueueUIProjection.reviewRecords(matchID: matchID, state: queueState)
    }

    private func requestReviewAction(
        _ kind: PendingScoringReviewAction.Kind,
        for comparison: ScoringLocalIntentComparison
    ) {
        guard (kind == .keepOfficial && comparison.allowsKeepOfficial) ||
                (kind == .reapply && comparison.allowsReapply)
        else { return }
        pendingReviewAction = PendingScoringReviewAction(
            recordID: comparison.recordID,
            holeNumber: comparison.holeNumber,
            kind: kind
        )
        isReviewConfirmationPresented = true
    }

    private func performReviewAction(_ action: PendingScoringReviewAction) {
        guard reviewRecordIDInFlight == nil else { return }
        pendingReviewAction = nil
        reviewRecordIDInFlight = action.recordID
        reviewActionFailed = false
        Task { @MainActor in
            defer { reviewRecordIDInFlight = nil }
            do {
                switch action.kind {
                case .keepOfficial:
                    try await onKeepOfficial(action.recordID)
                case .reapply:
                    try await onReapplyMyScore(action.recordID)
                }
            } catch {
                reviewActionFailed = true
            }
        }
    }

    private func submitFinalization() {
        guard let matchID = presentation.matchID,
              finalizationUIModel.canRequestFinalization
        else { return }
        finalizationActionFailed = false
        Task { @MainActor in
            do {
                try await onFinalize(matchID)
            } catch {
                finalizationActionFailed = true
            }
        }
    }

    private func queueRecords(matchID: String) -> [ScoringQueueRecord] {
        ScoringQueueUIProjection.records(matchID: matchID, state: queueState)
    }

    private func unresolvedQueueCount(matchID: String) -> Int {
        queueRecords(matchID: matchID).filter(\.isUnresolved).count
    }

    private func queueAgeNotice(matchID: String) -> (title: String, message: String)? {
        let recordIDs = Set(queueRecords(matchID: matchID).map(\.localQueueRecordId))
        let support = recordIDs.compactMap { queueState.supportMetadataByRecordID[$0] }
        if support.contains(.ninetyDayGuidance) {
            return (
                "Unresolved score retained",
                "This score has remained unresolved for at least 90 days. It was not deleted or submitted automatically; contact Bagger support before resolving it."
            )
        }
        if support.contains(.thirtyDayGuidance) {
            return (
                "Unresolved score retained",
                "This score has remained unresolved for at least 30 days. It was not deleted; review it with Bagger support before taking action."
            )
        }
        if !recordIDs.isDisjoint(with: queueState.agedPendingRecordIDs) {
            return (
                "Older score recheck",
                "This saved score is more than six hours old. Bagger will refresh canonical Match state before any replay."
            )
        }
        return nil
    }

    private func latestQueueRecord(matchID: String, holeNumber: Int) -> ScoringQueueRecord? {
        queueRecords(matchID: matchID)
            .filter { $0.intent.holeNumber == holeNumber }
            .max { $0.sequence < $1.sequence }
    }

    private func reliabilityStatus(matchID: String, holeNumber: Int? = nil) -> ScoringReliabilityStatus {
        if queueState.lastPersistenceFailure || queueState.hasHiddenQuarantinedRecords {
            return .needsReview
        }
        let records = queueRecords(matchID: matchID).filter { record in
            holeNumber.map { record.intent.holeNumber == $0 } ?? true
        }
        if records.contains(where: { $0.state == .conflict || $0.state == .actionRequired || $0.state == .quarantined }) {
            if records.contains(where: { $0.stateReasonCode == .authentication }) { return .signInAgain }
            return .needsReview
        }
        if records.contains(where: { $0.state == .syncing || ($0.state == .acknowledged && $0.acknowledgement?.refreshPending == true) }) {
            return .syncing
        }
        if records.contains(where: { $0.state == .retryable }) {
            return queueState.isOffline ? .offline : .retrying
        }
        if records.contains(where: { $0.state == .queued }) {
            return queueState.isOffline ? .offline : .savedOnIPhone
        }
        if presentation.status == .final { return .matchFinal }
        if presentation.readOnly { return .readOnly }
        return .official
    }

    private func retryAction(matchID: String) -> (() -> Void)? {
        guard let record = queueRecords(matchID: matchID).first(where: { $0.state == .retryable }) else {
            return nil
        }
        return {
            Task { @MainActor in try? await onManualRetry(record.localQueueRecordId) }
        }
    }
}

private struct PendingScoringReviewAction: Equatable {
    enum Kind: Equatable {
        case keepOfficial
        case reapply
    }

    let recordID: String
    let holeNumber: Int
    let kind: Kind

    var buttonTitle: String {
        switch kind {
        case .keepOfficial: "Keep Official"
        case .reapply: "Reapply My Score"
        }
    }

    var message: String {
        switch kind {
        case .keepOfficial:
            "Your saved score for Hole \(holeNumber) will be discarded. Bagger’s Official score will remain unchanged."
        case .reapply:
            "Bagger will refresh the Match first, then create a new scoring intent with current canonical permission and revisions."
        }
    }
}

private struct ScoringReviewCenter: View {
    let comparisons: [ScoringLocalIntentComparison]
    let recordIDInFlight: String?
    let actionFailed: Bool
    let onKeepOfficial: (ScoringLocalIntentComparison) -> Void
    let onReapply: (ScoringLocalIntentComparison) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            BaggerSectionHeading("Needs Review")
            Text("Saved scores are listed oldest first. Bagger never overwrites a different Official score automatically.")
                .font(.footnote)
                .foregroundStyle(BaggerPalette.muted)
                .fixedSize(horizontal: false, vertical: true)

            ForEach(Array(comparisons.enumerated()), id: \.element.recordID) { index, comparison in
                ScoringReviewRecordCard(
                    comparison: comparison,
                    isWorking: recordIDInFlight == comparison.recordID,
                    onKeepOfficial: { onKeepOfficial(comparison) },
                    onReapply: { onReapply(comparison) }
                )
                if index < comparisons.count - 1 {
                    Divider().overlay(BaggerPalette.warmBorder)
                }
            }

            if actionFailed {
                Label("The review action could not be completed. Refresh Official scoring state and try again.", systemImage: "exclamationmark.triangle.fill")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(BaggerPalette.liveRed)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("score.review.error")
            }
        }
        .baggerCard(border: BaggerPalette.liveRed)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("score.review.center")
    }
}

private struct ScoringReviewRecordCard: View {
    let comparison: ScoringLocalIntentComparison
    let isWorking: Bool
    let onKeepOfficial: () -> Void
    let onReapply: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 11) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("Hole \(comparison.holeNumber)")
                    .font(.headline)
                    .foregroundStyle(BaggerPalette.ink)
                Spacer(minLength: 8)
                Text(stateLabel)
                    .font(.caption.weight(.black))
                    .foregroundStyle(BaggerPalette.deepEvergreen)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(BaggerPalette.scoreGold, in: Capsule())
            }

            Text(reasonMessage)
                .font(.footnote)
                .foregroundStyle(BaggerPalette.muted)
                .fixedSize(horizontal: false, vertical: true)

            ForEach(comparison.rows) { row in
                VStack(alignment: .leading, spacing: 4) {
                    Text(row.label)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(BaggerPalette.ink)
                    ViewThatFits(in: .horizontal) {
                        HStack(spacing: 16) {
                            scoreText("Official", value: row.officialGross)
                            scoreText("Your saved score", value: row.savedGross)
                        }
                        VStack(alignment: .leading, spacing: 3) {
                            scoreText("Official", value: row.officialGross)
                            scoreText("Your saved score", value: row.savedGross)
                        }
                    }
                }
                .accessibilityElement(children: .combine)
            }

            if isWorking {
                HStack(spacing: 8) {
                    ProgressView()
                    Text("Refreshing Official scoring state")
                        .font(.footnote.weight(.semibold))
                }
                .accessibilityElement(children: .combine)
            } else if comparison.allowsKeepOfficial || comparison.allowsReapply {
                VStack(spacing: 9) {
                    if comparison.allowsKeepOfficial {
                        Button("Keep Official", action: onKeepOfficial)
                            .buttonStyle(.bordered)
                            .tint(BaggerPalette.actionGreen)
                            .frame(maxWidth: .infinity, minHeight: 48)
                            .accessibilityHint("Discards your saved score without changing the Official score")
                            .accessibilityIdentifier("score.review.keep.\(comparison.recordID)")
                    }
                    if comparison.allowsReapply {
                        Button("Reapply My Score", action: onReapply)
                            .buttonStyle(.borderedProminent)
                            .tint(BaggerPalette.actionGreen)
                            .frame(maxWidth: .infinity, minHeight: 48)
                            .accessibilityHint("Refreshes canonical scoring state and creates a new scoring intent")
                            .accessibilityIdentifier("score.review.reapply.\(comparison.recordID)")
                    }
                }
            } else if comparison.state == .quarantined {
                Label("Automatic retry is disabled for this saved score.", systemImage: "hand.raised.fill")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(BaggerPalette.liveRed)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("score.review.record.\(comparison.recordID)")
    }

    private func scoreText(_ label: String, value: Int?) -> some View {
        Text("\(label): \(value.map(String.init) ?? "—")")
            .font(.subheadline.monospacedDigit())
            .foregroundStyle(label == "Official" ? BaggerPalette.actionGreen : BaggerPalette.goldText)
    }

    private var stateLabel: String {
        switch comparison.state {
        case .conflict: "CONFLICT"
        case .actionRequired: "ACTION REQUIRED"
        case .quarantined: "REVIEW ONLY"
        default: "NEEDS REVIEW"
        }
    }

    private var reasonMessage: String {
        switch comparison.reason {
        case .revision:
            "The Official score changed after this score was saved on the iPhone. Choose which intent to keep."
        case .authorization:
            "Scoring authorization changed. Your saved score was preserved and was not submitted again."
        case .readOnly, .finalized:
            "This Match is now read-only. Your saved score remains preserved for review."
        case .authentication, .identity, .identityChanged, .identityMismatch:
            "Bagger must restore the exact participant identity before this saved score can be reviewed."
        case .idempotencyConflict:
            "Bagger detected incompatible reuse of a mutation identity. This score will not retry automatically."
        case .invalidRecordOrContract, .unknownPermanentResponse, .staleIdempotencyUncertain, .queueHealth:
            "This saved score cannot be submitted safely without review."
        case .stale, .staleTournament:
            "This saved score is too old or belongs to a different tournament context for automatic submission."
        case .matchMissing:
            "The canonical Match is no longer available for this saved score."
        case .authRefresh, .environment, .unknownOutcome, .rebaseLimit, nil:
            "Bagger needs a fresh canonical review before any further score submission."
        }
    }
}

private struct ScoringFinalizationCard: View {
    let model: ScoringFinalizationUIModel
    let actionFailed: Bool
    let onRequestFinalization: () -> Void
    let onRefreshOfficialState: () -> Void

    @ViewBuilder
    var body: some View {
        if model.phase != .hidden {
            VStack(alignment: .leading, spacing: 7) {
              if model.canRequestFinalization {
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 10) { completionHeading; Spacer(minLength: 0); finalizeButton }
                    VStack(alignment: .leading, spacing: 6) { completionHeading; finalizeButton }
                }
              } else {
                HStack(spacing: 6) {
                    if isBusy {
                        ProgressView()
                            .accessibilityHidden(true)
                    } else {
                        Image(systemName: symbol)
                            .font(.caption)
                            .foregroundStyle(BaggerPalette.goldText)
                            .accessibilityHidden(true)
                    }
                    Text("Match Completion")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(BaggerPalette.ink)
                }
              }
                VStack(alignment: .leading, spacing: 3) {
                  if !model.canRequestFinalization {
                    Text(title)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(BaggerPalette.ink)
                  }
                    Text(message)
                        .font(.caption)
                        .foregroundStyle(BaggerPalette.muted)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("score.finalization.message")
                }

                if !model.canRequestFinalization && shouldOfferRefresh {
                    Button("Refresh Official Score", action: onRefreshOfficialState)
                        .buttonStyle(.bordered)
                        .controlSize(.large)
                        .tint(BaggerPalette.actionGreen)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .accessibilityIdentifier("score.finalize.refresh")
                }

                if actionFailed {
                    Text("Finalization did not begin. Official scoring state remains unchanged.")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(BaggerPalette.liveRed)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("score.finalize.error")
                }
            }
            .baggerCard(border: border)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("score.finalization")
        }
    }

    private var completionHeading: some View {
        Label("Match Completion", systemImage: "flag.checkered")
            .font(.subheadline.weight(.bold)).foregroundStyle(BaggerPalette.ink)
    }

    private var finalizeButton: some View {
        Button("Finalize Match", action: onRequestFinalization)
            .font(.subheadline.weight(.semibold))
            .buttonStyle(.bordered).controlSize(.large)
            .tint(BaggerPalette.actionGreen).frame(minHeight: 44)
            .accessibilityHint("Requires confirmation and an online canonical scoring check")
            .accessibilityIdentifier("score.finalize")
    }

    private var isBusy: Bool {
        model.phase == .submitting || model.phase == .reconciling
    }

    private var shouldOfferRefresh: Bool {
        if model.phase == .outcomeUnknown || model.phase == .acknowledgedRefreshPending { return true }
        if case .blocked(let blocker) = model.phase {
            return blocker == .canonicalUnavailable || blocker == .notReady
        }
        return false
    }

    private var title: String {
        switch model.phase {
        case .hidden: ""
        case .ready: "Ready to finalize"
        case .submitting: "Finalizing Match"
        case .reconciling: "Confirming Match Final"
        case .acknowledgedRefreshPending: "Finalization accepted"
        case .outcomeUnknown: "Finalization status unknown"
        case .confirmationRequired: "Confirmation required again"
        case .blocked(let blocker): blockerTitle(blocker)
        case .matchFinal: "Match Final"
        }
    }

    private var message: String {
        switch model.phase {
        case .hidden: ""
        case .ready:
            "All scores Official · Online-only; confirmation required."
        case .submitting:
            "Bagger is sending the explicit finalization request. Do not close the app."
        case .reconciling:
            "The request completed. Bagger is refreshing canonical scoring state before showing Match Final."
        case .acknowledgedRefreshPending:
            "Bagger accepted finalization. Refreshing canonical Match Final state; another finalization will not be sent."
        case .outcomeUnknown:
            "The response was interrupted. Refresh canonical scoring state; Bagger will not finalize again automatically."
        case .confirmationRequired:
            "The prior attempt did not finalize the Match. A new submission requires another explicit confirmation."
        case .blocked(let blocker): blockerMessage(blocker)
        case .matchFinal:
            "Canonical scoring state confirms this Match is final and read-only."
        }
    }

    private var symbol: String {
        switch model.phase {
        case .matchFinal: "checkmark.seal.fill"
        case .ready, .confirmationRequired: "flag.checkered"
        case .blocked, .outcomeUnknown: "exclamationmark.triangle.fill"
        case .submitting, .reconciling, .acknowledgedRefreshPending, .hidden: "arrow.triangle.2.circlepath"
        }
    }

    private var border: Color {
        switch model.phase {
        case .blocked, .outcomeUnknown: BaggerPalette.liveRed
        default: BaggerPalette.gold
        }
    }

    private func blockerTitle(_ blocker: ScoringFinalizationBlocker) -> String {
        switch blocker {
        case .queue: "Saved scores still need resolution"
        case .canonicalUnavailable: "Official scoring state unavailable"
        case .notReady: "Match not ready to finalize"
        case .readOnly: "Match is read-only"
        case .authentication: "Sign in again"
        case .authorization: "Finalization not authorized"
        case .lifecycle: "Match lifecycle changed"
        case .contract: "Finalization unavailable"
        }
    }

    private func blockerMessage(_ blocker: ScoringFinalizationBlocker) -> String {
        switch blocker {
        case .queue:
            "Every queued, syncing, retrying, acknowledged, conflicted, action-required, or quarantined score must be resolved before finalization."
        case .canonicalUnavailable:
            "Bagger needs a fresh online canonical Scorecard before finalization can begin."
        case .notReady:
            "The canonical Scorecard or Match permission does not currently allow finalization."
        case .readOnly:
            "Canonical permission is read-only. No finalization request will be sent."
        case .authentication:
            "Bagger must restore the exact authenticated participant before finalization."
        case .authorization:
            "The server does not authorize this participant to finalize the Match."
        case .lifecycle:
            "The canonical Match lifecycle changed. Refresh Official scoring state for the latest result."
        case .contract:
            "Bagger cannot safely construct a finalization request from the current scoring context."
        }
    }
}

private struct ScoreMatchContext: View {
    let presentation: ScoringPresentation
    let showsOfficial: Bool
    var onChooseMatch: (() -> Void)? = nil
    var switchingDisabled = false
    @Environment(\.scoreMatchDisplay) private var matchDisplay
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 10) {
                    heading
                    ScoreStatusPill(presentation: presentation)
                }
            } else {
                HStack(alignment: .top, spacing: 10) {
                    heading
                    Spacer(minLength: 8)
                    ScoreStatusPill(presentation: presentation)
                }
            }

            if let course = presentation.courseAndTeeText {
                HStack(spacing: 6) {
                    BaggerCourseLogo(
                        courseID: presentation.courseID ?? "",
                        courseName: presentation.courseName ?? "Course",
                        size: .small,
                        accessibility: .decorative
                    )
                    // Stay within the existing subheadline line box. The
                    // adjacent canonical text owns the VoiceOver identity.
                    .scaleEffect(18 / BaggerLogoSize.small.dimension)
                    .frame(width: 18, height: 18)
                    Text(course).fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("score.courseText")
                }
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(BaggerPalette.actionGreen)
                    .accessibilityElement(children: .contain)
                    .accessibilityIdentifier("score.courseContext")
            }
            if matchDisplay?.isCached == true {
                Text("Match context cached").font(.caption2).foregroundStyle(BaggerPalette.muted)
            }

            if let status = presentation.statusText ?? presentation.result?.title(sides: presentation.sides) {
                Text("\(showsOfficial ? "Official · " : "")\(status)")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(BaggerPalette.actionGreen)
                    .accessibilityIdentifier(showsOfficial ? "score.reliability.status" : "score.matchStatus")
            } else if showsOfficial {
                Text("Official").font(.caption.weight(.semibold))
                    .foregroundStyle(BaggerPalette.actionGreen)
                    .accessibilityIdentifier("score.reliability.status")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("score.matchContext")
    }

    @ViewBuilder private var heading: some View {
        if let onChooseMatch {
            Button(action: onChooseMatch) {
                HStack(spacing: 6) {
                    headingText
                    Image(systemName: "chevron.up.chevron.down").font(.caption.weight(.semibold)).accessibilityHidden(true)
                }
                .frame(minHeight: 44, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain).disabled(switchingDisabled)
            .accessibilityIdentifier("score.chooseMatch")
            .accessibilityHint("Choose from freshly verified score-authorized Matches")
        } else { headingText }
    }

    private var headingText: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text([presentation.roundText, presentation.format?.title].compactMap { $0 }.joined(separator: " · "))
                .font(.subheadline.weight(.bold))
                .foregroundStyle(BaggerPalette.ink)
                .fixedSize(horizontal: false, vertical: true)
            if let number = matchDisplay?.match.displayMatchNumber {
                Text("Match \(number)").font(.caption.weight(.semibold))
            }
        }
    }
}

private struct ScoreStatusPill: View {
    let presentation: ScoringPresentation

    var body: some View {
        if presentation.status == .live && !presentation.readOnly && !presentation.orientationOnly {
            BaggerStatusBadge(kind: .live)
                .accessibilityLabel("Match status: Live")
                .accessibilityIdentifier("score.status.live")
        } else {
            Text(label)
                .font(.caption.weight(.black))
                .foregroundStyle(foreground)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(background, in: Capsule())
                .fixedSize()
        }
    }

    private var label: String {
        if presentation.orientationOnly { return "OFFLINE" }
        if presentation.readOnly && presentation.status != .final { return "READ-ONLY" }
        return presentation.status?.title.uppercased() ?? "SCORING"
    }

    private var foreground: Color {
        presentation.status == .live && !presentation.readOnly ? .white : BaggerPalette.deepEvergreen
    }

    private var background: Color {
        presentation.status == .live && !presentation.readOnly ? BaggerPalette.liveRed : BaggerPalette.scoreGold
    }
}

private struct HoleNavigator: View {
    let holes: [ScoringCourseHolePresentation]
    let officialHoleNumbers: Set<Int>
    let currentHole: Int?
    let pendingHoleNumbers: Set<Int>
    @Binding var selectedHole: Int?
    @ScaledMetric(relativeTo: .headline) private var holeWidth: CGFloat = 44
    @ScaledMetric(relativeTo: .headline) private var holeHeight: CGFloat = 48

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(holes) { hole in
                            Button {
                                selectedHole = hole.holeNumber
                            } label: {
                                VStack(spacing: 3) {
                                    Text(String(hole.holeNumber))
                                        .font(.headline.monospacedDigit())
                                    if pendingHoleNumbers.contains(hole.holeNumber) || officialHoleNumbers.contains(hole.holeNumber) || currentHole == hole.holeNumber {
                                        Image(systemName: pendingHoleNumbers.contains(hole.holeNumber) ? "iphone" : officialHoleNumbers.contains(hole.holeNumber) ? "checkmark.circle.fill" : "flag.fill")
                                            .font(.caption2)
                                            .accessibilityHidden(true)
                                    }
                                }
                                .foregroundStyle(selectedHole == hole.holeNumber ? Color.white : BaggerPalette.deepEvergreen)
                                .frame(width: holeWidth, height: holeHeight)
                                .background(
                                    selectedHole == hole.holeNumber ? BaggerPalette.evergreen : BaggerPalette.paper,
                                    in: RoundedRectangle(cornerRadius: 14, style: .continuous)
                                )
                                .overlay {
                                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                                        .stroke(
                                            selectedHole == hole.holeNumber ? BaggerPalette.gold : BaggerPalette.warmBorder,
                                            lineWidth: selectedHole == hole.holeNumber ? 2 : 1
                                        )
                                }
                            }
                            .buttonStyle(.plain)
                            .id(hole.holeNumber)
                            .accessibilityLabel("Hole \(hole.holeNumber)\(officialHoleNumbers.contains(hole.holeNumber) ? ", official score recorded" : "")\(pendingHoleNumbers.contains(hole.holeNumber) ? ", saved on iPhone, not Official" : "")\(currentHole == hole.holeNumber ? ", canonical current hole" : "")")
                            .accessibilityAddTraits(selectedHole == hole.holeNumber ? .isSelected : [])
                            .accessibilityIdentifier("score.hole.\(hole.holeNumber)")
                        }
                    }
                    .padding(.vertical, 2)
                }
                .onChange(of: selectedHole) { value in
                    if let value { withAnimation { proxy.scrollTo(value, anchor: .center) } }
                }
                .onAppear {
                    if let selectedHole {
                        proxy.scrollTo(selectedHole, anchor: .center)
                    }
                }
            }
        }
        .accessibilityIdentifier("score.holeNavigator")
    }
}

private struct HoleHeader: View {
    let hole: ScoringCourseHolePresentation

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Hole \(hole.holeNumber) of 18")
                .font(.system(.title3, design: .serif, weight: .bold))
                .foregroundStyle(BaggerPalette.ink)
            if let context = hole.contextText {
                Text(context)
                    .font(.caption)
                    .foregroundStyle(BaggerPalette.actionGreen)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 2)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("score.holeHeader")
    }
}

private struct ScoringReliabilityStatusView: View {
    let status: ScoringReliabilityStatus
    let unresolvedCount: Int
    let onRetry: (() -> Void)?

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            Image(systemName: symbol)
                .font(.title3)
                .foregroundStyle(BaggerPalette.goldText)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(BaggerPalette.ink)
                    .accessibilityIdentifier("score.reliability.status")
                if unresolvedCount > 0 {
                    Text("\(unresolvedCount) local \(unresolvedCount == 1 ? "score" : "scores") not yet confirmed Official")
                        .font(.footnote)
                        .foregroundStyle(BaggerPalette.muted)
                        .accessibilityIdentifier("score.reliability.count")
                }
            }
            Spacer(minLength: 8)
            if let onRetry, status == .retrying || status == .offline {
                Button("Retry", action: onRetry)
                    .buttonStyle(.bordered)
                    .tint(BaggerPalette.actionGreen)
                    .accessibilityIdentifier("score.queue.retry")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 3)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("score.reliability")
    }

    private var title: String {
        switch status {
        case .official: "Official"
        case .savedOnIPhone: "Saved on iPhone"
        case .syncing: "Syncing"
        case .offline: "Offline · Saved on iPhone"
        case .retrying: "Waiting to sync"
        case .needsReview: "Needs Review"
        case .readOnly: "Read-only"
        case .matchFinal: "Match Final"
        case .signInAgain: "Sign in again"
        }
    }

    private var symbol: String {
        switch status {
        case .official: "checkmark.seal.fill"
        case .savedOnIPhone: "iphone"
        case .syncing: "arrow.triangle.2.circlepath"
        case .offline: "wifi.slash"
        case .retrying: "clock.arrow.circlepath"
        case .needsReview: "exclamationmark.triangle.fill"
        case .readOnly: "lock.fill"
        case .matchFinal: "flag.checkered"
        case .signInAgain: "person.crop.circle.badge.exclamationmark"
        }
    }
}

private struct LocalScoringIntentCard: View {
    let record: ScoringQueueRecord
    let status: ScoringReliabilityStatus

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            BaggerSectionHeading("Local Score Intent")
            HStack(alignment: .firstTextBaseline) {
                Text(statusTitle)
                    .font(.headline)
                    .foregroundStyle(BaggerPalette.actionGreen)
                Spacer(minLength: 8)
                Text("Not Official")
                    .font(.caption.weight(.black))
                    .foregroundStyle(BaggerPalette.deepEvergreen)
                    .padding(.horizontal, 9)
                    .padding(.vertical, 5)
                    .background(BaggerPalette.scoreGold, in: Capsule())
            }
            Text("Side 1: \(record.intent.teamOneGrossScores.map(String.init).joined(separator: " · "))")
                .font(.subheadline.monospacedDigit())
                .foregroundStyle(BaggerPalette.ink)
            Text("Side 2: \(record.intent.teamTwoGrossScores.map(String.init).joined(separator: " · "))")
                .font(.subheadline.monospacedDigit())
                .foregroundStyle(BaggerPalette.ink)
        }
        .baggerCard(border: BaggerPalette.gold)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("score.queue.intent.\(record.intent.holeNumber)")
    }

    private var statusTitle: String {
        switch status {
        case .savedOnIPhone, .offline: "Saved on iPhone"
        case .syncing: "Syncing"
        case .retrying: "Waiting to sync"
        case .needsReview: "Needs Review"
        case .signInAgain: "Sign in again"
        case .official: "Awaiting canonical refresh"
        case .readOnly: "Read-only"
        case .matchFinal: "Match Final"
        }
    }
}

private struct ScoreNotice: View {
    let symbol: String
    let title: String
    let message: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: symbol)
                .font(.title3)
                .foregroundStyle(BaggerPalette.goldText)
                .frame(width: 30)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(BaggerPalette.ink)
                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(BaggerPalette.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .baggerCard(border: BaggerPalette.matchBorder)
        .accessibilityElement(children: .combine)
    }
}

private struct ScoreEmptyState: View {
    let symbol: String
    let title: String
    let message: String

    var body: some View {
        ScoreNotice(symbol: symbol, title: title, message: message)
            .accessibilityIdentifier("score.empty")
    }
}

private struct ScoreRetryState: View {
    let title: String
    let message: String
    let onRetry: @MainActor @Sendable () async -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ScoreNotice(symbol: "exclamationmark.arrow.triangle.2.circlepath", title: title, message: message)
            Button("Try Again") { Task { await onRetry() } }
                .buttonStyle(.borderedProminent)
                .tint(BaggerPalette.actionGreen)
                .controlSize(.large)
                .accessibilityIdentifier("score.retry")
        }
    }
}

private struct ScoreLoadingCard: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ProgressView()
            Text("Loading official scoring state")
                .font(.headline)
                .foregroundStyle(BaggerPalette.ink)
            Text("Bagger is verifying your owned Match and scoring permission.")
                .font(.subheadline)
                .foregroundStyle(BaggerPalette.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .baggerCard()
        .accessibilityElement(children: .combine)
    }
}
