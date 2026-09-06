import SwiftUI

/// Shared, local-only target/keypad grammar for BB, Scramble and Singles.
struct ScoreEntryControls: View {
    let presentation: ScoringPresentation
    let holeNumber: Int
    let editor: ScoreEntryEditor?
    let enabled: Bool
    let correctionActive: Bool
    let onFinishReview: () -> Void
    let onSelect: (ScoringInputKey) -> Void
    let onAction: (ScoreEntryEditor.Action) -> Void
    let onDiscard: () -> Void
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.scoreMatchDisplay) private var matchDisplay
    @AccessibilityFocusState private var focusedKey: ScoringInputKey?

    private var rows: [ScoringInputRowPresentation] { presentation.inputRows(for: holeNumber) }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if editor?.isCorrection == true {
                HStack(alignment: .center, spacing: 8) {
                  VStack(alignment: .leading, spacing: 2) {
                    Text(correctionActive ? ScoreCorrectionCopy.title(holeNumber: holeNumber) : "RECORDED HOLE \(holeNumber)")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(BaggerPalette.goldText)
                        .accessibilityIdentifier("score.correction.title")
                    Text(ScoreCorrectionCopy.message(hasOfficialScores: rows.contains { $0.officialGross != nil }))
                        .font(.caption2)
                        .foregroundStyle(BaggerPalette.muted)
                        .accessibilityIdentifier("score.correction.message")
                  }
                  if correctionActive && editor?.hasChanges == false {
                    Spacer(minLength: 0)
                    Button(action: onFinishReview) {
                        Text("Done reviewing").font(.caption.weight(.semibold))
                            .frame(minHeight: 44).contentShape(Rectangle())
                    }
                        .buttonStyle(.plain).foregroundStyle(BaggerPalette.goldText)
                        .disabled(!enabled)
                        .accessibilityIdentifier("score.correction.done")
                  }
                }
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("score.correction")
            }
            ViewThatFits(in: .horizontal) {
                if !dynamicTypeSize.isAccessibilitySize {
                    HStack(alignment: .top, spacing: 10) {
                        ForEach(presentation.sides) { side in team(side, compact: true) }
                    }
                }
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(presentation.sides) { side in team(side, compact: false) }
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("score.controls")

            if let editor {
                HStack(alignment: .center, spacing: 8) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(editor.selectedRow.map { "Entering · \($0.title)" } ?? "Select a score")
                            .font(.caption.weight(.semibold))
                            .fixedSize(horizontal: false, vertical: true)
                        if editor.hasChanges {
                            Text("Edited · Not saved")
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(BaggerPalette.goldText)
                                .accessibilityIdentifier("score.draftNotice")
                        }
                    }
                    Spacer(minLength: 0)
                    Button("Clear Entry") { onAction(.clear) }
                        .disabled(!enabled)
                        .font(.caption.weight(.semibold))
                        .frame(minHeight: 44)
                        .accessibilityIdentifier("score.keypad.clear")
                        .accessibilityHint("Clears only the selected local entry; no score is sent or deleted")
                }
                .foregroundStyle(BaggerPalette.actionGreen)
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("score.selection")

                VStack(spacing: 8) {
                    ForEach(0..<3) { row in
                        HStack(spacing: 8) {
                            ForEach(1...3, id: \.self) { column in
                                let value = row * 3 + column
                                key(String(value), id: String(value), action: .number(value),
                                    label: "Enter gross \(value)")
                            }
                        }
                    }
                    HStack(spacing: 8) {
                        key("−", id: "minus", action: .decrement,
                            label: editor.selectedKey.flatMap { editor.value(for: $0) } == nil ? "Enter gross 1" : "Decrease selected gross")
                        key("10", id: "10", action: .number(10), label: "Enter gross 10")
                        key("+", id: "plus", action: .increment,
                            label: editor.selectedKey.flatMap { editor.value(for: $0) } == nil ? "Enter gross 11" : "Increase selected gross")
                    }
                }
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("score.keypad")
                .disabled(!enabled)
                if editor.hasChanges {
                    Button("Discard edits", action: onDiscard)
                        .disabled(!enabled)
                        .font(.caption.weight(.semibold))
                        .frame(minHeight: 44)
                        .accessibilityIdentifier("score.discard")
                }
            }
        }
        .onChange(of: editor?.selectedKey) { value in focusedKey = value }
    }

    private func team(_ side: ScoringSidePresentation, compact: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            if presentation.format != .scramble {
            HStack(spacing: 6) {
                BaggerTeamLogo(teamID: side.teamID ?? "", teamName: side.name,
                               size: .small, accessibility: .decorative)
                Text(side.name)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(BaggerPalette.actionGreen)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(minHeight: 32, alignment: .leading)
            .accessibilityElement(children: .combine)
            }
            ForEach(rows.filter { $0.key.side == side.side }) { row in
                target(row, side: side, compact: compact)
            }
            if presentation.format == .scramble,
               let context = matchDisplay?.teamContext(side: side.side) {
                Text(context).font(.caption.weight(.semibold))
                    .foregroundStyle(BaggerPalette.actionGreen)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("score.teamHCP.\(side.side)")
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .accessibilityElement(children: .contain)
        .accessibilitySortPriority(Double(3 - side.side))
    }

    private func target(_ row: ScoringInputRowPresentation, side: ScoringSidePresentation, compact: Bool) -> some View {
        let value = editor.map { $0.value(for: row.key) } ?? row.officialGross
        let selected = editor?.selectedKey == row.key
        let changed = editor.map { $0.value(for: row.key) != $0.baseline[row.key] } ?? false
        let participant = side.participants.first { $0.slot == row.key.slot }
        let hcp = presentation.format == .scramble ? nil : participant.flatMap(ScoreEntryEditor.handicapText)
        let pending = editor?.pendingKeys.contains(row.key) == true
        let state = changed ? "Edited, not saved" : pending ? "Saved on iPhone, not Official" : row.officialGross != nil ? "Official" : "Not entered"
        let recordedStrokes = row.canonicalStrokes.map {
            " · \(ScoringNumberFormatter.string($0)) \($0 == 1 ? "stroke" : "strokes")"
        } ?? ""
        let reference = "Official \(row.officialGross.map(String.init) ?? "—")\(recordedStrokes)"
        return Button { onSelect(row.key) } label: {
            HStack(spacing: 6) {
                if presentation.format == .scramble {
                    BaggerTeamLogo(teamID: side.teamID ?? "", teamName: side.name,
                                   size: .small, accessibility: .decorative)
                }
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 3) {
                        Text(row.title)
                            .font(.subheadline.weight(.semibold))
                            .fixedSize(horizontal: false, vertical: true)
                        if row.isAuthenticatedPlayer {
                            Text("YOU").font(.system(.caption2, weight: .black))
                                .foregroundStyle(BaggerPalette.deepEvergreen)
                                .padding(.horizontal, 4).padding(.vertical, 1)
                                .background(BaggerPalette.scoreGold, in: Capsule())
                        }
                    }
                    if presentation.format == .scramble, let detail = row.detail {
                        Text(detail).font(.caption).fixedSize(horizontal: false, vertical: true)
                    } else if let hcp {
                        Text(hcp).font(.caption)
                    }
                    if row.officialGross != nil || pending {
                        // Keep target height stable while entering new scores.
                        // Correction references exist before the first edit.
                        Text(reference)
                            .font(.caption2).fixedSize(horizontal: false, vertical: true)
                    }
                }
                Spacer(minLength: 0)
                Text(value.map(String.init) ?? "—")
                    .font(.system(.title2, design: .rounded, weight: .bold).monospacedDigit())
            }
            .foregroundStyle(selected ? Color.white : BaggerPalette.deepEvergreen)
            .padding(.horizontal, 10).padding(.vertical, 8)
            .frame(minWidth: compact ? 150 : 0, maxWidth: .infinity, minHeight: 56)
            .background(selected ? BaggerPalette.evergreen : BaggerPalette.paper,
                        in: RoundedRectangle(cornerRadius: 12))
            .overlay { RoundedRectangle(cornerRadius: 12).stroke(selected ? BaggerPalette.gold : BaggerPalette.warmBorder, lineWidth: selected ? 2 : 1) }
        }
        .buttonStyle(.plain).disabled(!enabled)
        .accessibilityLabel("\(row.title) gross score")
        .accessibilityValue("Hole \(holeNumber), \(side.name), \(value.map(String.init) ?? "not entered"), \(state)\(hcp.map { ", \($0)" } ?? "")\(row.isAuthenticatedPlayer ? ", you" : "")\(row.officialGross != nil || pending ? ", \(reference)" : "")")
        .accessibilityHint(enabled ? "Selects this target for the shared keypad" : "Official value, read-only")
        .accessibilityAddTraits(selected ? .isSelected : [])
        .accessibilityFocused($focusedKey, equals: row.key)
        .accessibilityIdentifier("score.input.side\(row.key.side).slot\(row.key.slot)")
    }

    private func key(_ title: String, id: String, action: ScoreEntryEditor.Action, label: String) -> some View {
        Button { onAction(action) } label: {
            Text(title).font(.system(.title2, design: .rounded, weight: .bold).monospacedDigit())
                .frame(maxWidth: .infinity, minHeight: 56)
                .foregroundStyle(BaggerPalette.deepEvergreen)
                .background(BaggerPalette.paper, in: RoundedRectangle(cornerRadius: 12))
                .overlay { RoundedRectangle(cornerRadius: 12).stroke(BaggerPalette.warmBorder, lineWidth: 1) }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityHint("Local entry only; does not save or send a score")
        .accessibilityIdentifier("score.keypad.\(id)")
    }
}
