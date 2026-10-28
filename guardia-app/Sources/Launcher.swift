import AppKit

// The island's search. The top level is a short menu (Claude Code, Catatan, VS Code, Spotify,
// Timer, Alarm, Mode fokus); each of those opens its own list that asks for one thing: a folder
// in ~/Koding (or a name for a new one), minutes, or a clock time. Catatan opens the notes page.
// Typing at the top level also finds projects, songs and any row by name.
struct Command {
    enum Icon { case terminal, code, music, next, prev, folder, timer, alarm, focus, cat, search, star, stop, home, notes, photo }
    var title: String
    var subtitle: String = ""
    var icon: Icon
    var keywords: String = ""
    var boost: Double = 0
    var hint: String = ""             // right-aligned, e.g. "⌘↵ claude"
    var alt: (() -> Void)? = nil      // ⌘↵
    var keepOpen = false              // rows that open a list
    var run: () -> Void
}

final class Launcher {
    enum List { case root, claude, code, newFolder, photos, timer, alarm, focus }
    private(set) var list: List = .root
    var fill: ((String) -> Void)?
    var onList: ((List) -> Void)?
    var notes: Notes?
    var openNotes: (() -> Void)?
    var photos: Photos?

    private let music: NowPlaying
    private let timer: FocusTimer
    private let alarms: Alarms
    private let focus: FocusGuard
    private let pet: PetController
    var maestra: PetController?
    let favorites = Favorites()

    init(music: NowPlaying, timer: FocusTimer, alarms: Alarms, focus: FocusGuard, pet: PetController) {
        self.music = music; self.timer = timer; self.alarms = alarms; self.focus = focus; self.pet = pet
    }

    func enter(_ l: List) { list = l; onList?(l) }

    func stopTimer() { focus.end(); timer.stop() }

    // what the island shows for each list
    var crumb: (title: String, icon: Command.Icon)? {
        switch list {
        case .root: return nil
        case .claude: return ("Claude Code", .terminal)
        case .code: return ("VS Code", .code)
        case .newFolder: return ("Folder baru", .folder)
        case .photos: return ("Rak foto", .photo)
        case .timer: return ("Timer", .timer)
        case .alarm: return ("Alarm", .alarm)
        case .focus: return ("Mode fokus", .focus)
        }
    }
    var placeholder: String {
        switch list {
        case .root: return "cari: claude, code, lagu, timer, alarm, fokus…"
        case .claude, .code: return "pilih folder di Koding…"
        case .newFolder: return "nama folder baru di Koding…"
        case .photos: return "pilih bingkai…"
        case .timer: return "berapa menit? misal 10 atau 10 masak"
        case .alarm: return "jam berapa? misal 6.30 atau 7.30 bangun"
        case .focus: return "berapa menit? misal 25"
        }
    }
    var footer: String {
        switch list {
        case .root: return "↵ jalankan  ·  ↑↓ pilih  ·  esc tutup"
        case .claude: return "↵ buka terminal  ·  esc kembali"
        case .code: return "↵ buka di VS Code  ·  ⌘↵ Claude Code  ·  esc kembali"
        case .newFolder: return "↵ buat lalu buka di VS Code  ·  ⌘↵ buat lalu Claude Code  ·  esc kembali"
        case .photos: return "↵ pilih foto  ·  ⌘↵ kembalikan gambarnya  ·  atau seret foto ke island"
        case .timer, .alarm, .focus: return "↵ mulai  ·  esc kembali"
        }
    }

    func results(_ raw: String) -> [Command] {
        let text = raw.trimmingCharacters(in: .whitespaces)
        let q = Launcher.fold(text)
        switch list {
        case .root: return Array(rootRows(q, raw: text).prefix(12))
        case .claude: return filter(folderRows(claude: true), q)
        case .code: return filter(folderRows(claude: false), q)
        case .newFolder: return newFolderRows(text)
        case .photos: return filter(photoRows(), q)
        case .timer: return timerRows(q)
        case .alarm: return alarmRows(q)
        case .focus: return focusRows(q)
        }
    }

