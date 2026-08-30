#if DEBUG
import Combine
import Foundation
import SwiftUI

/// A deterministic, fixture-only durability harness. It writes through the
/// production SQLite repository, but it never constructs a network client or
/// starts the replay coordinator, so a UI test cannot submit a score.
@MainActor
final class DurableScoringQueueUITestModel: ObservableObject {
    @Published private(set) var queueState = ScoringQueueCoordinatorState.inactive

    private let repository: SQLiteScoringQueueRepository?
    private let presentation: ScoringPresentation
    private let identity = ScoringQueueIdentityPartition(
        authUserId: "11111111-1111-4111-8111-111111111111",
        playerId: "fixture-player-a",
        tournamentId: "fixture-tournament"
    )

    init(
        state: ScoringCurrentState,
        arguments: [String] = ProcessInfo.processInfo.arguments,
        fileManager: FileManager = .default
    ) {
        presentation = ScoringPresenter.make(state: state)
        do {
            let databaseURL = try Self.databaseURL(arguments: arguments, fileManager: fileManager)
            if arguments.contains("--bagger-ui-test-reset-scoring-queue") {
                let directory = databaseURL.deletingLastPathComponent()
                if fileManager.fileExists(atPath: directory.path) {
                    try fileManager.removeItem(at: directory)
                }
            }
            repository = try SQLiteScoringQueueRepository(databaseURL: databaseURL)
        } catch {
            repository = nil
            queueState.lastPersistenceFailure = true
        }
        queueState.isOffline = true
    }

    func activate() async {
        await reload()
    }

    func refresh() async {
        // The harness intentionally has no network transport. Reloading only
        // proves durable local state remains available while offline.
        await reload()
    }

    func save(_ draft: ScoringDraft) async throws -> ScoringQueueSaveResult {
        guard let repository else {
            queueState.lastPersistenceFailure = true
            throw DurableScoringQueueUITestError.storageUnavailable
        }
        let input = try presentation.queueSaveInput(
            draft: draft,
            identity: identity,
            originatingAppBuild: "ui-test",
            now: Date()
        )
        let result = try await repository.save(input)
        await reload()
        return result
    }

    private func reload() async {
        guard let repository else {
            queueState.lastPersistenceFailure = true
            return
        }
        do {
            queueState.records = try await repository.records(for: identity)
            queueState.isOffline = true
            queueState.isSuspended = false
            queueState.lastPersistenceFailure = false
        } catch {
            queueState.lastPersistenceFailure = true
        }
    }

    private static func databaseURL(
        arguments: [String],
        fileManager: FileManager
    ) throws -> URL {
        guard let applicationSupport = fileManager.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        ).first else {
            throw DurableScoringQueueUITestError.storageUnavailable
        }
        let rawIdentifier: String
        if let index = arguments.firstIndex(of: "--bagger-ui-test-queue-id"),
           arguments.indices.contains(index + 1)
        {
            rawIdentifier = arguments[index + 1]
        } else {
            rawIdentifier = "default"
        }
        let safeIdentifier = String(rawIdentifier.unicodeScalars.map { scalar in
            CharacterSet.alphanumerics.contains(scalar) || scalar.value == 45 || scalar.value == 95
                ? Character(String(scalar))
                : "_"
        }).prefix(64)
        guard !safeIdentifier.isEmpty else {
            throw DurableScoringQueueUITestError.invalidIdentifier
        }
        return applicationSupport
            .appendingPathComponent("BaggerInv", isDirectory: true)
            .appendingPathComponent("UITestScoringQueue", isDirectory: true)
            .appendingPathComponent(String(safeIdentifier), isDirectory: true)
            .appendingPathComponent("scoring-queue.sqlite3", isDirectory: false)
    }
}

enum DurableScoringQueueUITestError: Error {
    case invalidIdentifier
    case storageUnavailable
}

struct DurableScoringQueueUITestFixtureView: View {
    private let presentation: ScoringPresentation
    @StateObject private var model: DurableScoringQueueUITestModel

    init(state: ScoringCurrentState) {
        presentation = ScoringPresenter.make(state: state)
        _model = StateObject(wrappedValue: DurableScoringQueueUITestModel(state: state))
    }

    var body: some View {
        ScoreScreen(
            presentation: presentation,
            queueState: model.queueState,
            onRefresh: { await model.refresh() },
            onSave: { draft in try await model.save(draft) }
        )
        .task { await model.activate() }
    }
}

struct ScoringQueueSignOutUITestFixtureRoot: View {
    let participant: ParticipantSession
    let presentation: TodayPresentation
    let matchesState: MobileReadState<MobileMatchesData>
    let scoringState: ScoringCurrentState

    @State private var signOutPresentation: ScoringQueueSignOutPresentation?
    @State private var didConfirmSignOut = false

    var body: some View {
        Group {
            if didConfirmSignOut {
                VStack(spacing: 12) {
                    Text("Signed out")
                        .font(.title.bold())
                    Text("Unresolved scoring intent remains retained for its original participant identity.")
                        .multilineTextAlignment(.center)
                }
                .padding(24)
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("score.signOut.confirmed")
            } else {
                BaggerAppShell(
                    participant: participant,
                    fixturePresentation: presentation,
                    fixtureMatchesState: matchesState,
                    fixtureScoringState: scoringState,
                    startsOnScore: true,
                    onSignOut: {
                        signOutPresentation = ScoringQueueSignOutPresentation(unresolvedCount: 2)
                    }
                )
            }
        }
        .scoringQueueSignOutConfirmation(
            presentation: signOutPresentation,
            onKeepWorking: { signOutPresentation = nil },
            onConfirmSignOut: {
                signOutPresentation = nil
                didConfirmSignOut = true
            }
        )
    }
}
#endif
