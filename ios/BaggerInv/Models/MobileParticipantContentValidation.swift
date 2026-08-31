import Foundation

enum MobileParticipantContentValidation {
    static func id(_ value: String, maximum: Int = 128) -> Bool {
        value.count <= maximum &&
        value.range(
            of: #"^[A-Za-z0-9][A-Za-z0-9._:-]*$"#,
            options: .regularExpression
        ) != nil
    }

    static func text(_ value: String, maximum: Int, allowEmpty: Bool = false) -> Bool {
        let count = value.count
        return count <= maximum && (allowEmpty || count > 0)
    }

    static func text(_ value: String?, maximum: Int, allowEmpty: Bool = true) -> Bool {
        value.map { text($0, maximum: maximum, allowEmpty: allowEmpty) } ?? true
    }

    static func finite(_ value: Double?) -> Bool {
        value.map(\.isFinite) ?? true
    }

    static func finite(
        _ value: Double,
        minimum: Double? = nil,
        maximum: Double? = nil,
        exclusiveMinimum: Bool = false
    ) -> Bool {
        guard value.isFinite else { return false }
        if let minimum {
            guard exclusiveMinimum ? value > minimum : value >= minimum else { return false }
        }
        if let maximum, value > maximum { return false }
        return true
    }

    static func finite(
        _ value: Double?,
        minimum: Double? = nil,
        maximum: Double? = nil,
        exclusiveMinimum: Bool = false
    ) -> Bool {
        value.map {
            finite(
                $0,
                minimum: minimum,
                maximum: maximum,
                exclusiveMinimum: exclusiveMinimum
            )
        } ?? true
    }

    static func nonnegative(_ value: Double?) -> Bool {
        value.map { $0.isFinite && $0 >= 0 } ?? true
    }

    static func year(_ value: Int?) -> Bool {
        value.map { (2000...2200).contains($0) } ?? true
    }

    static func httpsURL(_ value: String?) -> Bool {
        guard let value else { return true }
        guard value.count <= 2_048,
              let components = URLComponents(string: value),
              components.scheme?.lowercased() == "https",
              components.host?.isEmpty == false
        else { return false }
        return true
    }

    static func assetKey(_ value: String?) -> Bool {
        guard let value else { return true }
        guard value.count <= 240 else { return false }
        return value.range(
            of: #"^[A-Za-z0-9][A-Za-z0-9._-]*(?:/[A-Za-z0-9][A-Za-z0-9._-]*)*$"#,
            options: .regularExpression
        ) != nil
    }

    static func phone(_ value: String?) -> Bool {
        guard let value else { return true }
        guard value.count <= 80 else { return false }
        return value.range(
            of: #"^\+?[0-9() .,#-]+(?: *(?:[xX]|[eE][xX][tT]\.?) *[0-9]{1,8})?$"#,
            options: .regularExpression
        ) != nil
    }

    static func email(_ value: String?) -> Bool {
        guard let value else { return true }
        guard !value.isEmpty, value.count <= 254,
              value.range(of: #"\s"#, options: .regularExpression) == nil
        else { return false }
        let parts = value.split(separator: "@", omittingEmptySubsequences: false)
        return parts.count == 2 && !parts[0].isEmpty && !parts[1].isEmpty
    }
}