    // ------------------------------------------------------------------ top level
    private func rootRows(_ q: String, raw: String) -> [Command] {
        var dynamic: [Command] = []
        if let uri = Favorites.uri(from: raw) {
            dynamic.append(Command(title: "Simpan ke favorit Spotify", subtitle: uri, icon: .star, boost: 50) { [weak self] in self?.favorites.add(uri) })
        }
        // shortcuts for whole phrases: "timer 10", "alarm 7.30 bangun", "fokus 50"
        let words = q.split(separator: " ").map(String.init)
        if let first = words.first {
            let rest = words.dropFirst().joined(separator: " ")
            if first == "timer", let t = Launcher.minutes(rest) { dynamic.append(timerRow(t.minutes, t.label, boost: 40)) }
            if first == "alarm", let a = Launcher.clockTime(rest) { dynamic.append(alarmRow(a.hour, a.minute, a.label, boost: 40)) }
            if first == "fokus" || first == "focus", let f = Launcher.minutes(rest), f.label.isEmpty { dynamic.append(focusRow(f.minutes, boost: 40)) }
        }

        var rows: [Command] = []
        // what's happening now comes first
        if let t = music.track {
            rows.append(Command(title: t.playing ? "Jeda" : "Lanjut putar", subtitle: "\(t.title) — \(t.artist)", icon: .music,
                                keywords: "spotify musik lagu putar play pause jeda", boost: q.isEmpty ? 9 : 0) { [weak self] in self?.music.playPause() })
            rows.append(Command(title: "Lagu berikutnya", icon: .next, keywords: "next skip lagu spotify musik", boost: q.isEmpty ? 8.5 : 0) { [weak self] in self?.music.next() })
            rows.append(Command(title: "Lagu sebelumnya", icon: .prev, keywords: "previous prev lagu spotify musik") { [weak self] in self?.music.previous() })
        } else {
            rows.append(Command(title: "Putar Spotify", subtitle: "lanjutkan lagu terakhir · ketik judul untuk mencari", icon: .music,
                                keywords: "spotify musik lagu putar play", boost: q.isEmpty ? 5 : 0) { [weak self] in self?.music.play() })
        }
        if timer.running {
            rows.append(Command(title: "Hentikan \(timer.name)", subtitle: "\(Launcher.clock(timer.remaining)) lagi", icon: .stop,
                                keywords: "stop hentikan berhenti batal timer fokus istirahat", boost: q.isEmpty ? 10 : 0) { [weak self] in self?.stopTimer() })
        } else if focus.on {
            rows.append(Command(title: "Matikan mode fokus", icon: .stop, keywords: "fokus focus stop matikan berhenti", boost: q.isEmpty ? 10 : 0) { [weak self] in self?.focus.end() })
        }
        rows.append(Command(title: "Claude Code", subtitle: "pilih folder, lalu terminal baru menjalankan claude", icon: .terminal,
                            keywords: "claude code cc terminal ghostty ai baru new", boost: q.isEmpty ? 7 : 0, keepOpen: true) { [weak self] in self?.enter(.claude) })
        let first = notes?.text.split(separator: "\n").first.map { String($0).trimmingCharacters(in: .whitespaces) } ?? ""
        rows.append(Command(title: "Catatan", subtitle: first.isEmpty ? "tulis poin, muncul di papan tulis kamar" : first, icon: .notes,
                            keywords: "catatan notes note todo tulis papan tulis daftar", boost: q.isEmpty ? 6.5 : 0) { [weak self] in self?.openNotes?() })
        if let photos {
            let n = photos.slots.compactMap { $0 }.count
            rows.append(Command(title: "Rak foto", subtitle: n == 0 ? "pasang fotomu di rak kamar" : "\(n) dari \(Photos.count) bingkai berisi fotomu", icon: .photo,
                                keywords: "rak foto bingkai gambar photo frame", boost: q.isEmpty ? 5.5 : 0, keepOpen: true) { [weak self] in self?.enter(.photos) })
        }
        rows.append(Command(title: "VS Code", subtitle: "pilih folder di Koding untuk dibuka", icon: .code,
                            keywords: "vscode visual studio code editor project proyek buka open", boost: q.isEmpty ? 6 : 0, keepOpen: true) { [weak self] in self?.enter(.code) })
        rows.append(Command(title: "Timer", subtitle: "hitung mundur dalam menit", icon: .timer,
                            keywords: "timer hitung mundur menit pengingat", boost: q.isEmpty ? 4 : 0, keepOpen: true) { [weak self] in self?.enter(.timer) })
        rows.append(Command(title: "Alarm", subtitle: "bunyi pada jam tertentu", icon: .alarm,
                            keywords: "alarm bangun jam pengingat", boost: q.isEmpty ? 3 : 0, keepOpen: true) { [weak self] in self?.enter(.alarm) })
        if !focus.on {
            rows.append(Command(title: "Mode fokus", subtitle: "Maestro menjaga Chrome dari Instagram, TikTok, YouTube, X", icon: .focus,
                                keywords: "fokus focus mode kerja belajar", boost: q.isEmpty ? 2 : 0, keepOpen: true) { [weak self] in self?.enter(.focus) })
        }
        rows.append(Command(title: "Istirahat 5 menit", icon: .timer, keywords: "istirahat rehat break rest") { [weak self] in self?.timer.start(seconds: 300, kind: .rest) })
        for f in favorites.items {
            rows.append(Command(title: "Putar \(f.name)", subtitle: "favorit Spotify", icon: .star, keywords: "spotify putar play playlist favorit \(f.name)",
                                hint: "⌘↵ hapus", alt: { [weak self] in self?.favorites.remove(f.uri) }) { [weak self] in self?.music.play(uri: f.uri) })
        }
        rows.append(Command(title: "Panggil Maestro", icon: .cat, keywords: "kucing cat maestro panggil sini") { [weak self] in self?.pet.comeHere() })
        if let maestra, maestra.running {
            rows.append(Command(title: "Panggil Maestra", icon: .cat, keywords: "kucing cat maestra panggil sini") { maestra.comeHere() })
        }
        // app icons: offered up front when an update put an original icon back
        let lost = AppIcons.missing()
        if let repo = AppIcons.repo {
            rows.append(Command(title: "Pasang ulang ikon app", subtitle: lost.isEmpty ? "ikon kertas untuk app-app kamu" : "\(lost.count) app kembali ke ikon asli setelah update",
                                icon: .star, keywords: "ikon icon app pasang ulang dock", boost: q.isEmpty && !lost.isEmpty ? 8 : 0) {
                Projects.terminal(in: repo, run: "./scripts/app-icons.sh apply")
            })
        }

        // projects by name while typing; "claude <name>" goes straight to a terminal
        let projects = Projects.all()
        let rest = words.dropFirst().joined(separator: " ")
        if !q.isEmpty {
            let claudeFirst = ["claude", "cc"].contains(words.first ?? "")
            for p in projects {
                if claudeFirst {
                    if rest.isEmpty || Launcher.score(rest, Launcher.fold(p.name)) != nil {
                        rows.append(Command(title: "Claude Code · \(p.name)", subtitle: Launcher.tilde(p.url), icon: .terminal, boost: 20) { Projects.claude(in: p.url) })
                    }
                } else {
                    rows.append(Command(title: p.name, subtitle: "VS Code · " + Launcher.tilde(p.url), icon: .folder, keywords: "project proyek",
                                        hint: "⌘↵ claude", alt: { Projects.claude(in: p.url) }) { Projects.openInCode(p) })
                }
            }
        }

        let scored: [(Double, Command)] = rows.compactMap { c in
            if q.isEmpty { return c.boost > 0 ? (c.boost, c) : nil }
            guard let s = Launcher.score(q, Launcher.fold(c.title + "\n" + c.keywords)) else { return c.boost >= 20 ? (c.boost, c) : nil }
            return (s + c.boost, c)
        }
        var out = dynamic + scored.sorted { $0.0 > $1.0 }.map { $0.1 }
        // anything else typed: look it up in Spotify
        if q.count >= 2, dynamic.isEmpty {
            let stripped = Launcher.strip(raw, prefixes: ["putar", "play", "lagu", "spotify", "cari"])
            let lead = ["putar", "play", "lagu", "spotify"].contains(words.first ?? "")
            let search = Command(title: "Cari “\(stripped)” di Spotify", subtitle: "membuka hasil pencarian di Spotify", icon: .search) { [weak self] in self?.music.search(stripped) }
            if lead && !stripped.isEmpty { out.insert(search, at: 0) } else if !stripped.isEmpty { out.append(search) }
        }
        return out
    }

