import SwiftUI

struct PreviewBadge: View {
    var body: some View {
        Text("PREVIEW")
            .font(.caption.weight(.bold))
            .tracking(1.2)
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .foregroundStyle(.white)
            .background(.green.gradient, in: Capsule())
            .accessibilityLabel("Preview environment")
    }
}
