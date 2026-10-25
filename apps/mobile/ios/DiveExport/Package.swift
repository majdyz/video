// swift-tools-version: 5.9
import PackageDescription

// Native export core for the iOS app, kept free of Capacitor so it can be
// unit-tested on the simulator (`xcodebuild test -scheme DiveExport`, see
// .github/workflows/mobile.yml): loopback HTTP endpoint for frames, the
// AVAssetWriter encoder with audio passthrough, pixel conversion.
let package = Package(
    name: "DiveExport",
    platforms: [.iOS(.v15), .macOS(.v13)],
    products: [
        .library(name: "DiveExport", targets: ["DiveExport"])
    ],
    targets: [
        .target(name: "DiveExport", path: "Sources/DiveExport"),
        .testTarget(name: "DiveExportTests", dependencies: ["DiveExport"], path: "Tests/DiveExportTests")
    ]
)
