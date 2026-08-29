import SwiftUI

struct AuthenticatedDiagnosticView: View {
    let participant: ParticipantSession
    let tournamentData: TournamentDataCoordinator?
    let onSignOut: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("BAGGER INVITATIONAL")
                        .font(.caption.weight(.bold))
                        .tracking(1.4)
                        .foregroundStyle(.green)
                    Text("Signed In")
                        .font(.largeTitle.bold())
                    Text(participant.player.displayName)
                        .font(.title2.weight(.semibold))
                }

                diagnosticRow(label: "Team", value: participant.player.team?.name ?? "No team assigned")
                diagnosticRow(label: "Player ID", value: participant.player.playerId)
                diagnosticRow(label: "Tournament", value: tournamentLabel)

                Divider()

                statusRow(label: "API", value: "Connected", symbol: "checkmark.circle.fill")
                statusRow(label: "Identity", value: "Certified", symbol: "checkmark.shield.fill")

                if let tournamentData {
                    Divider()
                    DataFoundationDiagnosticView(coordinator: tournamentData)
                }

                Button("Sign Out", role: .destructive, action: onSignOut)
                    .buttonStyle(.bordered)
                    .controlSize(.large)
                    .frame(maxWidth: .infinity)
            }
            .padding(24)
        }
    }

    private var tournamentLabel: String {
        if let year = participant.tournament.year {
            return "\(participant.tournament.name) · \(year)"
        }
        return participant.tournament.name
    }

    private func diagnosticRow(label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label.uppercased())
                .font(.caption.weight(.bold))
                .foregroundStyle(.secondary)
            Text(value)
                .font(.body.weight(.semibold))
                .textSelection(.enabled)
        }
        .accessibilityElement(children: .combine)
    }

    private func statusRow(label: String, value: String, symbol: String) -> some View {
        HStack {
            Label(label, systemImage: symbol)
                .foregroundStyle(.green)
            Spacer()
            Text(value)
                .fontWeight(.semibold)
        }
        .accessibilityElement(children: .combine)
    }
}
