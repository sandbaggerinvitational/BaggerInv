import SwiftUI

struct ScoreScreen: View {
    let presentation: ScoringPresentation
    let onRefresh: @MainActor @Sendable () async -> Void

    @State private var selectedHole: Int?
    @State private var drafts: [Int: ScoringDraft] = [:]
    @State private var pickerTarget: ScoringPickerTarget?

    init(
        presentation: ScoringPresentation,
        onRefresh: @escaping @MainActor @Sendable () async -> Void
    ) {
        self.presentation = presentation
        self.onRefresh = onRefresh
        _selectedHole = State(initialValue: presentation.initialSelectedHole())
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: BaggerLayout.sectionSpacing) {
                header

                if presentation.orientationOnly {
                    ScoreNotice(
                        symbol: "wifi.slash",
                        title: orientationNoticeTitle,
                        message: "The last official snapshot remains visible for orientation. Nothing entered here is saved."
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
        .sheet(item: $pickerTarget) { target in
            GrossScorePicker(
                target: target,
                onApply: { value in setDraft(value, for: target.row) }
            )
            .presentationDetents([.medium])
        }
        .onChange(of: presentation.canonicalVersion) { _ in
            drafts.removeAll()
            pickerTarget = nil
            reconcileSelection()
        }
        .onChange(of: presentation.canonicalHoleNumbers) { _ in
            reconcileSelection()
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
            ScoreMatchContext(presentation: presentation)

            availabilityNotice

            if let activeHoleNumber = effectiveSelectedHole,
               let hole = presentation.hole(activeHoleNumber)
            {
                HoleNavigator(
                    holes: presentation.reviewHoles,
                    officialHoleNumbers: presentation.officialHoleNumbers,
                    selectedHole: selectedHoleBinding
                )

                HoleHeader(hole: hole)

                HoleStepControls(
                    canGoPrevious: presentation.canonicalHoleNumbers.first != hole.holeNumber,
                    canGoNext: presentation.canonicalHoleNumbers.last != hole.holeNumber,
                    onPrevious: { selectPreviousHole(before: hole.holeNumber) },
                    onNext: { selectNextHole(after: hole.holeNumber) }
                )

                NavigationLink {
                    ScoringScorecardView(
                        presentation: presentation,
                        selectedHole: activeHoleNumber,
                        onSelectHole: { self.selectedHole = $0 }
                    )
                } label: {
                    Label("Scorecard", systemImage: "list.bullet.clipboard.fill")
                        .font(.headline)
                        .frame(maxWidth: .infinity, minHeight: 48)
                }
                .buttonStyle(.bordered)
                .tint(BaggerPalette.actionGreen)
                .accessibilityIdentifier("score.scorecard.quick")
                .accessibilityHint("Opens the official Scorecard")

                if presentation.format?.isSupported == false {
                    ScoreNotice(
                        symbol: "exclamationmark.shield",
                        title: "Read-only format",
                        message: "This Match format is not supported for native score entry. Official Scorecard review remains available."
                    )
                } else {
                    ScoreRowsSection(
                        presentation: presentation,
                        hole: hole,
                        draft: drafts[hole.holeNumber],
                        onDecrement: { adjust($0, by: -1, hole: hole) },
                        onIncrement: { adjust($0, by: 1, hole: hole) },
                        onChoose: { openPicker(for: $0, hole: hole) },
                        onDiscard: { drafts.removeValue(forKey: hole.holeNumber) }
                    )
                }

                CanonicalHoleContext(
                    presentation: presentation,
                    holeNumber: hole.holeNumber
                )

                if presentation.availability == .active {
                    SaveAndNextPreview(
                        hasDraft: drafts[hole.holeNumber]?.isEmpty == false,
                        isEditable: presentation.isEditable,
                        onNext: { selectNextHole(after: hole.holeNumber) }
                    )
                }
            } else {
                ScoreNotice(
                    symbol: "flag.checkered",
                    title: "Scorecard orientation unavailable",
                    message: "This canonical scoring snapshot does not currently include hole details."
                )
            }

            NavigationLink {
                ScoringScorecardView(
                    presentation: presentation,
                    selectedHole: effectiveSelectedHole,
                    onSelectHole: { selectedHole = $0 }
                )
            } label: {
                HStack(spacing: 12) {
                    Image(systemName: "list.bullet.clipboard.fill")
                        .font(.title2)
                        .foregroundStyle(BaggerPalette.goldText)
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Official Scorecard")
                            .font(.headline)
                            .foregroundStyle(BaggerPalette.ink)
                        Text("Review canonical hole scores and Match state")
                            .font(.footnote)
                            .foregroundStyle(BaggerPalette.muted)
                    }
                    Spacer(minLength: 8)
                    Image(systemName: "chevron.right")
                        .foregroundStyle(BaggerPalette.actionGreen)
                }
                .baggerCard(border: BaggerPalette.matchBorder)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("score.scorecard")
            .accessibilityHint("Opens the official Scorecard")
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

    private var orientationNoticeTitle: String {
        presentation.safeErrorCode == nil ? "Offline · scoring unavailable" : "Scoring unavailable · orientation only"
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
            set: { selectedHole = $0 }
        )
    }

    private func reconcileSelection() {
        selectedHole = presentation.reconciledSelectedHole(selectedHole)
        drafts = drafts.filter { presentation.isDraftCompatible($0.value) }
    }

    private func ensureDraft(for hole: ScoringCourseHolePresentation) -> ScoringDraft? {
        if let existing = drafts[hole.holeNumber], presentation.isDraftCompatible(existing) {
            return existing
        }
        return presentation.makeDraft(for: hole.holeNumber)
    }

    private func adjust(_ row: ScoringInputRowPresentation, by delta: Int, hole: ScoringCourseHolePresentation) {
        guard var draft = ensureDraft(for: hole) else { return }
        let defaultGross = hole.par.map { Int($0.rounded()) } ?? 4
        if ScoringInteraction.displayedGross(for: row, draft: draft) == nil {
            let next = min(
                max(defaultGross + delta, ScoringPresentation.minimumGross),
                ScoringPresentation.maximumGross
            )
            draft.set(next == row.officialGross ? nil : next, for: row.key)
        } else {
            draft = ScoringInteraction.changing(row: row, by: delta, in: draft, defaultValue: defaultGross)
        }
        if draft.isEmpty {
            drafts.removeValue(forKey: hole.holeNumber)
        } else {
            drafts[hole.holeNumber] = draft
        }
    }

    private func openPicker(for row: ScoringInputRowPresentation, hole: ScoringCourseHolePresentation) {
        guard presentation.isEditable else { return }
        let draft = ensureDraft(for: hole)
        let value = ScoringInteraction.displayedGross(for: row, draft: draft) ?? hole.par.map { Int($0.rounded()) } ?? 4
        pickerTarget = ScoringPickerTarget(row: row, holeNumber: hole.holeNumber, initialValue: value)
    }

    private func setDraft(_ value: Int, for row: ScoringInputRowPresentation) {
        guard presentation.isEditable,
              let target = pickerTarget,
              let hole = presentation.hole(target.holeNumber),
              presentation.inputRows(for: target.holeNumber).contains(where: { $0.key == row.key }),
              var draft = ensureDraft(for: hole)
        else { return }
        draft.set(value == row.officialGross ? nil : value, for: row.key)
        if draft.isEmpty {
            drafts.removeValue(forKey: hole.holeNumber)
        } else {
            drafts[hole.holeNumber] = draft
        }
    }

    private func selectNextHole(after number: Int) {
        guard let index = presentation.canonicalHoleNumbers.firstIndex(of: number),
              presentation.canonicalHoleNumbers.indices.contains(index + 1)
        else { return }
        selectedHole = presentation.canonicalHoleNumbers[index + 1]
    }

    private func selectPreviousHole(before number: Int) {
        guard let index = presentation.canonicalHoleNumbers.firstIndex(of: number), index > 0 else { return }
        selectedHole = presentation.canonicalHoleNumbers[index - 1]
    }

    @MainActor
    private func refreshCanonicalState() async {
        // Step 2E drafts are intentionally ephemeral. An explicit canonical
        // refresh discards them even when the server snapshot is unchanged.
        drafts.removeAll()
        pickerTarget = nil
        await onRefresh()
    }
}

private struct HoleStepControls: View {
    let canGoPrevious: Bool
    let canGoNext: Bool
    let onPrevious: () -> Void
    let onNext: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Button(action: onPrevious) {
                Label("Previous", systemImage: "chevron.left")
                    .frame(maxWidth: .infinity, minHeight: 48)
            }
            .disabled(!canGoPrevious)
            .accessibilityLabel("Previous hole")
            .accessibilityIdentifier("score.previousHole")

            Button(action: onNext) {
                Label("Next", systemImage: "chevron.right")
                    .frame(maxWidth: .infinity, minHeight: 48)
            }
            .disabled(!canGoNext)
            .accessibilityLabel("Next hole")
            .accessibilityIdentifier("score.nextHole")
        }
        .buttonStyle(.bordered)
        .tint(BaggerPalette.actionGreen)
    }
}

private struct ScoreMatchContext: View {
    let presentation: ScoringPresentation
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        VStack(alignment: .leading, spacing: 13) {
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
                Label(course, systemImage: "flag.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(BaggerPalette.actionGreen)
            }

            VStack(spacing: 0) {
                ForEach(Array(presentation.sides.enumerated()), id: \.element.id) { index, side in
                    VStack(alignment: .leading, spacing: 5) {
                        Text(side.name)
                            .font(.headline)
                            .foregroundStyle(BaggerPalette.ink)
                        Text(side.participants.map(\.displayName).joined(separator: " + "))
                            .font(.subheadline)
                            .foregroundStyle(BaggerPalette.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 9)
                    if index < presentation.sides.count - 1 {
                        Divider().overlay(BaggerPalette.warmBorder)
                    }
                }
            }

            if presentation.status == .final, let result = presentation.result {
                Label(result.title(sides: presentation.sides), systemImage: "checkmark.seal.fill")
                    .font(.headline)
                    .foregroundStyle(BaggerPalette.actionGreen)
            }
        }
        .baggerCard(border: BaggerPalette.gold)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("score.matchContext")
    }

