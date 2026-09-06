import SwiftUI

struct ScoringScorecardView: View {
    let presentation: ScoringPresentation
    let selectedHole: Int?
    let pendingRecords: [ScoringQueueRecord]
    let onSelectHole: (Int) -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(\.scoreMatchDisplay) private var matchDisplay
    @ScaledMetric(relativeTo: .caption) private var minimumCellWidth: CGFloat = 62
    @ScaledMetric(relativeTo: .caption) private var minimumBandHeight: CGFloat = 44
    @State private var measuredCellWidth: CGFloat = 0
    @State private var measuredBandHeight: CGFloat = 0

    init(
        presentation: ScoringPresentation,
        selectedHole: Int?,
        pendingRecords: [ScoringQueueRecord] = [],
        onSelectHole: @escaping (Int) -> Void
    ) {
        self.presentation = presentation
        self.selectedHole = selectedHole
        self.pendingRecords = pendingRecords
        self.onSelectHole = onSelectHole
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: BaggerLayout.sectionSpacing) {
                summary

                VStack(alignment: .leading, spacing: 8) {
                    Text("Review or correct a hole").font(.subheadline.weight(.semibold))
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 44))], spacing: 6) {
                        ForEach(presentation.reviewHoles) { hole in
                            Button {
                                onSelectHole(hole.holeNumber)
                                dismiss()
                            } label: {
                                Text(String(hole.holeNumber)).font(.headline.monospacedDigit())
                                    .frame(maxWidth: .infinity, minHeight: 44)
                                    .background(selectedHole == hole.holeNumber ? BaggerPalette.scoreGold : BaggerPalette.paper,
                                                in: RoundedRectangle(cornerRadius: 8))
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Hole \(hole.holeNumber)\(pendingRecord(for: hole.holeNumber) != nil ? ", saved on iPhone, not Official" : presentation.officialHoleNumbers.contains(hole.holeNumber) ? ", Official" : ", not recorded")")
                            .accessibilityHint("Returns to this hole; does not change scores")
                            .accessibilityAddTraits(selectedHole == hole.holeNumber ? .isSelected : [])
                            .accessibilityIdentifier("scorecard.hole.\(hole.holeNumber)")
                        }
                    }
                }
                ForEach(ScoreGolfScorecardPresentation.make(presentation)) { nine in
                    ScorecardNineView(nine: nine,
                                      cellWidth: max(minimumCellWidth, measuredCellWidth + 16),
                                      bandHeight: max(minimumBandHeight, measuredBandHeight),
                                      identifierPrefix: "scorecard.grid")
                }
                Text("• Applied stroke · ½ Halved · — Unavailable\nOnly Official server values appear in the grid.")
                    .font(.caption).foregroundStyle(BaggerPalette.muted)
                ForEach(pendingRecords.filter(\.isUnresolved), id: \.localQueueRecordId) { record in
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Hole \(record.intent.holeNumber) · Local score").font(.subheadline.weight(.semibold))
                        ScorecardPendingIntentOverlay(comparison: ScoringLocalIntentComparison.make(record: record, presentation: presentation))
                    }
                }
            }
            .padding(.horizontal, BaggerLayout.pageInset)
            .padding(.top, 12)
            .padding(.bottom, 30)
        }
        .background(BaggerPalette.canvas.ignoresSafeArea())
        .navigationTitle("Scorecard")
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("scorecard.screen")
        .onPreferenceChange(ScorecardNaturalCellWidth.self) { measuredCellWidth = $0 }
        .onPreferenceChange(ScorecardNaturalBandHeight.self) { measuredBandHeight = $0 }
    }

    private var summary: some View {
        ScorecardIdentityHeader(header: .init(score: presentation, context: matchDisplay))
    }

    private func pendingRecord(for holeNumber: Int) -> ScoringQueueRecord? {
        pendingRecords
            .filter { $0.intent.holeNumber == holeNumber && $0.isUnresolved }
            .max { $0.sequence < $1.sequence }
    }
}

