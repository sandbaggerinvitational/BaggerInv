import SwiftUI

enum BaggerPalette {
    static let canvas = Color(red: 246 / 255, green: 243 / 255, blue: 235 / 255)
    static let paper = Color(red: 1, green: 253 / 255, blue: 248 / 255)
    static let cream = Color(red: 245 / 255, green: 240 / 255, blue: 230 / 255)
    static let evergreen = Color(red: 8 / 255, green: 63 / 255, blue: 49 / 255)
    static let deepEvergreen = Color(red: 6 / 255, green: 31 / 255, blue: 24 / 255)
    static let actionGreen = Color(red: 11 / 255, green: 68 / 255, blue: 53 / 255)
    static let softGreen = Color(red: 23 / 255, green: 75 / 255, blue: 59 / 255)
    static let ink = Color(red: 23 / 255, green: 52 / 255, blue: 43 / 255)
    static let muted = Color(red: 85 / 255, green: 101 / 255, blue: 94 / 255)
    static let gold = Color(red: 181 / 255, green: 138 / 255, blue: 37 / 255)
    static let goldText = Color(red: 121 / 255, green: 88 / 255, blue: 15 / 255)
    static let scoreGold = Color(red: 241 / 255, green: 212 / 255, blue: 126 / 255)
    static let warmBorder = Color(red: 222 / 255, green: 212 / 255, blue: 193 / 255)
    static let matchBorder = Color(red: 216 / 255, green: 198 / 255, blue: 157 / 255)
    static let liveRed = Color(red: 200 / 255, green: 50 / 255, blue: 57 / 255)
}

enum BaggerLayout {
    static let pageInset: CGFloat = 14
    static let sectionSpacing: CGFloat = 14
    static let cardRadius: CGFloat = 18
    static let cardPadding: CGFloat = 16
}

struct BaggerCardModifier: ViewModifier {
    var border = BaggerPalette.warmBorder
    var background = BaggerPalette.paper

    func body(content: Content) -> some View {
        content
            .padding(BaggerLayout.cardPadding)
            .background(background)
            .clipShape(RoundedRectangle(cornerRadius: BaggerLayout.cardRadius, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: BaggerLayout.cardRadius, style: .continuous)
                    .stroke(border, lineWidth: 1)
            }
            .shadow(color: BaggerPalette.evergreen.opacity(0.06), radius: 12, y: 6)
    }
}

extension View {
    func baggerCard(
        border: Color = BaggerPalette.warmBorder,
        background: Color = BaggerPalette.paper
    ) -> some View {
        modifier(BaggerCardModifier(border: border, background: background))
    }
}

struct BaggerEyebrow: View {
    let text: String

    var body: some View {
        Text(text.uppercased())
            .font(.caption2.weight(.black))
            .foregroundStyle(BaggerPalette.goldText)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 2)
    }
}

struct BaggerSectionHeading: View {
    let eyebrow: String?
    let title: String

    init(_ title: String, eyebrow: String? = nil) {
        self.title = title
        self.eyebrow = eyebrow
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            if let eyebrow {
                BaggerEyebrow(text: eyebrow)
            }
            Text(title)
                .font(.system(.title2, design: .serif, weight: .bold))
                .foregroundStyle(BaggerPalette.ink)
        }
        .accessibilityElement(children: .combine)
    }
}

struct BaggerPreviewPill: View {
    var body: some View {
        Text("PREVIEW")
            .font(.caption2.weight(.black))
            .tracking(1.2)
            .foregroundStyle(BaggerPalette.deepEvergreen)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(BaggerPalette.scoreGold, in: Capsule())
            .fixedSize()
            .accessibilityLabel("Preview environment")
    }
}