    private var heading: some View {
        VStack(alignment: .leading, spacing: 4) {
            BaggerEyebrow(text: "Your Match")
            Text([presentation.roundText, presentation.format?.title].compactMap { $0 }.joined(separator: " · "))
                .font(.system(.title3, design: .serif, weight: .bold))
                .foregroundStyle(BaggerPalette.ink)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

private struct ScoreStatusPill: View {
    let presentation: ScoringPresentation

    var body: some View {
        Text(label)
            .font(.caption.weight(.black))
            .foregroundStyle(foreground)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(background, in: Capsule())
            .fixedSize()
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
    @Binding var selectedHole: Int?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            BaggerSectionHeading("Select Hole")
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
                                    if officialHoleNumbers.contains(hole.holeNumber) {
                                        Image(systemName: "checkmark.circle.fill")
                                            .font(.caption2)
                                            .accessibilityHidden(true)
                                    }
                                }
                                .foregroundStyle(selectedHole == hole.holeNumber ? Color.white : BaggerPalette.deepEvergreen)
                                .frame(width: 52, height: 52)
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
                            .accessibilityLabel("Hole \(hole.holeNumber)\(officialHoleNumbers.contains(hole.holeNumber) ? ", official score recorded" : "")")
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
            BaggerEyebrow(text: "Current Selection")
            Text("Hole \(hole.holeNumber)")
                .font(.system(.largeTitle, design: .serif, weight: .bold))
                .foregroundStyle(BaggerPalette.ink)
            if let context = hole.contextText {
                Text(context)
                    .font(.headline)
                    .foregroundStyle(BaggerPalette.actionGreen)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 2)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("score.holeHeader")
    }
}

private struct ScoreRowsSection: View {
    let presentation: ScoringPresentation
    let hole: ScoringCourseHolePresentation
    let draft: ScoringDraft?
    let onDecrement: (ScoringInputRowPresentation) -> Void
    let onIncrement: (ScoringInputRowPresentation) -> Void
    let onChoose: (ScoringInputRowPresentation) -> Void
    let onDiscard: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(presentation.sides) { side in
                VStack(alignment: .leading, spacing: 8) {
                    Text(side.name.uppercased())
                        .font(.caption.weight(.black))
                        .foregroundStyle(BaggerPalette.goldText)

                    ForEach(rows(for: side.side)) { row in
                        GrossScoreControl(
                            row: row,
                            displayedGross: ScoringInteraction.displayedGross(for: row, draft: draft),
                            isEdited: ScoringInteraction.isEdited(row: row, draft: draft),
                            isEditable: presentation.isEditable,
                            onDecrement: { onDecrement(row) },
                            onIncrement: { onIncrement(row) },
                            onChoose: { onChoose(row) }
                        )
                    }
                }
            }

            if draft?.isEmpty == false {
                HStack(alignment: .center, spacing: 10) {
                    Label("Edited · Not saved", systemImage: "pencil.circle.fill")
                        .font(.footnote.weight(.bold))
                        .foregroundStyle(BaggerPalette.goldText)
                    Spacer()
                    Button("Discard edits", action: onDiscard)
                        .font(.footnote.weight(.bold))
                        .foregroundStyle(BaggerPalette.actionGreen)
                }
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("score.draftNotice")
            }
        }
        .baggerCard()
        .accessibilityIdentifier("score.controls")
    }