    // ------------------------------------------------------------------ folders
    private func folderRows(claude: Bool) -> [Command] {
        var rows: [Command] = []
        if claude {
            let home = FileManager.default.homeDirectoryForCurrentUser
            rows.append(Command(title: "Home", subtitle: "~", icon: .home, keywords: "home rumah ~") { Projects.claude(in: home) })
        }
        if !claude {
            rows.append(Command(title: "Folder baru", subtitle: "buat folder di Koding lalu buka di VS Code", icon: .folder,
                                keywords: "baru new folder buat bikin proyek project", keepOpen: true) { [weak self] in self?.enter(.newFolder) })
        }
        for p in Projects.all() {
            if claude {
                rows.append(Command(title: p.name, subtitle: Launcher.tilde(p.url), icon: .folder) { Projects.claude(in: p.url) })
            } else {
                rows.append(Command(title: p.name, subtitle: Launcher.tilde(p.url), icon: .folder, hint: "⌘↵ claude", alt: { Projects.claude(in: p.url) }) { Projects.openInCode(p) })
            }
        }
        return rows
    }

    private func photoRows() -> [Command] {
        guard let photos else { return [] }
        return (0..<Photos.count).map { i in
            let slot = photos.slots[i]
            return Command(title: "Bingkai \(i + 1) · \(Photos.places[i])", subtitle: slot?.name ?? "gambar bawaan · pilih foto", icon: .photo,
                           keywords: "bingkai foto \(i + 1)", hint: slot == nil ? "" : "⌘↵ hapus",
                           alt: slot == nil ? nil : { [weak photos] in photos?.clear(i) }) { [weak photos] in photos?.choose(i) }
        }
    }

