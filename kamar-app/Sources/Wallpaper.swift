import AppKit
import WebKit

// The live room, hosted full-screen at desktop level on every display (below Finder's icons).
final class WallpaperController: NSObject {
    private var windows: [CGDirectDisplayID: NSWindow] = [:]
    private var views: [WKWebView] = []
    private let scheme = ResourceScheme()
    var lowPower = false { didSet { broadcast("window.kamar && window.kamar.setLowPower(\(lowPower))") } }

    func start() {
        rebuild()
        NotificationCenter.default.addObserver(self, selector: #selector(rebuild), name: NSApplication.didChangeScreenParametersNotification, object: nil)
        let ws = NSWorkspace.shared.notificationCenter
        ws.addObserver(self, selector: #selector(wake), name: NSWorkspace.didWakeNotification, object: nil)
        ws.addObserver(self, selector: #selector(wake), name: NSWorkspace.screensDidWakeNotification, object: nil)
    }

    func stop() {
        for w in windows.values { w.orderOut(nil) }
        windows.removeAll(); views.removeAll()
    }

    @objc private func wake() { broadcast("window.kamar && window.kamar.rerender()") }

    @objc func rebuild() {
        var seen = Set<CGDirectDisplayID>()
        for screen in NSScreen.screens {
            guard let id = screen.displayID else { continue }
            seen.insert(id)
            if let w = windows[id] { w.setFrame(screen.frame, display: true); continue }
            let w = NSWindow(contentRect: screen.frame, styleMask: [.borderless], backing: .buffered, defer: false, screen: screen)
            w.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.desktopWindow)))
            w.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle]
            w.ignoresMouseEvents = true
            w.isOpaque = true
            w.backgroundColor = NSColor(srgbRed: 0.23, green: 0.17, blue: 0.13, alpha: 1)
            w.hasShadow = false
            let cfg = WKWebViewConfiguration()
            cfg.setURLSchemeHandler(scheme, forURLScheme: "kamar")
            cfg.suppressesIncrementalRendering = true
            let web = WKWebView(frame: CGRect(origin: .zero, size: screen.frame.size), configuration: cfg)
            web.setValue(false, forKey: "drawsBackground")
            web.autoresizingMask = [.width, .height]
            w.contentView = web
            web.load(URLRequest(url: URL(string: "kamar://app/wallpaper/index.html\(lowPower ? "?lowpower=1" : "")")!))
            w.orderFront(nil)
            windows[id] = w
            views.append(web)
        }
        for (id, w) in windows where !seen.contains(id) { w.orderOut(nil); windows[id] = nil }
        views = windows.values.compactMap { $0.contentView as? WKWebView }
    }

    func broadcast(_ js: String) { for v in views { v.evaluateJavaScript(js, completionHandler: nil) } }

    func setNowPlaying(_ np: NowPlaying.Track?) {
        guard let np else { broadcast("window.kamar && window.kamar.setNowPlaying(null)"); return }
        let payload: [String: Any] = ["title": np.title, "artist": np.artist, "art": np.artHex]
        guard let data = try? JSONSerialization.data(withJSONObject: payload), let json = String(data: data, encoding: .utf8) else { return }
        broadcast("window.kamar && window.kamar.setNowPlaying(\(json))")
    }
}

// Serves the bundled web files at kamar://app/… so ES modules load with proper types.
final class ResourceScheme: NSObject, WKURLSchemeHandler {
    let root = Bundle.main.resourceURL!

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        let file = root.appendingPathComponent(url.path)
        guard file.path.hasPrefix(root.path), let data = try? Data(contentsOf: file) else {
            task.didFailWithError(NSError(domain: "kamar", code: 404))
            return
        }
        let types = ["html": "text/html", "js": "text/javascript", "json": "application/json", "woff2": "font/woff2", "png": "image/png", "css": "text/css"]
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