    private func rows(for side: Int) -> [ScoringInputRowPresentation] {
        presentation.inputRows(for: hole.holeNumber).filter { $0.key.side == side }
    }
}

private struct GrossScoreControl: View {
    let row: ScoringInputRowPresentation
    let displayedGross: Int?
    let isEdited: Bool
    let isEditable: Bool
    let onDecrement: () -> Void
    let onIncrement: () -> Void
    let onChoose: () -> Void

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(row.title)
                            .font(.headline)
                            .foregroundStyle(BaggerPalette.ink)
                            .fixedSize(horizontal: false, vertical: true)
                        if row.isAuthenticatedPlayer {
                            Text("YOU")
                                .font(.caption2.weight(.black))
                                .foregroundStyle(BaggerPalette.deepEvergreen)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 3)
                                .background(BaggerPalette.scoreGold, in: Capsule())
                        }
                    }
                    if let detail = row.detail, !detail.isEmpty {
                        Text(detail)
                            .font(.caption)
                            .foregroundStyle(BaggerPalette.muted)
                    }
                }
                Spacer(minLength: 6)
                if let strokes = row.canonicalStrokes, strokes != 0 {
                    Text("+\(ScoringNumberFormatter.string(strokes)) stroke\(strokes == 1 ? "" : "s")")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(BaggerPalette.actionGreen)
                }
            }

            if dynamicTypeSize.isAccessibilitySize {
                scoreControls
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                scoreControls
            }

            Text(stateText)
                .font(.caption.weight(.semibold))
                .foregroundStyle(isEdited ? BaggerPalette.goldText : BaggerPalette.muted)
        }
        .padding(.vertical, 5)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("score.input.side\(row.key.side).slot\(row.key.slot)")
    }

    private var scoreControls: some View {
        HStack(spacing: 12) {
            ScoreAdjustmentButton(
                symbol: "minus",
                label: "Decrease \(row.title) gross score",
                enabled: isEditable && (displayedGross ?? ScoringPresentation.maximumGross) > ScoringPresentation.minimumGross,
                action: onDecrement
            )

            Button(action: onChoose) {
                Text(displayedGross.map(String.init) ?? "—")
                    .font(.system(size: 34, weight: .black, design: .rounded).monospacedDigit())
                    .foregroundStyle(isEditable ? BaggerPalette.deepEvergreen : BaggerPalette.muted)
                    .frame(minWidth: 76, minHeight: 56)
                    .background(BaggerPalette.cream, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .stroke(isEdited ? BaggerPalette.gold : BaggerPalette.warmBorder, lineWidth: isEdited ? 2 : 1)
                    }
            }
            .buttonStyle(.plain)
            .disabled(!isEditable)
            .accessibilityLabel("\(row.title) gross score")
            .accessibilityValue(accessibilityValue)
            .accessibilityHint(isEditable ? "Opens score selector" : "Official value, read-only")

            ScoreAdjustmentButton(
                symbol: "plus",
                label: "Increase \(row.title) gross score",
                enabled: isEditable && (displayedGross ?? 0) < ScoringPresentation.maximumGross,
                action: onIncrement
            )
        }
    }

    private var stateText: String {
        if isEdited { return "Edited · Not saved" }
        if row.officialGross != nil { return "Official" }
        return isEditable ? "No official score" : "Read-only · No official score"
    }

    private var accessibilityValue: String {
        let value = displayedGross.map(String.init) ?? "not entered"
        return "\(value), \(stateText.lowercased())"
    }
}

