import SwiftUI

struct SignInView: View {
    @State private var email = ""
    let onSendCode: (String) -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                Spacer(minLength: 42)

                VStack(alignment: .leading, spacing: 8) {
                    Text("BAGGER INVITATIONAL")
                        .font(.caption.weight(.bold))
                        .tracking(1.4)
                        .foregroundStyle(.green)
                    Text("Sign in to Bagger")
                        .font(.largeTitle.bold())
                    Text("Use the email linked to your approved tournament identity.")
                        .foregroundStyle(.secondary)
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("Email")
                        .font(.headline)
                    TextField("golfer@example.com", text: $email)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.continue)
                        .padding(14)
                        .background(.secondary.opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
                        .accessibilityLabel("Approved participant email")
                        .onSubmit { onSendCode(email) }
                }

                Button("Send Code") { onSendCode(email) }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .frame(maxWidth: .infinity)

                Text("No account is created. Sign-in remains enumeration-safe for unapproved addresses.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            .padding(24)
        }
        .scrollDismissesKeyboard(.interactively)
    }
}
