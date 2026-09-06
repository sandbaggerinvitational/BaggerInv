import SwiftUI

struct ScoreMatchSelectionSheet: View {
    @ObservedObject var store: ScoreMatchSelectionStore
    let currentMatchID: String?
    let onSelect: @MainActor @Sendable (String) async throws -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @State private var selectionFailed = false
    @State private var selecting = false

    var body: some View {
        NavigationStack {
            Group {
                if selectionFailed {
                    unavailable("That Match could not be verified. No score was changed.")
                } else {
                    switch store.phase {
                    case .idle, .loading, .selecting:
                        VStack(spacing: 12) {
                            ProgressView()
                            Text(selecting ? "Rechecking Match permission…" : "Checking score-authorized Matches…")
                                .font(.subheadline)
                        }
                        .accessibilityIdentifier("score.matchPicker.loading")
                    case .expired, .unavailable:
                        unavailable("Fresh scoring permission is required. Check again while online.")
                    case .ready:
                        if store.choices.isEmpty {
                            unavailable("No Matches are currently authorized for score entry.")
                        } else {
                            List(store.choices) { choice in
                                Button {
                                    selecting = true
                                    Task { @MainActor in
                                        do { try await onSelect(choice.match.matchId); dismiss() }
                                        catch { selecting = false; selectionFailed = true; store.invalidate() }
                                    }
                                } label: { row(choice) }
                                .buttonStyle(.plain)
                                .disabled(selecting)
                                .accessibilityIdentifier("score.matchPicker.choice.\(choice.match.matchId)")
                            }
                            .listStyle(.plain)
                            .scrollContentBackground(.hidden)
                            .accessibilityIdentifier("score.matchPicker.choices")
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(BaggerPalette.canvas)
            .navigationTitle("Choose Match to score")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }.disabled(selecting)
                }
            }
        }
        .tint(BaggerPalette.actionGreen)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .interactiveDismissDisabled(selecting)
        .task { await store.refresh() }
        .onDisappear {
            // A selected Match's fresh read briefly replaces Score with its
            // loading view. That view transition must not cancel the owning
            // selection operation. Background/identity/expiry still invalidate
            // it independently; completion or failure clears it in the owner.
            if !selecting { store.invalidate() }
        }
        .onChange(of: scenePhase) { phase in
            guard phase != .active else { return }
            store.invalidate(); dismiss()
        }
    }

    private func unavailable(_ text: String) -> some View {
        VStack(spacing: 14) {
            Image(systemName: "lock.shield").font(.title2).accessibilityHidden(true)
            Text(text).multilineTextAlignment(.center).font(.subheadline)
            Button("Check again") {
                selectionFailed = false
                Task { await store.refresh() }
            }
            .buttonStyle(.bordered).controlSize(.large)
            .accessibilityIdentifier("score.matchPicker.retry")
        }
        .padding(24)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("score.matchPicker.unavailable")
    }

    private func row(_ choice: ScoreAuthorizedMatchChoice) -> some View {
        let scoring = choice.scoring
        let current = currentMatchID.map { MobileOpaqueMatchID.isEqual($0, choice.match.matchId) } == true
        return HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 5) {
                Text([scoring.match.roundNumber.map { "Round \($0)" },
                      formatTitle(scoring.match.format), choice.match.displayMatchNumber.map { "Match \($0)" }]
                    .compactMap { $0 }.joined(separator: " · "))
                    .font(.subheadline.weight(.semibold))
                Text(scoring.sides.map(\.name).joined(separator: " vs "))
                    .font(.subheadline)
                HStack(spacing: 8) {
                    BaggerStatusBadge(kind: .live)
                    if let teeTime = choice.match.teeTime {
                        Text(teeTime.label.isEmpty ? teeTime.localTime.map { TodayClockFormatter.string(for: $0) } ?? "" : teeTime.label)
                            .font(.caption).foregroundStyle(BaggerPalette.muted)
                    }
                    if current { Text("Current").font(.caption.weight(.semibold)) }
                }
            }
            Spacer(minLength: 0)
            if current {
                Image(systemName: "checkmark.circle.fill").foregroundStyle(BaggerPalette.actionGreen).accessibilityHidden(true)
            }
        }
        .foregroundStyle(BaggerPalette.ink)
        .padding(.vertical, 8)
        .frame(minHeight: 44)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(current ? .isSelected : [])
        .accessibilityHint("Rechecks server scoring permission before switching. Does not save a score.")
    }

    private func formatTitle(_ format: MobileScoringFormat) -> String {
        switch format { case .bestBall: "Best Ball"; case .scramble: "Scramble"; case .singles: "Singles"; case .unknown: "Unsupported" }
    }
}
