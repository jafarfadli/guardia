import AppKit

// Custom app icons in the room's print (drawn by icons/emblems.js, exported by
// scripts/render-icons.mjs). `Guardia --set-icons <manifest>` puts them on, `--restore-icons`
// takes them off; scripts/app-icons.sh runs both, with sudo for apps the system owns.
// An app that updates itself replaces its bundle and loses the custom icon, but keeps the flag
// that says it has one, so macOS shows a plain folder. `missing()` finds those; `heal()` puts
// back the ones you own (no password needed) and `IconWatch` runs it after each update.
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

    /// Why the last refusal happened, for `guardia://status`.
    static var whyRefused = "-"

    static var repo: URL? { load(manifestURL.path).map { URL(fileURLWithPath: $0.repo) } }

    /// Puts the icon back on lost apps you own whose update has settled (nothing in the bundle
    /// changed for `settle` seconds). Apps the system owns need sudo and are left for the script.
    static func heal(settle: TimeInterval = 20) -> (fixed: [Entry], refused: [Entry], waiting: Bool) {
        var fixed: [Entry] = [], refused: [Entry] = [], waiting = false
        let fm = FileManager.default
        for e in missing() {
            guard let a = try? fm.attributesOfItem(atPath: e.app), (a[.ownerAccountID] as? NSNumber)?.uint32Value == getuid(),
                  let img = NSImage(contentsOfFile: e.png) else { continue }
            let changed = [e.app, e.app + "/Contents", e.app + "/Contents/Info.plist"]
                .compactMap { (try? fm.attributesOfItem(atPath: $0))?[.modificationDate] as? Date }.max() ?? .distantPast
            guard Date().timeIntervalSince(changed) > settle else { waiting = true; continue }
            if NSWorkspace.shared.setIcon(img, forFile: e.app, options: []) {
                // the Dock only looks again at a bundle that seems changed
                try? fm.setAttributes([.modificationDate: Date()], ofItemAtPath: e.app)
                fixed.append(e)
            } else {
                refused.append(e)
                // setIcon says only no: writing into the bundle tells why (App Management says EPERM)
                let probe = e.app + "/.guardia-probe"
                if fm.createFile(atPath: probe, contents: Data()) { try? fm.removeItem(atPath: probe); whyRefused = "setIcon gagal" }
                else { whyRefused = String(cString: strerror(errno)) }
            }
        }
        return (fixed, refused, waiting)
    }
}

/// Watches the folders the icon apps live in (an update swaps the bundle there) and checks every
/// few minutes for updates made inside a bundle, then heals what it can.
final class IconWatch {
    /// Apps it gave their icon back, and apps macOS wouldn't let it change.
    var onHeal: (_ fixed: [AppIcons.Entry], _ refused: [AppIcons.Entry]) -> Void = { _, _ in }
    private var sources: [DispatchSourceFileSystemObject] = []
    private var timer: Timer?
    private var work: DispatchWorkItem?
    private var told = Set<String>()
    private(set) var lastFixed: [String] = []

    func start() {
        guard timer == nil, let m = AppIcons.load(AppIcons.manifestURL.path) else { return }
        for dir in Set(m.apps.map { ($0.app as NSString).deletingLastPathComponent }) {
            let fd = open(dir, O_EVTONLY)
            guard fd >= 0 else { continue }
            let src = DispatchSource.makeFileSystemObjectSource(fileDescriptor: fd, eventMask: [.write, .rename, .link], queue: .main)
            src.setEventHandler { [weak self] in self?.soon() }
            src.setCancelHandler { close(fd) }
            src.resume()
            sources.append(src)
        }
        timer = Timer.scheduledTimer(withTimeInterval: 300, repeats: true) { [weak self] _ in self?.check() }
        timer?.tolerance = 30
        DispatchQueue.main.asyncAfter(deadline: .now() + 15) { [weak self] in self?.check() }
    }

    // an update writes for a while: wait until it has been quiet
    private func soon() {
        work?.cancel()
        let w = DispatchWorkItem { [weak self] in self?.check() }
        work = w
        DispatchQueue.main.asyncAfter(deadline: .now() + 25, execute: w)
    }

    func check() {
        let r = AppIcons.heal()
        if !r.fixed.isEmpty { lastFixed = r.fixed.map(\.id) }
        // a refusal is said once per app, not every five minutes
        let refused = r.refused.filter { told.insert($0.id).inserted }
        if !r.fixed.isEmpty || !refused.isEmpty { onHeal(r.fixed, refused) }
        // an update still writing: look again once it has settled
        if r.waiting { soon() }
    }

    var debugState: [String: Any] { ["watching": sources.count, "lost": AppIcons.missing().map(\.id), "lastFixed": lastFixed, "refused": Array(told), "why": AppIcons.whyRefused] }
}
