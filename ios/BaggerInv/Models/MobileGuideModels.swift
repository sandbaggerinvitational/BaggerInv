import Foundation

enum MobileGuidePublicationState: String, Codable, Equatable, Sendable {
    case unpublished = "UNPUBLISHED"
    case published = "PUBLISHED"
}

struct MobileGuideTournament: Codable, Equatable, Sendable {
    let tournamentId: String
    let year: Int
    let name: String
    @MobileRequiredNullable var editionTitle: String?
    @MobileRequiredNullable var dates: String?
    @MobileRequiredNullable var location: String?
    let timeZone: String
    @MobileRequiredNullable var logoAssetKey: String?
    @MobileRequiredNullable var heroAssetKey: String?
    @MobileRequiredNullable var mobileHeroAssetKey: String?
}

struct MobileGuideOverviewSection: Codable, Equatable, Sendable {
    let sectionId: String
    let slug: String
    @MobileRequiredNullable var title: String?
    let body: String
    let sortOrder: Int
}

struct MobileGuideRules: Codable, Equatable, Sendable {
    let roundFormats: [MobileGuideRoundFormat]
    let items: [MobileGuideRuleItem]
}

struct MobileGuideRoundFormat: Codable, Equatable, Sendable {
    let roundNumber: Int
    let format: MobilePassportFormat
    let name: String
    @MobileRequiredNullable var teamSize: Int?
    @MobileRequiredNullable var pointsAvailable: Double?
    @MobileRequiredNullable var frontNineUsed: Bool?
    @MobileRequiredNullable var frontNinePoints: Double?
    @MobileRequiredNullable var backNineUsed: Bool?
    @MobileRequiredNullable var backNinePoints: Double?
    @MobileRequiredNullable var overallUsed: Bool?
    @MobileRequiredNullable var overallPoints: Double?
    @MobileRequiredNullable var description: String?
    @MobileRequiredNullable var rules: String?
    @MobileRequiredNullable var handicapAllocation: String?
    @MobileRequiredNullable var handicap: String?
    @MobileRequiredNullable var handicapRules: String?
    @MobileRequiredNullable var playingHandicap: String?
    @MobileRequiredNullable var scoringFormat: String?
    @MobileRequiredNullable var scoring: String?
    @MobileRequiredNullable var matchFormat: String?
}

struct MobileGuideRuleItem: Codable, Equatable, Sendable {
    let ruleId: String
    let category: String
    @MobileRequiredNullable var subcategory: String?
    let title: String
    let body: String
    let sortOrder: Int
    @MobileRequiredNullable var effectiveYear: Int?
    let important: Bool
}

struct MobileGuideCourse: Codable, Equatable, Sendable {
    let courseId: String
    let name: String
    @MobileRequiredNullable var city: String?
    @MobileRequiredNullable var state: String?
    @MobileRequiredNullable var location: String?
    @MobileRequiredNullable var yearOpened: Int?
    @MobileRequiredNullable var designer: String?
    @MobileRequiredNullable var website: String?
    @MobileRequiredNullable var directionsUrl: String?
    @MobileRequiredNullable var logoAssetKey: String?
    @MobileRequiredNullable var profileAssetKey: String?
    @MobileRequiredNullable var overview: String?
    @MobileRequiredNullable var playingTips: String?
    @MobileRequiredNullable var signatureHoles: String?
    @MobileRequiredNullable var history: String?
    let assignments: [MobileGuideCourseAssignment]
}

struct MobileGuideCourseAssignment: Codable, Equatable, Sendable {
    let assignmentId: String
    let roundNumber: Int
    let format: MobilePassportFormat
    let tee: String
    let rating: Double
    let slope: Int
    let par: Int
    @MobileRequiredNullable var yardage: Int?
    let holes: [MobileGuideHole]
}

struct MobileGuideHole: Codable, Equatable, Sendable {
    let holeNumber: Int
    let par: Int
    @MobileRequiredNullable var yardage: Int?
    let strokeIndex: Int
}

struct MobileGuideDining: Codable, Equatable, Sendable {
    let diningId: String
    let year: Int
    let day: String
    let meal: String
    @MobileRequiredNullable var cuisine: String?
    @MobileRequiredNullable var startTime: String?
    @MobileRequiredNullable var endTime: String?
    let location: String
    @MobileRequiredNullable var dressCode: String?
    @MobileRequiredNullable var reservationRequired: Bool?
    @MobileRequiredNullable var notes: String?
    let sortOrder: Int
}

struct MobileGuideLocalEntry: Codable, Equatable, Sendable {
    let entryId: String
    let year: Int
    let category: String
    let title: String
    @MobileRequiredNullable var description: String?
    @MobileRequiredNullable var address: String?
    @MobileRequiredNullable var phone: String?
    @MobileRequiredNullable var website: String?
    let sortOrder: Int
}

struct MobileGuideContact: Codable, Equatable, Sendable {
    let contactId: String
    let year: Int
    let category: String
    let name: String
    @MobileRequiredNullable var role: String?
    @MobileRequiredNullable var phone: String?
    let textEnabled: Bool
    @MobileRequiredNullable var email: String?
    @MobileRequiredNullable var website: String?
    let sortOrder: Int
}

