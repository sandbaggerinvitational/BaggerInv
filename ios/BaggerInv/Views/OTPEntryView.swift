import SwiftUI

struct OTPEntryView: View {
    let context: OTPChallengeContext
    let now: () -> Date
    let onVerify: (String) -> Void
    let onResend: () -> Void
    let onChangeEmail: () -> Void

    @State private var code = ""
    @State private var currentDate = Date()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                Spacer(minLength: 42)
                Text("Enter the code we sent you")
                    .font(.largeTitle.bold())
                Text("If this email is approved for Bagger, a one-time code has been sent.")
                    .foregroundStyle(.secondary)

                TextField("6-digit code", text: $code)
                    .textContentType(.oneTimeCode)
                    .keyboardType(.numberPad)
                    .multilineTextAlignment(.center)
                    .font(.title.monospacedDigit().weight(.semibold))
                    .padding(14)
                    .background(.secondary.opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
                    .accessibilityLabel("One-time sign-in code")
                    .onChange(of: code) { newValue in
                        code = String(newValue.filter(\.isNumber).prefix(6))
                    }

                Button("Verify") {
                    let submittedCode = code
                    code = ""
                    onVerify(submittedCode)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(code.count != 6)
                .frame(maxWidth: .infinity)

                HStack {
                    Button(resendTitle, action: onResend)
                        .disabled(currentDate < context.resendAt)
                    Spacer()
                    Button("Change Email", action: onChangeEmail)
                }
                .font(.subheadline.weight(.semibold))
            }
            .padding(24)
        }
        .scrollDismissesKeyboard(.interactively)
        .task {
            while !Task.isCancelled && currentDate < context.resendAt {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                currentDate = now()
            }
        }
    }

    private var resendTitle: String {
        let remaining = max(0, Int(context.resendAt.timeIntervalSince(currentDate).rounded(.up)))
        return remaining > 0 ? "Resend in \(remaining)s" : "Request New Code"
    }
}
