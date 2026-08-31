import SwiftUI

struct GuideRepositoryView: View {
    @ObservedObject private var repository: MobileReadRepository<MobileGuideResponse>
    let destination: MoreDestination
    let onLoad: @MainActor @Sendable () async -> Void
    let onRefresh: @MainActor @Sendable () async -> Void

    init(
        repository: MobileReadRepository<MobileGuideResponse>,
        destination: MoreDestination,
        onLoad: @escaping @MainActor @Sendable () async -> Void,
        onRefresh: @escaping @MainActor @Sendable () async -> Void
    ) {
        _repository = ObservedObject(wrappedValue: repository)
        self.destination = destination
        self.onLoad = onLoad
        self.onRefresh = onRefresh
    }

    var body: some View {
        GuideStateView(
            state: repository.state,
            destination: destination,
            onRefresh: onRefresh
        )
        .task { await onLoad() }
    }
}

struct GuideFixtureView: View {
    let state: MobileReadState<MobileGuideData>
    let destination: MoreDestination

    var body: some View {
        GuideStateView(state: state, destination: destination, onRefresh: {})
    }
}

private struct GuideStateView: View {
    let state: MobileReadState<MobileGuideData>
    let destination: MoreDestination
    let onRefresh: @MainActor @Sendable () async -> Void

    var body: some View {
        Group {
            if let data = state.value {
                let presentation = GuidePresenter.make(data: data)
                if presentation.isPublished {
                    publishedView(presentation)
                } else {
                    MoreEmptyStatePage(
                        title: "Tournament Guide not published",
                        message: "Tournament-week information will appear after it is published.",
                        identifier: "guide.unpublished"
                    )
                }
            } else if state.freshness == .empty || state.freshness == .refreshing {
                MoreLoadingStateView(title: destination.title, identifier: "guide.loading")
            } else {
                MoreUnavailableStateView(
                    title: destination.title,
                    message: "Bagger could not load the Tournament Guide and there is no saved update on this device.",
                    identifierPrefix: "guide",
                    onRetry: onRefresh
                )
            }
        }
        .navigationTitle(destination.title)
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder
    private func publishedView(_ presentation: GuidePresentation) -> some View {
        switch destination {
        case .tournamentGuide:
            TournamentGuideScreen(
                presentation: presentation,
                freshness: state.freshness,
                onRefresh: onRefresh
            )
        case .courses:
            GuideCoursesView(courses: presentation.courses, freshness: state.freshness, onRefresh: onRefresh)
        case .course(let courseID):
            if let course = presentation.courses.first(where: { $0.id == courseID }) {
                GuideCourseDetailView(
                    course: course,
                    freshness: state.freshness,
                    onRefresh: onRefresh
                )
            } else {
                MoreEmptyStatePage(
                    title: "Course unavailable",
                    message: "This course is not part of the current published Tournament Guide.",
                    identifier: "guide.course.missing"
                )
            }
        case .rules:
            GuideRulesView(
                roundFormats: presentation.roundFormats,
                rules: presentation.rules,
                freshness: state.freshness,
                onRefresh: onRefresh
            )
        case .dining:
            GuideDiningView(entries: presentation.dining, freshness: state.freshness, onRefresh: onRefresh)
        case .localGuide:
            GuideLocalView(entries: presentation.localGuide, freshness: state.freshness, onRefresh: onRefresh)
        case .contacts:
            GuideContactsView(contacts: presentation.contacts, freshness: state.freshness, onRefresh: onRefresh)
        default:
            MoreEmptyStatePage(
                title: "Guide destination unavailable",
                message: "Return to More and choose another Tournament Guide section.",
                identifier: "guide.destination.missing"
            )
        }
    }
}

private struct TournamentGuideScreen: View {
    let presentation: GuidePresentation
    let freshness: MobileReadFreshness
    let onRefresh: @MainActor @Sendable () async -> Void

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: BaggerLayout.sectionSpacing) {
                VStack(alignment: .leading, spacing: 7) {
                    BaggerEyebrow(text: "Tournament Guide")
                    Text(presentation.tournamentName ?? "Bagger Invitational")
                        .font(.system(.largeTitle, design: .serif, weight: .bold))
                        .foregroundStyle(BaggerPalette.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    if let edition = presentation.editionTitle {
                        Text(edition)
                            .font(.title3.weight(.semibold))
                            .foregroundStyle(BaggerPalette.actionGreen)
                    }
                    Text([presentation.dates, presentation.location].compactMap { $0 }.joined(separator: " · "))
                        .font(.subheadline)
                        .foregroundStyle(BaggerPalette.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .baggerCard(border: BaggerPalette.matchBorder)
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("guide.hero")

                MoreFreshnessBannerView(
                    productName: "Tournament Guide",
                    freshness: freshness,
                    identifierPrefix: "guide"
                )

                ForEach(presentation.overview) { section in
                    MoreTextCardView(title: section.title, bodyText: section.body)
                        .accessibilityIdentifier("guide.overview.\(section.id)")
                }

                BaggerSectionHeading("Explore")
                VStack(spacing: 0) {
                    GuideNavigationLink(destination: .courses, subtitle: "Courses, tees, and hole details")
                    Divider().overlay(BaggerPalette.warmBorder)
                    GuideNavigationLink(destination: .rules, subtitle: "Official rules and Round formats")
                    Divider().overlay(BaggerPalette.warmBorder)
                    GuideNavigationLink(destination: .dining, subtitle: "Tournament dining itinerary")
                    Divider().overlay(BaggerPalette.warmBorder)
                    GuideNavigationLink(destination: .localGuide, subtitle: "Transportation and local resources")
                    Divider().overlay(BaggerPalette.warmBorder)
                    GuideNavigationLink(destination: .contacts, subtitle: "Tournament-week assistance")
                }
                .baggerCard()
            }
            .padding(BaggerLayout.pageInset)
        }
        .background(BaggerPalette.canvas.ignoresSafeArea())
        .refreshable(action: onRefresh)
        .accessibilityIdentifier("guide.screen")
    }
}

private struct GuideNavigationLink: View {
    let destination: MoreDestination
    let subtitle: String

