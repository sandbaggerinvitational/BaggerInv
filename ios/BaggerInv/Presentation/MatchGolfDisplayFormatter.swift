import Foundation

/// Participant-facing handicap strings always have one decimal place.
/// Formatting never replaces the full canonical numeric value in a model.
enum HandicapDisplayFormatter {
    static func string(_ value: Double) -> String {
        guard value.isFinite else { return "—" }
        return string(from: NSNumber(value: value == 0 ? 0 : value))
    }

    static func string(_ value: Decimal) -> String {
        guard !value.isNaN else { return "—" }
        return string(from: NSDecimalNumber(decimal: value))
    }

    private static func string(from value: NSNumber) -> String {
        let formatter = NumberFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.numberStyle = .decimal
        formatter.usesGroupingSeparator = false
        formatter.minimumFractionDigits = 1
        formatter.maximumFractionDigits = 1
        formatter.roundingMode = .halfUp
        formatter.negativePrefix = "("
        formatter.negativeSuffix = ")"
        return formatter.string(from: value) ?? "—"
    }
}

/// Handicap and stroke strings share presentation conventions, not authority.
/// Neither value is derived from the other.
enum MatchGolfDisplayFormatter {
    static func playingHandicap(_ value: Double) -> String {
        HandicapDisplayFormatter.string(value)
    }

    static func strokes(
        _ value: Int,
        scope: MatchesGolfContextScope,
        accessibility: Bool = false
    ) -> String {
        if accessibility {
            guard value > 0 else { return scope == .team ? "No team strokes" : "No strokes" }
            let unit = value == 1 ? "stroke" : "strokes"
            return scope == .team ? "\(value) team \(unit)" : "\(value) \(unit)"
        }
        guard value > 0 else { return "No strokes" }
        return "+\(value) \(value == 1 ? "stroke" : "strokes")"
    }
}
