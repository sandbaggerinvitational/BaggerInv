import Foundation

/// Ephemeral keypad state only. An explicit blank must never fall back to an
/// Official value. This type owns no transport, queue, persistence or golf math.
struct ScoreEntryEditor: Equatable {
    enum Entry: Equatable { case value(Int), cleared }
    enum Action: Equatable { case number(Int), decrement, increment, clear }

    let base: ScoringDraft
    let rows: [ScoringInputRowPresentation]
    let isCorrection: Bool
    let baseline: [ScoringInputKey: Int]
    let pendingKeys: Set<ScoringInputKey>
    private(set) var entries: [ScoringInputKey: Entry] = [:]
    private(set) var selectedKey: ScoringInputKey?

    init(base: ScoringDraft, rows: [ScoringInputRowPresentation], pending: [ScoringInputKey: Int] = [:]) {
        self.base = base
        self.rows = rows
        pendingKeys = Set(pending.keys)
        baseline = Dictionary(uniqueKeysWithValues: rows.compactMap { row in
            (pending[row.key] ?? row.officialGross).map { (row.key, $0) }
        })
        isCorrection = !baseline.isEmpty
        selectedKey = rows.first(where: { baseline[$0.key] == nil })?.key ?? rows.first?.key
    }

    func value(for key: ScoringInputKey) -> Int? {
        switch entries[key] {
        case .value(let value): value
        case .cleared: nil
        case nil: baseline[key]
        }
    }

    var selectedRow: ScoringInputRowPresentation? { rows.first { $0.key == selectedKey } }
    var enteredCount: Int { rows.filter { value(for: $0.key) != nil }.count }
    var hasChanges: Bool { rows.contains { value(for: $0.key) != baseline[$0.key] } }
    var isComplete: Bool { !rows.isEmpty && enteredCount == rows.count }
    var canSave: Bool { isComplete && hasChanges }

    mutating func select(_ key: ScoringInputKey) {
        guard rows.contains(where: { $0.key == key }) else { return }
        selectedKey = key
    }

    mutating func apply(_ action: Action) {
        guard let key = selectedKey, let index = rows.firstIndex(where: { $0.key == key }) else { return }
        let current = value(for: key)
        let wasUntouched = entries[key] == nil
        switch action {
        case .number(let value):
            guard (1...10).contains(value) else { return }
            entries[key] = .value(value)
        case .decrement: entries[key] = .value(max(1, (current ?? 2) - 1))
        case .increment: entries[key] = .value(min(20, (current ?? 10) + 1))
        case .clear: entries[key] = .cleared
        }
        // First-time direct input only; never overwrite, wrap, auto-save, or
        // move focus during correction/adjust/clear/manual populated-target edit.
        if case .number = action, current == nil, wasUntouched, !isCorrection,
           let next = rows.dropFirst(index + 1).first(where: { value(for: $0.key) == nil }) {
            selectedKey = next.key
        }
    }

    /// The existing queue receives its unchanged ScoringDraft shape only when
    /// every required input has a legal integer and the local intent changed.
    func saveDraft() -> ScoringDraft? {
        guard canSave else { return nil }
        var result = base
        for row in rows {
            guard let value = value(for: row.key), (1...20).contains(value) else { return nil }
            result.set(value, for: row.key)
        }
        return result
    }

    static func handicapText(_ player: ScoringParticipantPresentation) -> String? {
        player.playingHandicap.map { "HCP \(HandicapDisplayFormatter.string($0))" }
    }
}