    var body: some View {
        NavigationLink(value: destination) {
            Label {
                VStack(alignment: .leading, spacing: 3) {
                    Text(destination.title).font(.body.weight(.semibold)).foregroundStyle(BaggerPalette.ink)
                    Text(subtitle).font(.footnote).foregroundStyle(BaggerPalette.muted)
                }
            } icon: {
                Image(systemName: destination.systemImage).foregroundStyle(BaggerPalette.actionGreen)
            }
            .padding(.vertical, 7)
        }
        .accessibilityIdentifier("guide.open.\(destination.id)")
    }
}

private struct GuideCoursesView: View {
    let courses: [GuideCoursePresentation]
    let freshness: MobileReadFreshness
    let onRefresh: @MainActor @Sendable () async -> Void

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: BaggerLayout.sectionSpacing) {
                MoreFreshnessBannerView(productName: "Courses", freshness: freshness, identifierPrefix: "courses")
                if courses.isEmpty {
                    MoreEmptyStateView(
                        title: "No courses are published yet.",
                        systemImage: "flag",
                        identifier: "courses.empty"
                    )
                } else {
                    ForEach(courses) { course in
                        NavigationLink(value: MoreDestination.course(courseID: course.id)) {
                            VStack(alignment: .leading, spacing: 7) {
                                Text(course.name)
                                    .font(.title3.weight(.bold))
                                    .foregroundStyle(BaggerPalette.ink)
                                    .fixedSize(horizontal: false, vertical: true)
                                if let location = course.location {
                                    Label(location, systemImage: "mappin")
                                        .font(.subheadline)
                                        .foregroundStyle(BaggerPalette.muted)
                                }
                                Text("\(course.assignments.count) Round \(course.assignments.count == 1 ? "assignment" : "assignments")")
                                    .font(.footnote.weight(.semibold))
                                    .foregroundStyle(BaggerPalette.actionGreen)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .baggerCard()
                        }
                        .buttonStyle(.plain)
                        .accessibilityHint("Opens course detail")
                        .accessibilityIdentifier("courses.course.\(course.id)")
                    }
                }
            }
            .padding(BaggerLayout.pageInset)
        }
        .background(BaggerPalette.canvas.ignoresSafeArea())
        .refreshable(action: onRefresh)
        .accessibilityIdentifier("courses.screen")
    }
}

