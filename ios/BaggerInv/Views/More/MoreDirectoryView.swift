import SwiftUI

struct MoreDirectoryView: View {
    let presentation: MoreDirectoryPresentation

    init(presentation: MoreDirectoryPresentation = .standard) {
        self.presentation = presentation
    }

    var body: some View {
        List {
            ForEach(presentation.sections) { section in
                Section {
                    ForEach(section.items) { item in
                        NavigationLink(value: item.destination) {
                            MoreDirectoryRow(item: item)
                        }
                        .accessibilityIdentifier("more.destination.\(item.destination.id)")
                    }
                } header: {
                    Text(section.title.uppercased())
                        .font(.caption.weight(.black))
                        .tracking(0.8)
                        .foregroundStyle(BaggerPalette.goldText)
                        .accessibilityAddTraits(.isHeader)
                        .accessibilityIdentifier("more.section.\(section.id)")
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(BaggerPalette.canvas.ignoresSafeArea())
        .tint(BaggerPalette.actionGreen)
        .accessibilityIdentifier("more.screen")
    }
}

private struct MoreDirectoryRow: View {
    let item: MoreDirectoryItem
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 8) {
                    icon
                    labels
                }
                .padding(.vertical, 7)
            } else {
                HStack(alignment: .center, spacing: 13) {
                    icon
                    labels
                }
                .padding(.vertical, 5)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(item.title), \(item.subtitle)")
        .accessibilityHint("Opens \(item.title)")
    }

    private var icon: some View {
        Image(systemName: item.systemImage)
            .font(.headline)
            .foregroundStyle(BaggerPalette.actionGreen)
            .frame(width: 38, height: 38)
            .background(BaggerPalette.cream, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .accessibilityHidden(true)
    }

    private var labels: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(item.title)
                .font(.body.weight(.semibold))
                .foregroundStyle(BaggerPalette.ink)
                .fixedSize(horizontal: false, vertical: true)
            Text(item.subtitle)
                .font(.footnote)
                .foregroundStyle(BaggerPalette.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}