private struct ScoreAdjustmentButton: View {
    let symbol: String
    let label: String
    let enabled: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.title2.weight(.black))
                .foregroundStyle(enabled ? Color.white : BaggerPalette.muted)
                .frame(width: 56, height: 56)
                .background(enabled ? BaggerPalette.evergreen : BaggerPalette.cream, in: Circle())
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .accessibilityLabel(label)
    }
}

private struct CanonicalHoleContext: View {
    let presentation: ScoringPresentation
    let holeNumber: Int

    var body: some View {
        let official = presentation.officialHole(holeNumber)
        VStack(alignment: .leading, spacing: 10) {
            BaggerSectionHeading("Official Hole Context")
            if let official {
                ForEach(official.sides, id: \.side) { side in
                    HStack(alignment: .firstTextBaseline) {
                        Text(presentation.sides.first(where: { $0.side == side.side })?.name ?? "Side \(side.side)")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(BaggerPalette.ink)
                        Spacer(minLength: 8)
                        Text(side.net.map { "Net \(ScoringNumberFormatter.string($0))" } ?? "Net —")
                            .font(.subheadline.monospacedDigit())
                            .foregroundStyle(BaggerPalette.muted)
                    }
                }
                if let winner = official.winner {
                    Label("\(winner.title(sides: presentation.sides)) · Official", systemImage: "checkmark.seal.fill")
                        .font(.footnote.weight(.bold))
                        .foregroundStyle(BaggerPalette.actionGreen)
                }
            } else {
                Text("No official score has been recorded for this hole.")
                    .font(.subheadline)
                    .foregroundStyle(BaggerPalette.muted)
            }
        }
        .baggerCard()
        .accessibilityElement(children: .combine)
    }
}

