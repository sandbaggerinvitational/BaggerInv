import SwiftUI

struct RootView: View {
    @ObservedObject var coordinator: AppCoordinator

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Spacer()
                PreviewBadge()
            }
            .padding(.horizontal)
            .padding(.top, 8)

            content
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(Color(uiColor: .systemBackground))
        .task {
            if coordinator.state == .launching {
                await coordinator.bootstrap()
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch coordinator.state {
        case .launching, .checkingEnvironment:
            ProgressStateView(
                title: "Bagger Invitational",
                message: "Verifying the Preview environment…"
            )
        case .environmentUnavailable:
            ControlledErrorView(
                title: "Preview unavailable",
                message: "This build could not verify the isolated Bagger Preview environment.",
                actionTitle: "Check Again"
            ) {
                Task { await coordinator.bootstrap() }
            }
        case .signedOut:
            SignInView(onSendCode: coordinator.beginSignIn)
        case .solvingCaptcha(let email):
            CaptchaScreen(
                email: email,
                captchaURL: coordinator.environment!.apiBaseURL
                    .appending(path: "/api/mobile/v1/auth/captcha"),
                onCancel: coordinator.cancelCaptcha,
                onToken: { token in
                    Task { await coordinator.completeCaptcha(token: token, email: email) }
                },
                onFailure: {
                    coordinator.recover(.signedOut)
                }
            )
        case .requestingOTP:
            ProgressStateView(title: "Requesting code", message: "Contacting Bagger securely…")
        case .awaitingOTP(let context):
            OTPEntryView(
                context: context,
                now: Date.init,
                onVerify: { code in
                    Task { await coordinator.verifyOTP(code: code, context: context) }
                },
                onResend: { coordinator.beginResend(from: context) },
                onChangeEmail: { coordinator.recover(.signedOut) }
            )
        case .verifyingOTP:
            ProgressStateView(title: "Verifying code", message: "Creating the secure Preview session…")
        case .certifyingBaggerIdentity:
            ProgressStateView(title: "Certifying identity", message: "Confirming your approved Bagger participant…")
        case .loadingParticipant:
            ProgressStateView(title: "Loading participant", message: "Resolving your canonical Bagger Player…")
        case .authenticated(let participant):
            AuthenticatedDiagnosticView(participant: participant) {
                Task { await coordinator.signOut() }
            }
        case .authenticationError(let presentation):
            ControlledErrorView(
                title: "Sign-in issue",
                message: presentation.message,
                actionTitle: recoveryTitle(presentation.recovery)
            ) {
                coordinator.recover(presentation.recovery)
                if presentation.recovery == .retryBootstrap {
                    Task { await coordinator.bootstrap() }
                }
            }
        }
    }

    private func recoveryTitle(_ recovery: AuthenticationErrorPresentation.Recovery) -> String {
        switch recovery {
        case .signedOut: "Back to Sign In"
        case .retryBootstrap: "Try Again"
        case .retryOTP: "Enter Code Again"
        }
    }
}
private struct ProgressStateView: View {
    let title: String
    let message: String

    var body: some View {
        VStack(spacing: 18) {
            ProgressView()
                .controlSize(.large)
            Text(title)
                .font(.title2.bold())
            Text(message)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
        }
        .padding(28)
        .accessibilityElement(children: .combine)
    }
}

private struct ControlledErrorView: View {
    let title: String
    let message: String
    let actionTitle: String
    let action: () -> Void

    var body: some View {
        VStack(spacing: 18) {
            Image(systemName: "exclamationmark.shield")
                .font(.system(size: 42))
                .foregroundStyle(.orange)
                .accessibilityHidden(true)
            Text(title)
                .font(.title2.bold())
            Text(message)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
            Button(actionTitle, action: action)
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
        }
        .padding(28)
    }
}