private struct ScorecardIdentityHeader: View {
    let header: ScorecardIdentityHeaderPresentation
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            VStack(alignment: .leading, spacing: 3) {
                BaggerEyebrow(text: "Official Scorecard")
                Text(header.roundAndFormat)
                    .font(.subheadline.weight(.bold))
                    .accessibilityIdentifier("scorecard.header.context")
                if let number = header.matchNumberText {
                    Text(number).font(.caption.weight(.semibold))
                        .accessibilityIdentifier("scorecard.header.matchNumber")
                }
            }
            if let course = header.courseAndTeeText {
                HStack(spacing: 6) {
                    BaggerCourseLogo(courseID: header.courseID ?? "", courseName: header.courseName ?? "Course",
                                     size: .small, accessibility: .decorative)
                        .scaleEffect(18 / BaggerLogoSize.small.dimension)
                        .frame(width: 18, height: 18)
                    Text(course).font(.subheadline.weight(.semibold))
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("scorecard.header.course")
                }
                .foregroundStyle(BaggerPalette.actionGreen)
            }
            if !header.sides.isEmpty {
                VStack(alignment: .leading, spacing: 5) {
                    if dynamicTypeSize.isAccessibilitySize {
                        VStack(alignment: .leading, spacing: 5) { teams }
                    } else {
                        HStack(alignment: .center, spacing: 8) { teams }
                    }
                    ForEach(header.sides) { side in
                        let names = header.playerNames(for: side)
                        if !names.isEmpty {
                            Text(names).font(.caption)
                                .foregroundStyle(BaggerPalette.muted)
                                .fixedSize(horizontal: false, vertical: true)
                                .accessibilityLabel("\(side.name) players: \(names)")
                                .accessibilityIdentifier("scorecard.header.players.\(side.side)")
                        }
                    }
                }
            }
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 5) { result; official }
            } else {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    result
                    Spacer(minLength: 0)
                    official
                }
            }
        }
        .foregroundStyle(BaggerPalette.ink)
        .frame(maxWidth: .infinity, alignment: .leading)
        .baggerCard(border: BaggerPalette.gold)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("scorecard.header")
    }

    @ViewBuilder private var teams: some View {
        ForEach(Array(header.sides.enumerated()), id: \.element.id) { index, side in
            if index > 0 {
                Text("vs").font(.caption.weight(.semibold)).foregroundStyle(BaggerPalette.muted)
                    .accessibilityLabel("versus")
            }
            HStack(spacing: 6) {
                BaggerTeamLogo(teamID: side.teamID ?? "", teamName: side.name, size: .small, accessibility: .decorative)
                    .scaleEffect(0.75).frame(width: 24, height: 24)
                Text(side.name).font(.subheadline.weight(.bold))
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("scorecard.header.team.\(side.side)")
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    @ViewBuilder private var result: some View {
        if let text = header.resultText {
            Text(text).font(.footnote.weight(.semibold))
                .foregroundStyle(BaggerPalette.actionGreen)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("scorecard.header.result")
        }
    }

    private var official: some View {
        Text("Official").font(.caption2.weight(.bold))
            .foregroundStyle(BaggerPalette.goldText)
            .padding(.horizontal, 6).padding(.vertical, 3)
            .background(BaggerPalette.paper, in: Capsule())
            .fixedSize()
            .accessibilityIdentifier("scorecard.header.official")
    }
}

private struct ScorecardPendingIntentOverlay: View {
    let comparison: ScoringLocalIntentComparison

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Label(statusTitle, systemImage: comparison.state == .conflict ? "exclamationmark.triangle.fill" : "iphone")
                .font(.caption.weight(.bold))
                .foregroundStyle(comparison.state == .conflict ? BaggerPalette.liveRed : BaggerPalette.goldText)
            ForEach(comparison.rows) { row in
                Text("\(row.label) · Official \(row.officialGross.map(String.init) ?? "—") · Your saved score \(row.savedGross)")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(BaggerPalette.ink)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Text("Not Official")
                .font(.caption2.weight(.black))
                .foregroundStyle(BaggerPalette.deepEvergreen)
                .padding(.horizontal, 7)
                .padding(.vertical, 3)
                .background(BaggerPalette.scoreGold, in: Capsule())
        }
        .padding(9)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(BaggerPalette.cream, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(BaggerPalette.gold, lineWidth: 1)
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("scorecard.local.\(comparison.holeNumber)")
    }

    private var statusTitle: String {
        switch comparison.state {
        case .conflict, .actionRequired, .quarantined: "Needs Review"
        case .syncing, .acknowledged: "Syncing"
        case .retryable: "Waiting to sync"
        case .queued: "Saved on iPhone"
        case .resolved: "Resolved"
        }
    }
}