private struct GuideCourseDetailView: View {
    let course: GuideCoursePresentation
    let freshness: MobileReadFreshness
    let onRefresh: @MainActor @Sendable () async -> Void

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: BaggerLayout.sectionSpacing) {
                MoreFreshnessBannerView(
                    productName: "Courses",
                    freshness: freshness,
                    identifierPrefix: "courses"
                )
                VStack(alignment: .leading, spacing: 7) {
                    BaggerEyebrow(text: "Tournament Course")
                    Text(course.name)
                        .font(.system(.largeTitle, design: .serif, weight: .bold))
                        .foregroundStyle(BaggerPalette.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    if let location = course.location {
                        Label(location, systemImage: "mappin")
                            .font(.headline)
                            .foregroundStyle(BaggerPalette.actionGreen)
                    }
                    Text([
                        course.yearOpened.map { "Opened \($0)" },
                        course.designer.map { "Designed by \($0)" },
                    ].compactMap { $0 }.joined(separator: " · "))
                        .font(.subheadline)
                        .foregroundStyle(BaggerPalette.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .baggerCard(border: BaggerPalette.matchBorder)
                .accessibilityElement(children: .combine)

                if let overview = course.overview {
                    MoreTextCardView(title: "Overview", bodyText: overview)
                }
                if let tips = course.playingTips {
                    MoreTextCardView(title: "Playing Tips", bodyText: tips)
                }
                if let signature = course.signatureHoles {
                    MoreTextCardView(title: "Signature Holes", bodyText: signature)
                }
                if let history = course.history {
                    MoreTextCardView(title: "History", bodyText: history)
                }

                if !course.actions.isEmpty {
                    MoreExternalActionsView(
                        title: "Course Links",
                        actions: course.actions,
                        identifierPrefix: "course.action"
                    )
                }

                BaggerSectionHeading("Tournament Assignments")
                ForEach(course.assignments) { assignment in
                    GuideCourseAssignmentView(assignment: assignment)
                }
            }
            .padding(BaggerLayout.pageInset)
        }
        .background(BaggerPalette.canvas.ignoresSafeArea())
        .refreshable(action: onRefresh)
        .accessibilityIdentifier("course.detail.\(course.id)")
    }
}

private struct GuideCourseAssignmentView: View {
    let assignment: GuideCourseAssignmentPresentation

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Round \(assignment.roundNumber) · \(assignment.formatCode)")
                .font(.headline)
                .foregroundStyle(BaggerPalette.ink)
            Text("\(assignment.tee) tees")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(BaggerPalette.actionGreen)
            PassportLabeledValueGrid(values: assignment.summary)

            Divider().overlay(BaggerPalette.warmBorder)

            ForEach(assignment.holes) { hole in
                GuideHoleRow(hole: hole)
            }
        }
        .baggerCard()
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("course.assignment.\(assignment.id)")
    }
}

private struct GuideHoleRow: View {
    let hole: GuideHolePresentation
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Hole \(hole.holeNumber)").font(.headline)
                    Text(detail)
                }
            } else {
                HStack {
                    Text("Hole \(hole.holeNumber)").font(.headline).frame(width: 70, alignment: .leading)
                    Text("Par \(hole.par)")
                    Spacer()
                    Text(hole.yardage.map { "\($0) yd" } ?? "Yardage —")
                    Text("SI \(hole.strokeIndex)")
                }
            }
        }
        .font(.subheadline)
        .foregroundStyle(BaggerPalette.ink)
        .padding(.vertical, 3)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Hole \(hole.holeNumber), \(detail)")
    }

    private var detail: String {
        ["Par \(hole.par)", hole.yardage.map { "\($0) yards" }, "Stroke index \(hole.strokeIndex)"]
            .compactMap { $0 }
            .joined(separator: ", ")
    }
}