struct MobileGuideData: MobileReadPayload {
    let contractVersion: String
    let tournamentId: String
    let publicationState: MobileGuidePublicationState
    @MobileRequiredNullable var publishedAt: MobileTimestamp?
    @MobileRequiredNullable var tournament: MobileGuideTournament?
    let overview: [MobileGuideOverviewSection]
    let rules: MobileGuideRules
    let courses: [MobileGuideCourse]
    let dining: [MobileGuideDining]
    let localGuide: [MobileGuideLocalEntry]
    let contacts: [MobileGuideContact]

    var contextBinding: MobileReadContextBinding { .tournament(tournamentId) }

    var revocableParticipantRepresentationKeys: Set<String> {
        publicationState == .published ? ["guide:\(tournamentId)"] : []
    }

    var isStructurallyCompatible: Bool {
        guard contractVersion == "guide-v1",
              MobileParticipantContentValidation.id(tournamentId, maximum: 160),
              overview.count <= 100,
              rules.roundFormats.count <= 12,
              rules.items.count <= 300,
              courses.count <= 12,
              dining.count <= 100,
              localGuide.count <= 200,
              contacts.count <= 100,
              overview.allSatisfy(\.isStructurallyCompatible),
              rules.roundFormats.allSatisfy(\.isStructurallyCompatible),
              rules.items.allSatisfy(\.isStructurallyCompatible),
              courses.allSatisfy(\.isStructurallyCompatible),
              dining.allSatisfy(\.isStructurallyCompatible),
              contacts.allSatisfy(\.isStructurallyCompatible),
              localGuide.allSatisfy(\.isStructurallyCompatible)
        else { return false }

        switch publicationState {
        case .published:
            return publishedAt != nil &&
                (tournament?.isStructurallyCompatible ?? false)
        case .unpublished:
            return publishedAt == nil &&
                tournament == nil &&
                overview.isEmpty &&
                rules.roundFormats.isEmpty &&
                rules.items.isEmpty &&
                courses.isEmpty &&
                dining.isEmpty &&
                localGuide.isEmpty &&
                contacts.isEmpty
        }
    }
}

typealias MobileGuideResponse = MobileReadResponse<MobileGuideData>

private extension MobileGuideTournament {
    var isStructurallyCompatible: Bool {
        MobileParticipantContentValidation.id(tournamentId, maximum: 160) &&
        (1900...2200).contains(year) &&
        MobileParticipantContentValidation.text(name, maximum: 240) &&
        MobileParticipantContentValidation.text(editionTitle, maximum: 500) &&
        MobileParticipantContentValidation.text(dates, maximum: 500) &&
        MobileParticipantContentValidation.text(location, maximum: 500) &&
        MobileParticipantContentValidation.text(timeZone, maximum: 100) &&
        MobileParticipantContentValidation.assetKey(logoAssetKey) &&
        MobileParticipantContentValidation.assetKey(heroAssetKey) &&
        MobileParticipantContentValidation.assetKey(mobileHeroAssetKey)
    }
}

