import AppKit
import WebKit

// `Kamar --snapshot <dir>` renders the island in each state and the hosted wallpaper to PNGs,
// so the native surfaces can be checked without screen-recording rights.
enum Snapshot {
    static func run(into dir: String, delegate: AppDelegate) {
        let out = URL(fileURLWithPath: dir)
        try? FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)
        let isl = delegate.island
        let fake = NowPlaying.Track(source: "Spotify", id: "x", title: "Sampai Jadi Debu", artist: "Banda Neira", playing: true,
                                    duration: 236, position: 81, stamp: Date(), art: nil, artHex: [])
        func shot(_ name: String, setup: () -> Void) {
            setup()
            let s = isl.targetSize()
            let v = isl.view
            v.frame = CGRect(x: 0, y: 0, width: s.width + 12, height: s.height + 6)
            v.appearance = NSAppearance(named: name.hasSuffix("dark") ? .darkAqua : .aqua)
            guard let rep = v.bitmapImageRepForCachingDisplay(in: v.bounds) else { return }
            v.cacheDisplay(in: v.bounds, to: rep) // first pass places the search field
            v.cacheDisplay(in: v.bounds, to: rep)
            try? rep.representation(using: .png, properties: [:])?.write(to: out.appendingPathComponent("island-\(name).png"))
        }
        // a pixel cover made from a generated gradient, to exercise the pixelation path
        let cs = CGColorSpace(name: CGColorSpace.sRGB)!
        let g = CGContext(data: nil, width: 64, height: 64, bitsPerComponent: 8, bytesPerRow: 256, space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        g.setFillColor(NSColor.systemTeal.cgColor); g.fill(CGRect(x: 0, y: 0, width: 64, height: 64))
        g.setFillColor(NSColor.systemOrange.cgColor); g.fillEllipse(in: CGRect(x: 14, y: 30, width: 36, height: 36))
        g.setFillColor(NSColor.black.cgColor); g.fill(CGRect(x: 0, y: 0, width: 64, height: 18))
        var track = fake
        if let (pix, hex) = Pixelate.cover(g.makeImage()!, size: 16, colors: 6) { track.art = pix; track.artHex = hex }

        shot("status") { isl.nowPlaying = nil }
        shot("status-dark") {}
        shot("status-music") { isl.nowPlaying = track }
        shot("music-open") { isl.view.peek = true }
        shot("music-open-dark") {}
        isl.view.peek = false
        delegate.focus.start(minutes: 25, rest: false)
        shot("status-timer") { isl.nowPlaying = nil }
        delegate.focus.stop()
        shot("status-toast") { isl.showToast(icon: "plug", text: "Ngecas · 82%") }
        isl.view.toast = nil
        shot("search") { isl.previewSearch("") }
        shot("search-dark") {}
        shot("search-timer") { isl.previewSearch("timer 10 masak") }
        shot("search-alarm") { isl.previewSearch("alarm 7.30 bangun") }
        shot("search-claude") { isl.previewSearch("claude") }
        shot("search-claude-list") { isl.previewSearch("", list: .claude) }
        shot("search-music") { isl.previewSearch("putar sheila on 7") }
        isl.endPreviewSearch()
        shot("ring") { isl.ring(title: "Alarm 07.30", subtitle: "bangun", action: ("tunda 5 menit", {}), dismiss: {}) }
        isl.endRing()
        shot("visit") { isl.showGuard(site: "YouTube", seconds: 5, allow: {}) }
        isl.endGuard()

        // si Oren: one frame from each animation on paper, to check how the sheets are sliced
        let picks = [("idle", 0), ("walk", 0), ("walk", 6), ("tap", 1), ("purr", 3), ("sleep", 0), ("stretch", 5), ("dangle", 2)]
        let cats = picks.compactMap { delegate.pet.snapshot($0.0, frame: $0.1) }
        if let c0 = cats.first, let strip = CGContext(data: nil, width: c0.width * cats.count, height: c0.height, bitsPerComponent: 8, bytesPerRow: 0,
                                                     space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) {
            strip.setFillColor(NSColor(srgbRed: 0xE9 / 255, green: 0xDF / 255, blue: 0xC8 / 255, alpha: 1).cgColor)
            strip.fill(CGRect(x: 0, y: 0, width: strip.width, height: strip.height))
            for (n, c) in cats.enumerated() { strip.draw(c, in: CGRect(x: n * c0.width, y: 0, width: c0.width, height: c0.height)) }
            if let img = strip.makeImage() {
                try? NSBitmapImageRep(cgImage: img).representation(using: .png, properties: [:])?.write(to: out.appendingPathComponent("pet.png"))
            }
        }

        // the wallpaper, as WebKit renders it inside the app
        let cfg = WKWebViewConfiguration()
        let handler = ResourceScheme()
        cfg.setURLSchemeHandler(handler, forURLScheme: "kamar")
        let web = WKWebView(frame: CGRect(x: 0, y: 0, width: 1440, height: 900), configuration: cfg)
        let win = NSWindow(contentRect: web.frame, styleMask: [.borderless], backing: .buffered, defer: false)
        win.contentView = web
        win.setFrameOrigin(NSPoint(x: -3000, y: -3000))
        win.orderFrontRegardless()
        web.load(URLRequest(url: URL(string: "kamar://app/wallpaper/index.html?still=1&time=16:30")!))
        DispatchQueue.main.asyncAfter(deadline: .now() + 6) {
            web.evaluateJavaScript("JSON.stringify(window.__kamar || null)") { res, err in
                try? "\(res ?? "nil") \(err.map { "\($0)" } ?? "")".write(to: out.appendingPathComponent("wallpaper-state.txt"), atomically: true, encoding: .utf8)
                web.takeSnapshot(with: nil) { img, _ in
                    if let img, let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff) {
                        try? rep.representation(using: .png, properties: [:])?.write(to: out.appendingPathComponent("wallpaper-webkit.png"))
                    }
                    NSApp.terminate(nil)
                }
            }
        }
    }
}
