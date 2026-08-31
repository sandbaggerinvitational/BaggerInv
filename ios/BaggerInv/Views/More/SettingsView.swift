import SwiftUI

struct SettingsView: View {
    let participant: ParticipantSession
    let buildInfo: BaggerAppBuildInfo
    let onSignOut: () -> Void

    init(
        participant: ParticipantSession,
        buildInfo: BaggerAppBuildInfo = .current(),
        onSignOut: @escaping () -> Void
    ) {
        self.participant = participant
        self.buildInfo = buildInfo
        self.onSignOut = onSignOut
    }

    var body: some View {
        List {
            Section("Signed In") {
                NavigationLink(value: MoreDestination.passport) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(participant.player.displayName)
                            .font(.headline)
                            .foregroundStyle(BaggerPalette.ink)
                            .fixedSize(horizontal: false, vertical: true)
                        if let teamName = participant.player.team?.name {
                            Text(teamName)
                                .font(.subheadline)
                                .foregroundStyle(BaggerPalette.muted)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        Text(tournamentLabel)
                            .font(.footnote)
                            .foregroundStyle(BaggerPalette.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.vertical, 4)
                }
                .accessibilityLabel(accountAccessibilityLabel)
                .accessibilityHint("Opens Player Passport")
                .accessibilityIdentifier("settings.passport")

                Button("Sign Out", role: .destructive, action: onSignOut)
                    .accessibilityHint("Signs out after checking for unresolved saved scores")
                    .accessibilityIdentifier("settings.signOut")
            }

            Section("Environment") {
                Label {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Preview Environment")
                            .font(.body.weight(.semibold))
                        Text("This app uses isolated Preview tournament data.")
                            .font(.footnote)
                            .foregroundStyle(BaggerPalette.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                } icon: {
                    Image(systemName: "testtube.2")
                        .foregroundStyle(BaggerPalette.goldText)
                }
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("settings.previewEnvironment")
            }

            Section("About") {
                LabeledContent("Bagger Preview", value: buildInfo.versionAndBuildText)
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier("settings.version")
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(BaggerPalette.canvas.ignoresSafeArea())
        .tint(BaggerPalette.actionGreen)
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("settings.screen")
    }

    private var tournamentLabel: String {
        if let year = participant.tournament.year {
            return "\(participant.tournament.name) · \(year)"
        }
        return participant.tournament.name
    }

    private var accountAccessibilityLabel: String {
        [participant.player.displayName, participant.player.team?.name, tournamentLabel]
            .compactMap { $0 }
            .joined(separator: ", ")
    }
}
