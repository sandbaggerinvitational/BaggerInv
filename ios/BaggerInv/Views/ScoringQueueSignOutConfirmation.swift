import SwiftUI

private struct ScoringQueueSignOutConfirmationModifier: ViewModifier {
    let presentation: ScoringQueueSignOutPresentation?
    let onKeepWorking: () -> Void
    let onConfirmSignOut: () -> Void

    func body(content: Content) -> some View {
        content.confirmationDialog(
            "Unresolved scores",
            isPresented: Binding(
                get: { presentation != nil },
                // Explicit actions own the outcome. A system dismissal write
                // must not race a confirmed destructive action.
                set: { _ in }
            ),
            titleVisibility: .visible
        ) {
            Button("Keep Working", action: onKeepWorking)
                .accessibilityIdentifier("score.signOut.keepWorking")
            Button("Sign Out and Keep Scores on This iPhone", role: .destructive, action: onConfirmSignOut)
                .accessibilityIdentifier("score.signOut.confirm")
        } message: {
            if let count = presentation?.unresolvedCount {
                Text("\(count) \(count == 1 ? "score is" : "scores are") saved on this iPhone but not yet Official. Signing out keeps \(count == 1 ? "it" : "them") securely under this participant identity.")
            } else {
                Text("Bagger could not verify the durable scoring queue. Signing out will keep any unresolved scores on this iPhone under this participant identity.")
            }
        }
    }
}

extension View {
    func scoringQueueSignOutConfirmation(
        presentation: ScoringQueueSignOutPresentation?,
        onKeepWorking: @escaping () -> Void,
        onConfirmSignOut: @escaping () -> Void
    ) -> some View {
        modifier(ScoringQueueSignOutConfirmationModifier(
            presentation: presentation,
            onKeepWorking: onKeepWorking,
            onConfirmSignOut: onConfirmSignOut
        ))
    }
}
