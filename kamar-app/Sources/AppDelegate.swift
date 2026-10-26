import AppKit

final class AppDelegate: NSObject, NSApplicationDelegate {
    let wallpaper = WallpaperController()
    let island = IslandController()
    let pet = PetController()
    let music = NowPlaying()
    let power = Power()
    let focus = FocusTimer()
    private var status: NSStatusItem!
    private let prefs = UserDefaults.standard

    private var wallpaperOn: Bool { get { prefs.object(forKey: "wallpaper") as? Bool ?? true } set { prefs.set(newValue, forKey: "wallpaper") } }
    private var petOn: Bool { get { prefs.object(forKey: "pet") as? Bool ?? true } set { prefs.set(newValue, forKey: "pet") } }
    private var islandOn: Bool { get { prefs.object(forKey: "island") as? Bool ?? true } set { prefs.set(newValue, forKey: "island") } }

    func applicationDidFinishLaunching(_ note: Notification) {
        if let i = CommandLine.arguments.firstIndex(of: "--snapshot"), i + 1 < CommandLine.arguments.count {
            island.timer = focus
            Snapshot.run(into: CommandLine.arguments[i + 1], delegate: self)
            return
        }
        power.start()
        wallpaper.lowPower = !power.state.onAC
        if wallpaperOn { wallpaper.start() }

        island.timer = focus
        island.actions = (
            prev: { [weak self] in self?.music.previous() },
            play: { [weak self] in self?.music.playPause() },
            next: { [weak self] in self?.music.next() },
            focus: { [weak self] mins, rest in self?.focus.start(minutes: mins, rest: rest) }
        )
        island.onMenu = { [weak self] view, p in
            guard let self else { return }
            self.buildMenu().popUp(positioning: nil, at: p, in: view)
        }
        if islandOn { island.start() }
        if petOn { pet.start() }

        var lastArt = 0
        music.onChange = { [weak self] t, isNew in
            guard let self else { return }
            self.island.nowPlaying = t
            if isNew { self.island.trackChanged() }
            let artKey = (t?.id.hashValue ?? 0) ^ (t?.artHex.count ?? 0)
            if isNew || artKey != lastArt { lastArt = artKey; self.wallpaper.setNowPlaying(t) }
        }
        music.start()

        power.onChange = { [weak self] old, new in
            guard let self else { return }
            self.wallpaper.lowPower = !new.onAC
            if new.onAC && !old.onAC { self.island.showToast(icon: "plug", text: "Ngecas · \(new.percent)%") }
            if !new.onAC && new.percent <= 15 && old.percent > 15 { self.island.showToast(icon: "low", text: "Baterai tinggal \(new.percent)%", seconds: 5) }
        }
        focus.onChange = { [weak self] in self?.island.refresh() }
        focus.onFinish = { [weak self] wasRest in
            guard let self else { return }
            self.island.showToast(icon: "bell", text: wasRest ? "Istirahat selesai, lanjut yuk" : "Waktunya istirahat sebentar", seconds: 7, expand: true)
            self.pet.celebrate()
            NSSound(named: "Glass")?.play()
        }

        status = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        status.button?.image = AppDelegate.catIcon()
        status.menu = buildMenu()
    }

    // kamar://focus/25 · kamar://rest/5 · kamar://stop · kamar://pet/come
    func application(_ application: NSApplication, open urls: [URL]) {
        for url in urls {
            let parts = ([url.host ?? ""] + url.pathComponents.filter { $0 != "/" })
            switch parts.first {
            case "focus": focus.start(minutes: Int(parts.dropFirst().first ?? "25") ?? 25, rest: false)
            case "rest": focus.start(minutes: Int(parts.dropFirst().first ?? "5") ?? 5, rest: true)
            case "stop": focus.stop()
            case "pet": pet.comeHere()
            case "playpause": music.playPause()
            default: break
            }
        }
    }

    private func buildMenu() -> NSMenu {
        let m = NSMenu()
        func item(_ title: String, _ sel: Selector, _ tag: Int = 0, on: Bool? = nil) -> NSMenuItem {
            let i = NSMenuItem(title: title, action: sel, keyEquivalent: "")
            i.target = self; i.tag = tag
            if let on { i.state = on ? .on : .off }
            return i
        }
        m.addItem(item("Fokus 25 menit", #selector(startFocus(_:)), 25))
        m.addItem(item("Fokus 50 menit", #selector(startFocus(_:)), 50))
        m.addItem(item("Istirahat 5 menit", #selector(startRest(_:)), 5))
        if focus.running { m.addItem(item("Hentikan timer", #selector(stopTimer))) }
        m.addItem(.separator())
        m.addItem(item("Panggil si Oren", #selector(callPet)))
        m.addItem(item("si Oren", #selector(togglePet), on: petOn))
        m.addItem(item("Dynamic island", #selector(toggleIsland), on: islandOn))
        m.addItem(item("Wallpaper hidup", #selector(toggleWallpaper), on: wallpaperOn))
        m.addItem(.separator())
        m.addItem(item("Keluar dari Kamar", #selector(quit)))
        m.delegate = self
        return m
    }

    @objc private func startFocus(_ s: NSMenuItem) { focus.start(minutes: s.tag, rest: false) }
    @objc private func startRest(_ s: NSMenuItem) { focus.start(minutes: s.tag, rest: true) }
    @objc private func stopTimer() { focus.stop() }
    @objc private func callPet() { if petOn { pet.comeHere() } }
    @objc private func togglePet() { petOn.toggle(); petOn ? pet.start() : pet.stop() }
    @objc private func toggleIsland() { islandOn.toggle(); islandOn ? island.start() : island.stop() }
    @objc private func toggleWallpaper() { wallpaperOn.toggle(); wallpaperOn ? wallpaper.start() : wallpaper.stop() }
    @objc private func quit() { NSApp.terminate(nil) }

    static func catIcon() -> NSImage {
        let img = NSImage(size: NSSize(width: 18, height: 18), flipped: true) { r in
            guard let ctx = NSGraphicsContext.current?.cgContext else { return false }
            let c = CGPoint(x: 9, y: 10.5), s: CGFloat = 6.2
            var head: [CGPoint] = []
            for i in 0..<20 { let a = CGFloat(i) / 20 * .pi * 2; head.append(CGPoint(x: c.x + cos(a) * s, y: c.y + sin(a) * s * 0.82)) }
            let ear1 = [CGPoint(x: c.x - s * 0.9, y: c.y - s * 0.1), CGPoint(x: c.x - s * 0.72, y: c.y - s * 1.3), CGPoint(x: c.x - s * 0.1, y: c.y - s * 0.75)]
            let ear2 = [CGPoint(x: c.x + s * 0.9, y: c.y - s * 0.1), CGPoint(x: c.x + s * 0.72, y: c.y - s * 1.3), CGPoint(x: c.x + s * 0.1, y: c.y - s * 0.75)]
            for shape in [head, ear1, ear2] { Ink.fill(shape, .black, in: ctx) }
            ctx.setBlendMode(.clear)
            ctx.fillEllipse(in: CGRect(x: c.x - 3.4, y: c.y - 1.2, width: 1.8, height: 2.6))
            ctx.fillEllipse(in: CGRect(x: c.x + 1.6, y: c.y - 1.2, width: 1.8, height: 2.6))
            return true
        }
        img.isTemplate = true
        return img
    }
}

extension AppDelegate: NSMenuDelegate {
    func menuNeedsUpdate(_ menu: NSMenu) {
        let fresh = buildMenu()
        menu.removeAllItems()
        for i in fresh.items { fresh.removeItem(i); menu.addItem(i) }
    }
}
