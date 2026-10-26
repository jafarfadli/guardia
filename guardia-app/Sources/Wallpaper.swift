import AppKit
import WebKit

// The live room, hosted full-screen at desktop level on every display (below Finder's icons).
// macOS may kill a web page's process while the desktop is covered (memory pressure); the page
// is then reloaded, and a check every minute reloads any page that stopped answering.
final class WallpaperController: NSObject, WKNavigationDelegate {
    private var windows: [CGDirectDisplayID: NSWindow] = [:]
    private var views: [WKWebView] = []
    private let scheme = ResourceScheme()
    private(set) var running = false
    private var observing = false
    private var check: Timer?
    private var lastAnswer: [String: Any] = [:]
    var lowPower = false { didSet { broadcast("window.guardia && window.guardia.setLowPower(\(lowPower))") } }
    var nowPlayingJS = "window.guardia && window.guardia.setNowPlaying(null)"

    func start() {
        guard !running else { return }
        running = true
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

    func stop() {
        guard running else { return }
        running = false
        check?.invalidate(); check = nil
        for w in windows.values {
            (w.contentView as? WKWebView)?.stopLoading()
            w.contentView = nil
            w.orderOut(nil)
            w.close()
        }
        windows.removeAll(); views.removeAll()
    }

    @objc private func wake() {
        guard running else { return }
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
            let cfg = WKWebViewConfiguration()
            cfg.setURLSchemeHandler(scheme, forURLScheme: "guardia")
            cfg.suppressesIncrementalRendering = true
            let web = WKWebView(frame: CGRect(origin: .zero, size: screen.frame.size), configuration: cfg)
            web.setValue(false, forKey: "drawsBackground")
            web.autoresizingMask = [.width, .height]
            web.navigationDelegate = self
            w.contentView = web
            load(web)
            w.orderFront(nil)
            windows[id] = w
        }
        for (id, w) in windows where !seen.contains(id) { w.contentView = nil; w.orderOut(nil); w.close(); windows[id] = nil }
        views = windows.values.compactMap { $0.contentView as? WKWebView }
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
    var debugState: [String: Any] { ["running": running, "windows": windows.count, "page": lastAnswer] }

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
