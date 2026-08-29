import SwiftUI

struct CaptchaScreen: View {
    let email: String
    let captchaURL: URL
    let onCancel: () -> Void
    let onToken: (String) -> Void
    let onFailure: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Request verification")
                        .font(.title2.bold())
                    Text("Complete the security check to request a sign-in code.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Spacer()
            }
            .padding(.horizontal)

            TurnstileChallengeView(
                captchaURL: captchaURL,
                onToken: onToken,
                onFailure: onFailure
            )
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .accessibilityLabel("Bagger request verification")

            Button("Cancel", action: onCancel)
                .buttonStyle(.bordered)
                .controlSize(.large)
                .padding(.bottom)
        }
        .padding(.top, 12)
    }
}
