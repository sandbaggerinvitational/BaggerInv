// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "Build10SQLiteHarness",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "build10-sqlite-harness", targets: ["Build10SQLiteHarness"]),
    ],
    targets: [
        .executableTarget(
            name: "Build10SQLiteHarness",
            path: "Sources/Build10SQLiteHarness",
            linkerSettings: [.linkedLibrary("sqlite3")]
        ),
    ]
)
