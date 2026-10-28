import AppKit
import WebKit

// `Guardia --snapshot <dir>` renders the island in each state and the hosted wallpaper to PNGs,
// so the native surfaces can be checked without screen-recording rights.
enum Snapshot {
    // GUARDIA_SNAPSHOT_TIME / _WEATHER pick the wallpaper's moment (default 16:30, clear)
    static var time: String { ProcessInfo.processInfo.environment["GUARDIA_SNAPSHOT_TIME"] ?? "16:30" }
    static var weather: String { ProcessInfo.processInfo.environment["GUARDIA_SNAPSHOT_WEATHER"] ?? "clear" }
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
        shot("search-code") { isl.previewSearch("", list: .code) }
        shot("search-newfolder") { isl.previewSearch("proyek-baru", list: .newFolder) }
        shot("search-photos") { isl.previewSearch("", list: .photos) }
        shot("search-claude") { isl.previewSearch("", list: .claude) }
        shot("search-timer") { isl.previewSearch("", list: .timer) }
        shot("search-timer-typed") { isl.previewSearch("10 masak", list: .timer) }
        shot("search-alarm") { isl.previewSearch("7.30 bangun", list: .alarm) }
        shot("search-focus") { isl.previewSearch("", list: .focus) }
        shot("search-project") { isl.previewSearch("seoul") }
        shot("search-music") { isl.previewSearch("putar sheila on 7") }
        isl.endPreviewSearch()
        shot("notes") { isl.previewNotes("# besok\n- kirim revisi bab 3\n- beli kopi\nx bayar listrik") }
        shot("notes-empty") { isl.previewNotes("") }
        isl.previewNotes(nil)
        shot("ring") { isl.ring(title: "Alarm 07.30", subtitle: "bangun", action: ("tunda 5 menit", {}), dismiss: {}) }
        isl.endRing()

        // the cats: one frame from each animation on paper, to check how the sheets are sliced
        let picks = [("idle", 0), ("walk", 6), ("tap", 1), ("purr", 3), ("sleep", 0), ("stretch", 5), ("dangle", 2), ("swipe", 3),
                     ("watch", 0), ("meow", 3), ("loaf", 6), ("startle", 2), ("bob", 2), ("flop", 0), ("hot", 1), ("stalk", 2),
                     ("bite", 2), ("beg", 3), ("eat", 2), ("groom", 1)]
        for (file, cat) in [("pet.png", delegate.pet), ("maestra.png", delegate.maestra)] {
            let cats = picks.compactMap { cat.snapshot($0.0, frame: $0.1) }
            guard let c0 = cats.first, let strip = CGContext(data: nil, width: c0.width * 10, height: c0.height * 2, bitsPerComponent: 8, bytesPerRow: 0,
                                                             space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { continue }
            strip.setFillColor(NSColor(srgbRed: 0xE9 / 255, green: 0xDF / 255, blue: 0xC8 / 255, alpha: 1).cgColor)
            strip.fill(CGRect(x: 0, y: 0, width: strip.width, height: strip.height))
            for (n, c) in cats.enumerated() { strip.draw(c, in: CGRect(x: (n % 10) * c0.width, y: (1 - n / 10) * c0.height, width: c0.width, height: c0.height)) }
            if let img = strip.makeImage() {
                try? NSBitmapImageRep(cgImage: img).representation(using: .png, properties: [:])?.write(to: out.appendingPathComponent(file))
            }
        }
        // the balloons
        for (n, text) in ["meong! DESKTOP: giliranmu", "lapar…", "MEONG!"].enumerated() {
            if let img = Balloon.image(text) {
                try? NSBitmapImageRep(cgImage: img).representation(using: .png, properties: [:])?.write(to: out.appendingPathComponent("balloon\(n).png"))
            }
        }

        // the wallpaper, as WebKit renders it inside the app
        let cfg = WKWebViewConfiguration()
        let handler = ResourceScheme()
        cfg.setURLSchemeHandler(handler, forURLScheme: "guardia")
        let web = WKWebView(frame: CGRect(x: 0, y: 0, width: 1440, height: 900), configuration: cfg)
        let win = NSWindow(contentRect: web.frame, styleMask: [.borderless], backing: .buffered, defer: false)
        win.contentView = web
        win.setFrameOrigin(NSPoint(x: -3000, y: -3000))
        win.orderFrontRegardless()
        web.load(URLRequest(url: URL(string: "guardia://app/wallpaper/index.html?still=1&time=\(Snapshot.time)&demo=1&weather=\(Snapshot.weather)")!))
        DispatchQueue.main.asyncAfter(deadline: .now() + 6) {
            web.evaluateJavaScript("JSON.stringify(window.__guardia || null)") { res, err in
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