private extension MobileGuideOverviewSection {
    var isStructurallyCompatible: Bool {
        MobileParticipantContentValidation.id(sectionId, maximum: 160) &&
        slug.count <= 120 &&
        slug.range(of: #"^[a-z0-9]+(?:-[a-z0-9]+)*$"#, options: .regularExpression) != nil &&
        MobileParticipantContentValidation.text(title, maximum: 500) &&
        MobileParticipantContentValidation.text(body, maximum: 20_000) &&
        (0...100_000).contains(sortOrder)
    }
}

private extension MobileGuideRoundFormat {
    var isStructurallyCompatible: Bool {
        (1...99).contains(roundNumber) &&
        MobileParticipantContentValidation.text(name, maximum: 160) &&
        (teamSize.map { (1...8).contains($0) } ?? true) &&
        MobileParticipantContentValidation.finite(pointsAvailable, minimum: 0, maximum: 100) &&
        MobileParticipantContentValidation.finite(frontNinePoints, minimum: 0, maximum: 100) &&
        MobileParticipantContentValidation.finite(backNinePoints, minimum: 0, maximum: 100) &&
        MobileParticipantContentValidation.finite(overallPoints, minimum: 0, maximum: 100) &&
        MobileParticipantContentValidation.text(description, maximum: 20_000) &&
        MobileParticipantContentValidation.text(rules, maximum: 20_000) &&
        MobileParticipantContentValidation.text(handicapAllocation, maximum: 20_000) &&
        MobileParticipantContentValidation.text(handicap, maximum: 20_000) &&
        MobileParticipantContentValidation.text(handicapRules, maximum: 20_000) &&
        MobileParticipantContentValidation.text(playingHandicap, maximum: 20_000) &&
        MobileParticipantContentValidation.text(scoringFormat, maximum: 20_000) &&
        MobileParticipantContentValidation.text(scoring, maximum: 20_000) &&
        MobileParticipantContentValidation.text(matchFormat, maximum: 20_000)
    }
}

private extension MobileGuideRuleItem {
    var isStructurallyCompatible: Bool {
        MobileParticipantContentValidation.id(ruleId, maximum: 160) &&
        MobileParticipantContentValidation.text(category, maximum: 160) &&
        MobileParticipantContentValidation.text(subcategory, maximum: 160) &&
        MobileParticipantContentValidation.text(title, maximum: 300) &&
        MobileParticipantContentValidation.text(body, maximum: 20_000) &&
        (0...100_000).contains(sortOrder) &&
        (effectiveYear.map { (1900...2200).contains($0) } ?? true)
    }
}

private extension MobileGuideCourse {
    var isStructurallyCompatible: Bool {
        MobileParticipantContentValidation.id(courseId, maximum: 160) &&
        MobileParticipantContentValidation.text(name, maximum: 300) &&
        MobileParticipantContentValidation.text(city, maximum: 160) &&
        MobileParticipantContentValidation.text(state, maximum: 160) &&
        MobileParticipantContentValidation.text(location, maximum: 500) &&
        (yearOpened.map { (1700...2200).contains($0) } ?? true) &&
        MobileParticipantContentValidation.text(designer, maximum: 500) &&
        MobileParticipantContentValidation.httpsURL(website) &&
        MobileParticipantContentValidation.httpsURL(directionsUrl) &&
        MobileParticipantContentValidation.assetKey(logoAssetKey) &&
        MobileParticipantContentValidation.assetKey(profileAssetKey) &&
        MobileParticipantContentValidation.text(overview, maximum: 20_000) &&
        MobileParticipantContentValidation.text(playingTips, maximum: 20_000) &&
        MobileParticipantContentValidation.text(signatureHoles, maximum: 20_000) &&
        MobileParticipantContentValidation.text(history, maximum: 20_000) &&
        (1...12).contains(assignments.count) &&
        assignments.allSatisfy(\.isStructurallyCompatible)
    }
}

private extension MobileGuideCourseAssignment {
    var isStructurallyCompatible: Bool {
        MobileParticipantContentValidation.id(assignmentId, maximum: 160) &&
        (1...99).contains(roundNumber) &&
        MobileParticipantContentValidation.text(tee, maximum: 160) &&
        MobileParticipantContentValidation.finite(
            rating,
            minimum: 0,
            maximum: 100,
            exclusiveMinimum: true
        ) &&
        (1...300).contains(slope) &&
        (1...200).contains(par) &&
        (yardage.map { (1...20_000).contains($0) } ?? true) &&
        holes.count == 18 &&
        holes.allSatisfy(\.isStructurallyCompatible)
    }
}

private extension MobileGuideHole {
    var isStructurallyCompatible: Bool {
        (1...18).contains(holeNumber) &&
        (1...9).contains(par) &&
        (yardage.map { (1...1_500).contains($0) } ?? true) &&
        (1...18).contains(strokeIndex)
    }
}

private extension MobileGuideDining {
    var isStructurallyCompatible: Bool {
        MobileParticipantContentValidation.id(diningId, maximum: 160) &&
        (1900...2200).contains(year) &&
        MobileParticipantContentValidation.text(day, maximum: 160) &&
        MobileParticipantContentValidation.text(meal, maximum: 240) &&
        MobileParticipantContentValidation.text(cuisine, maximum: 500) &&
        MobileParticipantContentValidation.text(startTime, maximum: 80) &&
        MobileParticipantContentValidation.text(endTime, maximum: 80) &&
        MobileParticipantContentValidation.text(location, maximum: 500) &&
        MobileParticipantContentValidation.text(dressCode, maximum: 500) &&
        MobileParticipantContentValidation.text(notes, maximum: 10_000) &&
        (0...100_000).contains(sortOrder)
    }
}

private extension MobileGuideContact {
    var isStructurallyCompatible: Bool {
        MobileParticipantContentValidation.id(contactId, maximum: 160) &&
        (1900...2200).contains(year) &&
        MobileParticipantContentValidation.text(category, maximum: 200) &&
        MobileParticipantContentValidation.text(name, maximum: 300) &&
        MobileParticipantContentValidation.text(role, maximum: 500) &&
        MobileParticipantContentValidation.phone(phone) &&
        MobileParticipantContentValidation.email(email) &&
        MobileParticipantContentValidation.httpsURL(website) &&
        (0...100_000).contains(sortOrder)
    }
}

private extension MobileGuideLocalEntry {
    var isStructurallyCompatible: Bool {
        MobileParticipantContentValidation.id(entryId, maximum: 160) &&
        (1900...2200).contains(year) &&
        MobileParticipantContentValidation.text(category, maximum: 200) &&
        MobileParticipantContentValidation.text(title, maximum: 300) &&
        MobileParticipantContentValidation.text(description, maximum: 20_000) &&
        MobileParticipantContentValidation.text(address, maximum: 1_000) &&
        MobileParticipantContentValidation.phone(phone) &&
        MobileParticipantContentValidation.httpsURL(website) &&
        (0...100_000).contains(sortOrder)
    }
}