private struct GuideRulesView: View {
    let roundFormats: [GuideRoundFormatPresentation]
    let rules: [GuideRulePresentation]
    let freshness: MobileReadFreshness
    let onRefresh: @MainActor @Sendable () async -> Void

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: BaggerLayout.sectionSpacing) {
                MoreFreshnessBannerView(productName: "Rules", freshness: freshness, identifierPrefix: "rules")

                if !roundFormats.isEmpty {
                    BaggerSectionHeading("Round Formats")
                    ForEach(roundFormats) { format in
                        VStack(alignment: .leading, spacing: 8) {
                            BaggerEyebrow(text: "Round \(format.roundNumber) · \(format.formatCode)")
                            Text(format.name).font(.title3.bold()).foregroundStyle(BaggerPalette.ink)
                            PassportLabeledValueGrid(values: format.details)
                            if let description = format.description { Text(description) }
                            if let rules = format.rules { Text(rules) }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .foregroundStyle(BaggerPalette.muted)
                        .baggerCard()
                        .accessibilityElement(children: .contain)
                        .accessibilityIdentifier("rules.format.\(format.id)")
                    }
                }

                BaggerSectionHeading("Rules")
                if rules.isEmpty {
                    MoreEmptyStateView(
                        title: "No rules are published yet.",
                        systemImage: "list.clipboard",
                        identifier: "rules.empty"
                    )
                } else {
                    ForEach(rules) { rule in
                        VStack(alignment: .leading, spacing: 7) {
                            Text([rule.category, rule.subcategory].compactMap { $0 }.joined(separator: " · ").uppercased())
                                .font(.caption.weight(.black))
                                .foregroundStyle(BaggerPalette.goldText)
                            HStack(alignment: .firstTextBaseline, spacing: 8) {
                                Text(rule.title).font(.headline).foregroundStyle(BaggerPalette.ink)
                                if rule.important {
                                    Text("IMPORTANT")
                                        .font(.caption2.weight(.black))
                                        .foregroundStyle(BaggerPalette.liveRed)
                                }
                            }
                            Text(rule.body)
                                .font(.body)
                                .foregroundStyle(BaggerPalette.muted)
                                .fixedSize(horizontal: false, vertical: true)
                            if let year = rule.effectiveYear {
                                Text("Effective \(year)").font(.footnote).foregroundStyle(BaggerPalette.muted)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .baggerCard(border: rule.important ? BaggerPalette.liveRed.opacity(0.5) : BaggerPalette.warmBorder)
                        .accessibilityElement(children: .combine)
                        .accessibilityIdentifier("rules.rule.\(rule.id)")
                    }
                }
            }
            .padding(BaggerLayout.pageInset)
        }
        .background(BaggerPalette.canvas.ignoresSafeArea())
        .refreshable(action: onRefresh)
        .accessibilityIdentifier("rules.screen")
    }
}

private struct GuideDiningView: View {
    let entries: [GuideDiningPresentation]
    let freshness: MobileReadFreshness
    let onRefresh: @MainActor @Sendable () async -> Void