    private func newFolderRows(_ raw: String) -> [Command] {
        let name = raw.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return [] }
        guard !name.contains("/"), !name.contains(":"), !name.hasPrefix("."), name.count <= 100 else {
            return [Command(title: "Nama ini tidak bisa dipakai", subtitle: "tanpa / atau :, dan tidak diawali titik", icon: .stop, keepOpen: true) {}]
        }
        let url = Projects.koding.appendingPathComponent(name)
        let p = Projects.Project(name: name, url: url)
        if FileManager.default.fileExists(atPath: url.path) {
            return [Command(title: "“\(name)” sudah ada", subtitle: "buka saja di VS Code", icon: .folder, hint: "⌘↵ claude",
                            alt: { Projects.claude(in: url) }) { Projects.openInCode(p) }]
        }
        let make = { (then: () -> Void) in
            if (try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: false)) != nil { then() }
        }
        return [Command(title: "Buat “\(name)”", subtitle: Launcher.tilde(url) + " · lalu buka di VS Code", icon: .folder, hint: "⌘↵ claude",
                        alt: { make { Projects.claude(in: url) } }) { make { Projects.openInCode(p) } }]
    }

    private func filter(_ rows: [Command], _ q: String) -> [Command] {
        if q.isEmpty { return rows }
        return rows.enumerated().compactMap { i, c in Launcher.score(q, Launcher.fold(c.title + "\n" + c.keywords)).map { ($0 - Double(i) * 0.001, c) } }
            .sorted { $0.0 > $1.0 }.map { $0.1 }
    }

    // ------------------------------------------------------------------ timer, alarm, focus
    private func timerRow(_ m: Int, _ label: String, boost: Double = 0) -> Command {
        Command(title: "Timer \(m) menit" + (label.isEmpty ? "" : " · \(label)"), subtitle: "bunyi di island saat selesai", icon: .timer, boost: boost) { [weak self] in
            self?.timer.start(seconds: Double(m) * 60, kind: .timer, label: label)
        }
    }

    private func alarmRow(_ h: Int, _ m: Int, _ label: String, boost: Double = 0) -> Command {
        Command(title: "Alarm \(String(format: "%02d.%02d", h, m))" + (label.isEmpty ? "" : " · \(label)"), subtitle: Alarms.when(hour: h, minute: m), icon: .alarm, boost: boost) { [weak self] in
            self?.alarms.add(hour: h, minute: m, label: label)
        }
    }

    private func focusRow(_ m: Int, boost: Double = 0) -> Command {
        Command(title: "Mode fokus \(m) menit", subtitle: "Maestro menjaga Chrome dari Instagram, TikTok, YouTube, X", icon: .focus, boost: boost) { [weak self] in
            self?.focus.begin(minutes: m)
        }
    }

    private func timerRows(_ q: String) -> [Command] {
        var rows: [Command] = []
        if let t = Launcher.minutes(q) { rows.append(timerRow(t.minutes, t.label)) }
        if timer.running {
            rows.append(Command(title: "Hentikan \(timer.name)", subtitle: "\(Launcher.clock(timer.remaining)) lagi", icon: .stop) { [weak self] in self?.stopTimer() })
        }
        if q.isEmpty { for m in [5, 10, 15, 25, 30, 45, 60] { rows.append(timerRow(m, "")) } }
        return rows
    }

    private func alarmRows(_ q: String) -> [Command] {
        var rows: [Command] = []
        if let a = Launcher.clockTime(q) { rows.append(alarmRow(a.hour, a.minute, a.label)) }
        for a in alarms.list {
            rows.append(Command(title: "Hapus alarm \(Alarms.clock(a.date))" + (a.label.isEmpty ? "" : " · \(a.label)"), subtitle: Alarms.day(a.date), icon: .stop) { [weak self] in
                self?.alarms.remove(a.id)
            })
        }
        return rows
    }

    private func focusRows(_ q: String) -> [Command] {
        var rows: [Command] = []
        if let f = Launcher.minutes(q), f.label.isEmpty { rows.append(focusRow(f.minutes)) }
        if focus.on { rows.append(Command(title: "Matikan mode fokus", icon: .stop) { [weak self] in self?.focus.end() }) }
        if q.isEmpty { for m in [25, 50, 90] { rows.append(focusRow(m)) } }
        return rows
    }

    // ------------------------------------------------------------------ matching
    static func fold(_ s: String) -> String { s.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: nil).lowercased() }

    /// Every word of the query must appear: as a word start (best), inside a word, or as letters
    /// in order. Letters in order only count against the first line (the title), or long keyword
    /// lists would match almost anything.
    static func score(_ q: String, _ hay: String) -> Double? {
        let title = hay.components(separatedBy: "\n").first ?? hay
        var total = 0.0
        for w in q.split(separator: " ").map(String.init) where !w.isEmpty {
            if hay.hasPrefix(w) { total += 4 }
            else if hay.contains(" " + w) || hay.contains("-" + w) || hay.contains("_" + w) || hay.contains("\n" + w) { total += 3 }
            else if hay.contains(w) { total += 1.5 }
            else if inOrder(w, title) { total += 0.4 }
            else { return nil }
        }
        return total
    }

    private static func inOrder(_ w: String, _ hay: String) -> Bool {
        var it = hay.makeIterator()
        for ch in w { var found = false; while let h = it.next() { if h == ch { found = true; break } }; if !found { return false } }
        return true
    }

    private static func strip(_ raw: String, prefixes: [String]) -> String {
        var words = raw.split(separator: " ").map(String.init)
        while let f = words.first, prefixes.contains(fold(f)) { words.removeFirst() }
        return words.joined(separator: " ")
    }

    // ------------------------------------------------------------------ the one thing each list asks for
    /// Minutes, with anything after them as a label: "10", "10 menit", "25 masak".
    static func minutes(_ q: String) -> (minutes: Int, label: String)? {
        guard let re = try? NSRegularExpression(pattern: "^(\\d{1,3})\\s*(?:(?:m|mnt|menit)(?![a-z]))?\\s*(.*)$"),
              let m = re.firstMatch(in: q, range: NSRange(q.startIndex..., in: q)),
              let r1 = Range(m.range(at: 1), in: q), let n = Int(q[r1]), n >= 1, n <= 600 else { return nil }
        let label = Range(m.range(at: 2), in: q).map { String(q[$0]).trimmingCharacters(in: .whitespaces) } ?? ""
        return (n, label)
    }

    /// A clock time, with anything after it as a label: "6", "6.30", "07:30 bangun".
    static func clockTime(_ q: String) -> (hour: Int, minute: Int, label: String)? {
        guard let re = try? NSRegularExpression(pattern: "^(\\d{1,2})(?:[.:](\\d{2}))?(?![\\d])\\s*(.*)$"),
              let m = re.firstMatch(in: q, range: NSRange(q.startIndex..., in: q)),
              let hr = Range(m.range(at: 1), in: q), let h = Int(q[hr]), h < 24 else { return nil }
        var minute = 0
        if let mr = Range(m.range(at: 2), in: q) { minute = Int(q[mr]) ?? 0 }
        guard minute < 60 else { return nil }
        let label = Range(m.range(at: 3), in: q).map { String(q[$0]).trimmingCharacters(in: .whitespaces) } ?? ""
        return (h, minute, label)
    }

    static func clock(_ s: Double) -> String {
        let t = max(0, Int(s.rounded(.up)))
        return t >= 3600 ? String(format: "%d:%02d:%02d", t / 3600, (t % 3600) / 60, t % 60) : String(format: "%02d:%02d", t / 60, t % 60)
    }

    static func tilde(_ url: URL) -> String {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        return url.path.hasPrefix(home) ? "~" + url.path.dropFirst(home.count) : url.path
    }
}

