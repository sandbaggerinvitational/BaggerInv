import SwiftUI

struct ScoringScorecardView: View {
    let presentation: ScoringPresentation
    let selectedHole: Int?
    let pendingRecords: [ScoringQueueRecord]
    let onSelectHole: (Int) -> Void

    @Environment(\.dismiss) private var dismiss

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

                ForEach(Array(presentation.scorecardSections.enumerated()), id: \.offset) { _, section in
                    VStack(alignment: .leading, spacing: 10) {
                        BaggerSectionHeading(section.title)
                        VStack(spacing: 0) {
                            ForEach(Array(section.holes.enumerated()), id: \.element.id) { index, row in
                                Button {
                                    onSelectHole(row.hole.holeNumber)
                                    dismiss()
                                } label: {
                                    OfficialScorecardRow(
                                        row: row,
                                        sides: presentation.sides,
                                        isSelected: selectedHole == row.hole.holeNumber,
                                        pending: pendingRecord(for: row.hole.holeNumber).map {
                                            ScoringLocalIntentComparison.make(
                                                record: $0,
                                                presentation: presentation
                                            )
                                        }
                                    )
                                }
                                .buttonStyle(.plain)
                                .accessibilityHint("Returns to Hole \(row.hole.holeNumber)")
                                .accessibilityIdentifier("scorecard.hole.\(row.hole.holeNumber)")

                                if index < section.holes.count - 1 {
                                    Divider().overlay(BaggerPalette.warmBorder)
                                }
                            }
                        }
                        .baggerCard()
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
    }

    private var summary: some View {
        VStack(alignment: .leading, spacing: 11) {
            BaggerEyebrow(text: "Official Scorecard")
            Text([presentation.roundText, presentation.format?.title].compactMap { $0 }.joined(separator: " · "))
                .font(.system(.title2, design: .serif, weight: .bold))
                .foregroundStyle(BaggerPalette.ink)
            if let course = presentation.courseAndTeeText {
                Label(course, systemImage: "flag.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(BaggerPalette.actionGreen)
            }
            ForEach(presentation.sides) { side in
                Text("\(side.name): \(side.participants.map(\.displayName).joined(separator: " + "))")
                    .font(.subheadline)
                    .foregroundStyle(BaggerPalette.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let status = presentation.statusText {
                Label(status, systemImage: presentation.status == .final ? "checkmark.seal.fill" : "flag.fill")
                    .font(.headline)
                    .foregroundStyle(BaggerPalette.actionGreen)
            }
            if let result = presentation.result {
                Text("Result · \(result.title(sides: presentation.sides))")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(BaggerPalette.ink)
            }
            Text("Official server values only")
                .font(.caption.weight(.bold))
                .foregroundStyle(BaggerPalette.goldText)
        }
        .baggerCard(border: BaggerPalette.gold)
        .accessibilityElement(children: .combine)
    }

    private func pendingRecord(for holeNumber: Int) -> ScoringQueueRecord? {
        pendingRecords
            .filter { $0.intent.holeNumber == holeNumber && $0.isUnresolved }
            .max { $0.sequence < $1.sequence }
    }
}

private struct OfficialScorecardRow: View {
    let row: ScoringScorecardHolePresentation
    let sides: [ScoringSidePresentation]
    let isSelected: Bool
    let pending: ScoringLocalIntentComparison?

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(alignment: .firstTextBaseline) {
                Text("Hole \(row.hole.holeNumber)")
                    .font(.headline)
                    .foregroundStyle(BaggerPalette.ink)
                if isSelected {
                    Text("SELECTED")
                        .font(.caption2.weight(.black))
                        .foregroundStyle(BaggerPalette.deepEvergreen)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 3)
                        .background(BaggerPalette.scoreGold, in: Capsule())
                }
                Spacer(minLength: 8)
                Text(row.hole.contextText ?? "")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(BaggerPalette.muted)
                    .multilineTextAlignment(.trailing)
            }

            if let official = row.official {
                ForEach(official.sides, id: \.side) { sideValues in
                    VStack(alignment: .leading, spacing: 3) {
                        HStack(alignment: .firstTextBaseline) {
                            Text(sides.first(where: { $0.side == sideValues.side })?.name ?? "Side \(sideValues.side)")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(BaggerPalette.ink)
                            Spacer(minLength: 8)
                            Text("Gross \(sideValues.gross.map(String.init).joined(separator: " / "))")
                                .font(.subheadline.monospacedDigit())
                                .foregroundStyle(BaggerPalette.ink)
                        }
                        HStack(spacing: 12) {
                            Text("Strokes \(sideValues.strokes.map(ScoringNumberFormatter.string).joined(separator: " / "))")
                            Text(sideValues.net.map { "Net \(ScoringNumberFormatter.string($0))" } ?? "Net —")
                        }
                        .font(.caption)
                        .foregroundStyle(BaggerPalette.muted)
                    }
                }
                if let winner = official.winner {
                    Label("\(winner.title(sides: sides)) · Official", systemImage: "checkmark.seal.fill")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(BaggerPalette.actionGreen)
                }
            } else {
                Text("No official score")
                    .font(.subheadline)
                    .foregroundStyle(BaggerPalette.muted)
            }

            if let pending {
                ScorecardPendingIntentOverlay(comparison: pending)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 8)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilitySummary)
    }

    private var accessibilitySummary: String {
        var parts = ["Hole \(row.hole.holeNumber)"]
        if let context = row.hole.contextText { parts.append(context) }
        if let official = row.official {
            for side in official.sides {
                let name = sides.first(where: { $0.side == side.side })?.name ?? "Side \(side.side)"
                parts.append("\(name) gross \(side.gross.map(String.init).joined(separator: ", "))")
                if let net = side.net { parts.append("net \(ScoringNumberFormatter.string(net))") }
            }
            if let winner = official.winner { parts.append("\(winner.title(sides: sides)), official") }
        } else {
            parts.append("No official score")
        }
        if let pending {
            parts.append("Saved on iPhone, not Official")
            for local in pending.rows {
                parts.append("\(local.label), your saved score \(local.savedGross)")
            }
        }
        return parts.joined(separator: ", ")
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
