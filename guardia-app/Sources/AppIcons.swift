import AppKit

// Custom app icons in the room's print (drawn by icons/emblems.js, exported by
// scripts/render-icons.mjs). `Guardia --set-icons <manifest>` puts them on, `--restore-icons`
// takes them off; scripts/app-icons.sh runs both, with sudo for apps the system owns.
// An app that updates itself replaces its bundle and loses the custom icon: `missing()` finds
// those so the island can offer to put them back.
enum AppIcons {
    struct Entry: Codable { let id: String; let name: String; let app: String; let png: String }
    struct Manifest: Codable { let repo: String; let apps: [Entry] }

    static let manifestURL = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".guardia/icons/manifest.json")

    static func load(_ path: String) -> Manifest? {
        guard let d = FileManager.default.contents(atPath: path) else { return nil }
        return try? JSONDecoder().decode(Manifest.self, from: d)
    }

    /// Prints one line per app ("ok id" or "gagal id") and returns false if any failed.
    static func apply(_ path: String) -> Bool {
        guard let m = load(path) else { print("manifest tidak terbaca: \(path)"); return false }
        var ok = true, done: [String] = []
        for e in m.apps {
            guard FileManager.default.fileExists(atPath: e.app), let img = NSImage(contentsOfFile: e.png) else { print("lewat \(e.id)"); continue }
            if NSWorkspace.shared.setIcon(img, forFile: e.app, options: []) { print("ok \(e.id)"); done.append(e.id) } else { print("gagal \(e.id)"); ok = false }
        }
        record(done, beside: path)
        return ok
    }

    // which apps got their icon, kept beside the manifest that was applied (sudo or not), so
    // only those are watched for an update undoing it
    private static func record(_ ids: [String], beside manifest: String) {
        let url = URL(fileURLWithPath: manifest)
        let file = url.deletingLastPathComponent().appendingPathComponent("applied-\(url.deletingPathExtension().lastPathComponent).json")
        try? JSONEncoder().encode(ids).write(to: file)
    }

    private static func applied() -> Set<String> {
        let dir = manifestURL.deletingLastPathComponent()
        let files = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? []
        var ids = Set<String>()
        for f in files where f.lastPathComponent.hasPrefix("applied-") {
            if let d = try? Data(contentsOf: f), let list = try? JSONDecoder().decode([String].self, from: d) { ids.formUnion(list) }
        }
        return ids
    }

    static func restore(_ path: String) -> Bool {
        guard let m = load(path) else { return false }
        var ok = true
        for e in m.apps where FileManager.default.fileExists(atPath: e.app) {
            if NSWorkspace.shared.setIcon(nil, forFile: e.app, options: []) { print("asli \(e.id)") } else { print("gagal \(e.id)"); ok = false }
        }
        record([], beside: path)
        return ok
    }

    /// Apps from the last `apply` that no longer carry their custom icon.
    static func missing() -> [Entry] {
        guard let m = load(manifestURL.path) else { return [] }
        let done = applied()
        return m.apps.filter { done.contains($0.id) && FileManager.default.fileExists(atPath: $0.app) && !FileManager.default.fileExists(atPath: $0.app + "/Icon\r") }
    }

    static var repo: URL? { load(manifestURL.path).map { URL(fileURLWithPath: $0.repo) } }
}
