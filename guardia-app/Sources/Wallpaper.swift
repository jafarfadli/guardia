import AppKit
import WebKit

// The room, full-screen at desktop level on every display and every Space (below Finder's
// icons). Live, a web page draws it and follows the sun; switched off, it freezes into a still
// taken from that page at that moment, and the page (and its memory) goes away.
// macOS may kill a live page's process while the desktop is covered (memory pressure); the page
// is then reloaded, and a check every minute reloads any page that stopped answering.
final class WallpaperController: NSObject, WKNavigationDelegate {
    private var windows: [CGDirectDisplayID: NSWindow] = [:]
    private var views: [WKWebView] = []
    private let scheme = ResourceScheme()
    private(set) var running = false
    private(set) var live = true
    private var observing = false
    private var check: Timer?
    private var lastAnswer: [String: Any] = [:]
    var lowPower = false { didSet { broadcast("window.guardia && window.guardia.setLowPower(\(lowPower))") } }
    var nowPlayingJS = "window.guardia && window.guardia.setNowPlaying(null)"

    func start(live: Bool) {
        guard !running else { return }
        running = true
        self.live = live
        if !observing {
            observing = true
            NotificationCenter.default.addObserver(self, selector: #selector(rebuild), name: NSApplication.didChangeScreenParametersNotification, object: nil)
            let ws = NSWorkspace.shared.notificationCenter
            ws.addObserver(self, selector: #selector(wake), name: NSWorkspace.didWakeNotification, object: nil)
            ws.addObserver(self, selector: #selector(wake), name: NSWorkspace.screensDidWakeNotification, object: nil)
        }
        rebuild()
        check = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in self?.verify() }
        check?.tolerance = 10
    }

    /// Live on: a fresh page in every window. Live off: each page becomes a still of itself.
    func setLive(_ on: Bool) {
        guard running, on != live else { live = on; return }
        live = on
        for (id, w) in windows {
            if on { w.contentView = makeWeb(w.frame.size) } else { freeze(w, display: id) }
        }
        views = windows.values.compactMap { $0.contentView as? WKWebView }
    }

    private func freeze(_ w: NSWindow, display id: CGDirectDisplayID) {
        guard let web = w.contentView as? WKWebView else { return }
        let cfg = WKSnapshotConfiguration()
        cfg.afterScreenUpdates = false
        web.takeSnapshot(with: cfg) { [weak self, weak w] img, _ in
            guard let self, let w, !self.live else { return }
            var still = img
            if let img, let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff),
               let png = rep.representation(using: .png, properties: [:]) {
                try? FileManager.default.createDirectory(at: WallpaperController.dir, withIntermediateDirectories: true)
                try? png.write(to: WallpaperController.still(id))
                self.useAsDesktopPicture(png)
            } else {
                still = WallpaperController.savedStill(id)
            }
            web.stopLoading()
            w.contentView = WallpaperController.stillView(still, size: w.frame.size)
            self.views = self.windows.values.compactMap { $0.contentView as? WKWebView }
        }
    }

    // the still also becomes the system picture (lock screen, Mission Control); a new file name
    // each time, because macOS caches desktop pictures by path
    private func useAsDesktopPicture(_ png: Data) {
        let fm = FileManager.default
        for old in (try? fm.contentsOfDirectory(at: WallpaperController.dir, includingPropertiesForKeys: nil)) ?? [] where old.lastPathComponent.hasPrefix("desktop-") {
            try? fm.removeItem(at: old)
        }
        let url = WallpaperController.dir.appendingPathComponent("desktop-\(Int(Date().timeIntervalSince1970)).png")
        if (try? png.write(to: url)) != nil { DesktopPicture.set(url) }
    }

    static let dir = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".guardia")
    static func still(_ id: CGDirectDisplayID) -> URL { dir.appendingPathComponent("still-\(id).png") }
    static func savedStill(_ id: CGDirectDisplayID) -> NSImage? {
        NSImage(contentsOf: still(id))
            ?? Bundle.main.resourceURL.flatMap { NSImage(contentsOf: $0.appendingPathComponent("wallpaper/frames/f1530.webp")) }
    }

    static func stillView(_ img: NSImage?, size: CGSize) -> NSView {
        let iv = NSImageView(frame: CGRect(origin: .zero, size: size))
        iv.image = img
        iv.imageScaling = .scaleAxesIndependently
        iv.autoresizingMask = [.width, .height]
        return iv
    }

    @objc private func wake() {
        guard running, live else { return }
        broadcast("window.guardia && window.guardia.rerender()")
        verify()
    }