    var body: some View {
        GuideCollectionPage(
            productName: "Dining",
            freshness: freshness,
            emptyTitle: "No dining events are published yet.",
            emptyImage: "fork.knife",
            isEmpty: entries.isEmpty,
            identifier: "dining",
            onRefresh: onRefresh
        ) {
            ForEach(entries) { entry in
                VStack(alignment: .leading, spacing: 7) {
                    BaggerEyebrow(text: entry.day)
                    Text(entry.meal).font(.title3.bold()).foregroundStyle(BaggerPalette.ink)
                    Text([entry.cuisine, entry.time].compactMap { $0 }.joined(separator: " · "))
                        .font(.subheadline.weight(.semibold)).foregroundStyle(BaggerPalette.actionGreen)
                    Label(entry.location, systemImage: "mappin").font(.subheadline)
                    if let dress = entry.dressCode { Text("Dress: \(dress)") }
                    if let reservation = entry.reservationRequired {
                        Text(reservation ? "Reservation required" : "No reservation required")
                            .fontWeight(.semibold)
                    }
                    if let notes = entry.notes { Text(notes) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .font(.subheadline)
                .foregroundStyle(BaggerPalette.muted)
                .baggerCard()
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("dining.entry.\(entry.id)")
            }
        }
    }
}

private struct GuideLocalView: View {
    let entries: [GuideLocalEntryPresentation]
    let freshness: MobileReadFreshness
    let onRefresh: @MainActor @Sendable () async -> Void

    var body: some View {
        GuideCollectionPage(
            productName: "Local Guide",
            freshness: freshness,
            emptyTitle: "No local guide entries are published yet.",
            emptyImage: "map",
            isEmpty: entries.isEmpty,
            identifier: "localGuide",
            onRefresh: onRefresh
        ) {
            ForEach(entries) { entry in
                VStack(alignment: .leading, spacing: 7) {
                    BaggerEyebrow(text: entry.category)
                    Text(entry.title).font(.title3.bold()).foregroundStyle(BaggerPalette.ink)
                    if let description = entry.description { Text(description) }
                    if let address = entry.address { Label(address, systemImage: "mappin") }
                    if let phone = entry.phone { Label(phone, systemImage: "phone") }
                    if !entry.actions.isEmpty {
                        MoreExternalActionButtons(
                            actions: entry.actions,
                            identifierPrefix: "localGuide.action.\(entry.id)"
                        )
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .font(.subheadline)
                .foregroundStyle(BaggerPalette.muted)
                .baggerCard()
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("localGuide.entry.\(entry.id)")
            }
        }
    }
}

private struct GuideContactsView: View {
    let contacts: [GuideContactPresentation]
    let freshness: MobileReadFreshness
    let onRefresh: @MainActor @Sendable () async -> Void

    var body: some View {
        GuideCollectionPage(
            productName: "Important Contacts",
            freshness: freshness,
            emptyTitle: "No contacts are published yet.",
            emptyImage: "phone",
            isEmpty: contacts.isEmpty,
            identifier: "contacts",
            onRefresh: onRefresh
        ) {
            ForEach(contacts) { contact in
                VStack(alignment: .leading, spacing: 7) {
                    BaggerEyebrow(text: contact.category)
                    Text(contact.name).font(.title3.bold()).foregroundStyle(BaggerPalette.ink)
                    if let role = contact.role { Text(role).font(.headline).foregroundStyle(BaggerPalette.actionGreen) }
                    if let phone = contact.phone { Label(phone, systemImage: "phone") }
                    if let email = contact.email { Label(email, systemImage: "envelope") }
                    if !contact.actions.isEmpty {
                        MoreExternalActionButtons(
                            actions: contact.actions,
                            identifierPrefix: "contacts.action.\(contact.id)"
                        )
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .font(.subheadline)
                .foregroundStyle(BaggerPalette.muted)
                .baggerCard()
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("contacts.entry.\(contact.id)")
            }
        }
    }
}

private struct MoreExternalActionsView: View {
    let title: String
    let actions: [MoreExternalActionPresentation]
    let identifierPrefix: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            BaggerSectionHeading(title)
            MoreExternalActionButtons(actions: actions, identifierPrefix: identifierPrefix)
                .baggerCard()
        }
    }
}

private struct MoreExternalActionButtons: View {
    let actions: [MoreExternalActionPresentation]
    let identifierPrefix: String

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 10) { actionButtons }
            VStack(alignment: .leading, spacing: 10) { actionButtons }
        }
    }

    @ViewBuilder
    private var actionButtons: some View {
        ForEach(actions) { action in
            Link(destination: action.url) {
                Label(action.label, systemImage: symbol(for: action.kind))
                    .frame(minHeight: 44)
            }
            .buttonStyle(.bordered)
            .tint(BaggerPalette.actionGreen)
            .accessibilityLabel(action.label)
            .accessibilityHint(accessibilityHint(for: action.kind))
            .accessibilityIdentifier("\(identifierPrefix).\(action.id)")
        }
    }

    private func symbol(for kind: MoreExternalActionKind) -> String {
        switch kind {
        case .phone: "phone"
        case .textMessage: "message"
        case .email: "envelope"
        case .website: "safari"
        case .directions: "map"
        }
    }

    private func accessibilityHint(for kind: MoreExternalActionKind) -> String {
        switch kind {
        case .phone: "Opens the Phone app"
        case .textMessage: "Opens Messages"
        case .email: "Opens Mail"
        case .website: "Opens the website"
        case .directions: "Opens directions"
        }
    }
}

private struct GuideCollectionPage<Content: View>: View {
    let productName: String
    let freshness: MobileReadFreshness
    let emptyTitle: String
    let emptyImage: String
    let isEmpty: Bool
    let identifier: String
    let onRefresh: @MainActor @Sendable () async -> Void
    let content: Content

    init(
        productName: String,
        freshness: MobileReadFreshness,
        emptyTitle: String,
        emptyImage: String,
        isEmpty: Bool,
        identifier: String,
        onRefresh: @escaping @MainActor @Sendable () async -> Void,
        @ViewBuilder content: () -> Content
    ) {
        self.productName = productName
        self.freshness = freshness
        self.emptyTitle = emptyTitle
        self.emptyImage = emptyImage
        self.isEmpty = isEmpty
        self.identifier = identifier
        self.onRefresh = onRefresh
        self.content = content()
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: BaggerLayout.sectionSpacing) {
                MoreFreshnessBannerView(
                    productName: productName,
                    freshness: freshness,
                    identifierPrefix: identifier
                )
                if isEmpty {
                    MoreEmptyStateView(
                        title: emptyTitle,
                        systemImage: emptyImage,
                        identifier: "\(identifier).empty"
                    )
                } else {
                    content
                }
            }
            .padding(BaggerLayout.pageInset)
        }
        .background(BaggerPalette.canvas.ignoresSafeArea())
        .refreshable(action: onRefresh)
        .accessibilityIdentifier("\(identifier).screen")
    }
}