// Spotify playlists, albums and artists saved by pasting their link into the search.
final class Favorites {
    struct Item: Codable { var name: String; let uri: String }
    private(set) var items: [Item] = []
    private let key = "spotifyFavorites"

    init() {
        if let d = UserDefaults.standard.data(forKey: key), let list = try? JSONDecoder().decode([Item].self, from: d) { items = list }
    }

    /// open.spotify.com/playlist/ID?si=… or spotify:playlist:ID → spotify:playlist:ID
    static func uri(from text: String) -> String? {
        let t = text.trimmingCharacters(in: .whitespaces)
        guard let re = try? NSRegularExpression(pattern: "(?:open\\.spotify\\.com/(?:intl-[a-z]+/)?|spotify:)(playlist|album|artist|track)[/:]([A-Za-z0-9]{10,})") else { return nil }
        guard let m = re.firstMatch(in: t, range: NSRange(t.startIndex..., in: t)),
              let a = Range(m.range(at: 1), in: t), let b = Range(m.range(at: 2), in: t) else { return nil }
        return "spotify:\(t[a]):\(t[b])"
    }

    func add(_ uri: String) {
        guard !items.contains(where: { $0.uri == uri }) else { return }
        let parts = uri.split(separator: ":")
        items.append(Item(name: parts.count > 1 ? String(parts[1]) : "Spotify", uri: uri))
        save()
        // the real name from Spotify's public oEmbed endpoint
        guard parts.count == 3, let url = URL(string: "https://open.spotify.com/oembed?url=https://open.spotify.com/\(parts[1])/\(parts[2])") else { return }
        URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            guard let data, let j = try? JSONSerialization.jsonObject(with: data) as? [String: Any], let title = j["title"] as? String else { return }
            DispatchQueue.main.async {
                guard let self, let i = self.items.firstIndex(where: { $0.uri == uri }) else { return }
                self.items[i].name = title
                self.save()
            }
        }.resume()
    }

    func remove(_ uri: String) { items.removeAll { $0.uri == uri }; save() }

    private func save() { UserDefaults.standard.set(try? JSONEncoder().encode(items), forKey: key) }
}
