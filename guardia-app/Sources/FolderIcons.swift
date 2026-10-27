import AppKit
import WebKit

// New folders get their paper icon on their own. Guardia watches the folders listed in
// ~/.guardia/icons/folder-watch.json (Koding, the Desktop and home, written by
// scripts/render-icons.mjs from icons/folders.js). When a folder appears there, or one is
// renamed, its sticker is drawn by the same code as the rest (icons/folders.js, inside the
// bundle) in a short-lived web view, put on, and added to folders.json so restore takes it off.
final class FolderIcons: NSObject {
    struct Watch: Codable { let parents: [String]; let skip: [String] }

    private let dir = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".guardia/icons")
    private var watch: Watch?
    private var sources: [DispatchSourceFileSystemObject] = []
    private var scanWork: DispatchWorkItem?
    private var web: WKWebView?
    private var host: NSWindow?
    private var idle: DispatchWorkItem?
    private var busy = false
    private var watched: [String] = []
    private var refused: [String] = []
    private var retry: Timer?
    // Touching the Desktop makes macOS ask for permission, and the asking thread waits for the
    // answer: all file work happens here, never on the main thread (it froze Guardia once).
    private let io = DispatchQueue(label: "id.guardia.folders", qos: .utility)

    func start() {
        guard sources.isEmpty,
              let d = try? Data(contentsOf: dir.appendingPathComponent("folder-watch.json")),
              let w = try? JSONDecoder().decode(Watch.self, from: d) else { return }
        watch = w
        refused = w.parents
        attach()
        // the Desktop is guarded by macOS: until Guardia is allowed in, keep asking once a minute
        retry = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in self?.attach() }
    }

    private func attach() {
        // each folder on its own, so one waiting on a permission prompt holds up nothing else
        for parent in refused where !asking.contains(parent) {
            asking.insert(parent)
            DispatchQueue.global(qos: .utility).async { [weak self] in
                let fd = open(parent, O_EVTONLY)
                // a folder we may open but not read is as good as refused
                let ok = fd >= 0 && (try? FileManager.default.contentsOfDirectory(atPath: parent)) != nil
                if !ok && fd >= 0 { close(fd) }
                DispatchQueue.main.async {
                    guard let self else { if ok { close(fd) }; return }
                    self.asking.remove(parent)
                    guard ok else { return }
                    let src = DispatchSource.makeFileSystemObjectSource(fileDescriptor: fd, eventMask: [.write, .rename, .link], queue: .main)
                    src.setEventHandler { [weak self] in self?.scheduleScan() }
                    src.setCancelHandler { close(fd) }
                    src.resume()
                    self.sources.append(src)
                    self.watched.append(parent)
                    self.refused.removeAll { $0 == parent }
                    if self.refused.isEmpty { self.retry?.invalidate(); self.retry = nil }
                    self.scheduleScan()
                }
            }
        }
    }
    private var asking = Set<String>()

    /// For `guardia://status`.
    var debugState: [String: Any] { ["watching": watched, "refused": refused] }

    // a new Finder folder is "untitled folder" for a moment before it gets its name
    private func scheduleScan() {
        scanWork?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.scan() }
        scanWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5, execute: work)
    }

    private var manifestURL: URL { dir.appendingPathComponent("folders.json") }

    private func scan() {
        guard let w = watch, !busy else { return }
        let parents = watched, manifest = manifestURL
        io.async { [weak self] in
            let fresh = FolderIcons.newFolders(in: parents, skip: w.skip, manifest: manifest)
            DispatchQueue.main.async { if !fresh.isEmpty, let self, !self.busy { self.render(fresh) } }
        }
    }

    private static func newFolders(in parents: [String], skip: [String], manifest: URL) -> [(id: String, path: String, name: String)] {
        let fm = FileManager.default
        let home = fm.homeDirectoryForCurrentUser.standardizedFileURL.path
        let known = Set((AppIcons.load(manifest.path)?.apps ?? []).map(\.app))
        var fresh: [(id: String, path: String, name: String)] = []
        for parent in parents {
            let items = (try? fm.contentsOfDirectory(at: URL(fileURLWithPath: parent), includingPropertiesForKeys: [.isDirectoryKey, .isSymbolicLinkKey, .isPackageKey], options: [.skipsHiddenFiles])) ?? []
            for url in items {
                guard let v = try? url.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey, .isPackageKey]),
                      v.isDirectory == true, v.isSymbolicLink != true, v.isPackage != true else { continue }
                let name = url.lastPathComponent
                if URL(fileURLWithPath: parent).standardizedFileURL.path == home && skip.contains(name) { continue }
                let path = url.standardizedFileURL.path
                guard !known.contains(path) else { continue }
                let id = "f-" + String(Data(path.utf8).base64EncodedString().replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "=", with: "").suffix(24))
                fresh.append((id, path, name))
            }
        }
        return fresh
    }

    // ------------------------------------------------------------------ drawing in a web view
    private func render(_ items: [(id: String, path: String, name: String)]) {
        busy = true
        withPage { [weak self] web in
            guard let self else { return }
            let list = items.map { ["id": $0.id, "name": $0.name] }
            web.callAsyncJavaScript("return window.renderFolders(list)", arguments: ["list": list], in: nil, in: .page) { [weak self] result in
                guard let self else { return }
                defer { self.busy = false; self.releaseSoon(); self.scheduleScan() }
                guard case .success(let value) = result, let pngs = value as? [String: String] else { return }
                var added: [AppIcons.Entry] = []
                try? FileManager.default.createDirectory(at: self.dir.appendingPathComponent("folders"), withIntermediateDirectories: true)
                for it in items {
                    guard let url = pngs[it.id], let comma = url.firstIndex(of: ","), let data = Data(base64Encoded: String(url[url.index(after: comma)...])) else { continue }
                    let png = self.dir.appendingPathComponent("folders/\(it.id).png")
                    guard (try? data.write(to: png)) != nil, let img = NSImage(data: data),
                          NSWorkspace.shared.setIcon(img, forFile: it.path, options: []) else { continue }
                    added.append(AppIcons.Entry(id: it.id, name: it.name, app: it.path, png: png.path))
                }
                self.remember(added)
            }
        }
    }

    private func remember(_ added: [AppIcons.Entry]) {
        guard !added.isEmpty else { return }
        let old = AppIcons.load(manifestURL.path)
        // folders that were renamed or deleted since drop out of the list
        let kept = (old?.apps ?? []).filter { FileManager.default.fileExists(atPath: $0.app) }
        let m = AppIcons.Manifest(repo: old?.repo ?? "", apps: kept + added)
        if let d = try? JSONEncoder().encode(m) { try? d.write(to: manifestURL) }
    }

    private func withPage(_ then: @escaping (WKWebView) -> Void) {
        idle?.cancel()
        if let web { then(web); return }
        let cfg = WKWebViewConfiguration()
        cfg.setURLSchemeHandler(ResourceScheme(), forURLScheme: "guardia")
        let web = WKWebView(frame: CGRect(x: 0, y: 0, width: 64, height: 64), configuration: cfg)
        // a window far off screen keeps the page running without ever showing it
        let host = NSWindow(contentRect: web.frame, styleMask: [.borderless], backing: .buffered, defer: false)
        host.isReleasedWhenClosed = false
        host.contentView = web
        host.setFrameOrigin(NSPoint(x: -5000, y: -5000))
        host.orderBack(nil)
        self.web = web; self.host = host
        web.load(URLRequest(url: URL(string: "guardia://app/icons/folder.html")!))
        waitReady(web, tries: 40, then: then)
    }

    private func waitReady(_ web: WKWebView, tries: Int, then: @escaping (WKWebView) -> Void) {
        web.evaluateJavaScript("window.__ready === true") { [weak self] ok, _ in
            if (ok as? Bool) == true { then(web); return }
            guard tries > 0 else { self?.busy = false; self?.release(); return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { self?.waitReady(web, tries: tries - 1, then: then) }
        }
    }

    // the page (and its process) only lives while there is drawing to do
    private func releaseSoon() {
        idle?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.release() }
        idle = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 20, execute: work)
    }

    private func release() {
        host?.contentView = nil
        host?.close()
        web = nil; host = nil
    }
}