private struct SaveAndNextPreview: View {
    let hasDraft: Bool
    let isEditable: Bool
    let onNext: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button(action: onNext) {
                Text(hasDraft ? "Save & Next · Not available yet" : "Save & Next")
                    .font(.headline)
                    .frame(maxWidth: .infinity, minHeight: 54)
            }
            .buttonStyle(.borderedProminent)
            .tint(BaggerPalette.actionGreen)
            .disabled(true)
            .accessibilityHint("Official score submission arrives in a later Preview step")
            .accessibilityIdentifier("score.saveNext")

            Text(isEditable
                 ? "Preview edits stay on this screen only. They are not saved or official."
                 : "Official scoring changes are not available in this state.")
                .font(.footnote)
                .foregroundStyle(BaggerPalette.muted)
                .fixedSize(horizontal: false, vertical: true)
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

private struct ScoringPickerTarget: Identifiable {
    let row: ScoringInputRowPresentation
    let holeNumber: Int
    let initialValue: Int

    var id: String { "\(holeNumber):\(row.key.side):\(row.key.slot)" }
}

private struct GrossScorePicker: View {
    let target: ScoringPickerTarget
    let onApply: (Int) -> Void

    @State private var selection: Int
    @Environment(\.dismiss) private var dismiss

    init(target: ScoringPickerTarget, onApply: @escaping (Int) -> Void) {
        self.target = target
        self.onApply = onApply
        _selection = State(initialValue: min(max(target.initialValue, ScoringPresentation.minimumGross), ScoringPresentation.maximumGross))
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 8) {
                Text("Hole \(target.holeNumber) · \(target.row.title)")
                    .font(.headline)
                    .foregroundStyle(BaggerPalette.ink)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
                Picker("Gross score", selection: $selection) {
                    ForEach(ScoringPresentation.minimumGross...ScoringPresentation.maximumGross, id: \.self) { score in
                        Text(String(score)).tag(score)
                    }
                }
                .pickerStyle(.wheel)
                .accessibilityValue(String(selection))
            }
            .background(BaggerPalette.canvas.ignoresSafeArea())
            .navigationTitle("Choose Gross Score")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Apply") {
                        onApply(selection)
                        dismiss()
                    }
                }
            }
        }
    }
}