    @objc func rebuild() {
        guard running else { return }
        var seen = Set<CGDirectDisplayID>()
        for screen in NSScreen.screens {
            guard let id = screen.displayID else { continue }
            seen.insert(id)
            if let w = windows[id] { w.setFrame(screen.frame, display: true); continue }
            let w = NSWindow(contentRect: screen.frame, styleMask: [.borderless], backing: .buffered, defer: false, screen: screen)
            w.isReleasedWhenClosed = false
            w.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.desktopWindow)))
            w.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle]
            w.ignoresMouseEvents = true
            w.isOpaque = true
            w.backgroundColor = NSColor(srgbRed: 0.23, green: 0.17, blue: 0.13, alpha: 1)
            w.hasShadow = false
            w.contentView = live ? makeWeb(screen.frame.size) : WallpaperController.stillView(WallpaperController.savedStill(id), size: screen.frame.size)
            w.orderFront(nil)
            windows[id] = w
        }
        for (id, w) in windows where !seen.contains(id) { w.contentView = nil; w.orderOut(nil); w.close(); windows[id] = nil }
        views = windows.values.compactMap { $0.contentView as? WKWebView }
    }

    private func makeWeb(_ size: CGSize) -> WKWebView {
        let cfg = WKWebViewConfiguration()
        cfg.setURLSchemeHandler(scheme, forURLScheme: "guardia")
        cfg.suppressesIncrementalRendering = true
        let web = WKWebView(frame: CGRect(origin: .zero, size: size), configuration: cfg)
        web.setValue(false, forKey: "drawsBackground")
        web.autoresizingMask = [.width, .height]
        web.navigationDelegate = self
        load(web)
        return web
    }

    private func load(_ web: WKWebView) {
        web.load(URLRequest(url: URL(string: "guardia://app/wallpaper/index.html\(lowPower ? "?lowpower=1" : "")")!))
    }

    // ------------------------------------------------------------------ staying alive
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        NSLog("[guardia] wallpaper page process ended; reloading")
        load(webView)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // a fresh page needs the song and the battery state again
        webView.evaluateJavaScript("window.guardia && window.guardia.setLowPower(\(lowPower))", completionHandler: nil)
        webView.evaluateJavaScript(nowPlayingJS, completionHandler: nil)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { retry(webView) }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { retry(webView) }

    private func retry(_ web: WKWebView) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self, weak web] in
            guard let self, self.running, let web, self.views.contains(web) else { return }
            self.load(web)
        }
    }

    /// Ask each page whether it is alive and drawing; reload the ones that don't answer.
    func verify() {
        for web in views {
            web.evaluateJavaScript("JSON.stringify(window.__guardia || null)") { [weak self, weak web] result, error in
                guard let self, let web else { return }
                let text = result as? String ?? "null"
                if let d = text.data(using: .utf8), let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any] { self.lastAnswer = j }
                if error != nil || text == "null" || !text.contains("\"ready\":true") {
                    NSLog("[guardia] wallpaper page did not answer; reloading")
                    self.load(web)
                }
            }
        }
    }

    /// For `guardia://status`.
    var debugState: [String: Any] { ["running": running, "live": live, "windows": windows.count, "pages": views.count, "page": lastAnswer] }

    func broadcast(_ js: String) { for v in views { v.evaluateJavaScript(js, completionHandler: nil) } }

    func setNowPlaying(_ np: NowPlaying.Track?) {
        guard let np else { nowPlayingJS = "window.guardia && window.guardia.setNowPlaying(null)"; broadcast(nowPlayingJS); return }
        let payload: [String: Any] = ["title": np.title, "artist": np.artist, "art": np.artHex]
        guard let data = try? JSONSerialization.data(withJSONObject: payload), let json = String(data: data, encoding: .utf8) else { return }
        nowPlayingJS = "window.guardia && window.guardia.setNowPlaying(\(json))"
        broadcast(nowPlayingJS)
    }
}

// Serves the bundled web files at guardia://app/… so ES modules load with proper types.
final class ResourceScheme: NSObject, WKURLSchemeHandler {
    let root = Bundle.main.resourceURL!

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        let file = root.appendingPathComponent(url.path)
        guard file.path.hasPrefix(root.path), let data = try? Data(contentsOf: file) else {
            task.didFailWithError(NSError(domain: "guardia", code: 404))
            return
        }
        let types = ["html": "text/html", "js": "text/javascript", "json": "application/json", "woff2": "font/woff2", "png": "image/png", "css": "text/css", "webp": "image/webp"]
        let mime = types[file.pathExtension] ?? "application/octet-stream"
        task.didReceive(URLResponse(url: url, mimeType: mime, expectedContentLength: data.count, textEncodingName: mime.hasPrefix("text") ? "utf-8" : nil))
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

extension NSScreen {
    var displayID: CGDirectDisplayID? { deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? CGDirectDisplayID }
}
