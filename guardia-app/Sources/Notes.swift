import Foundation

// The notes chalked on the board in the room. Written in the island (Catatan) and kept as plain
// text in ~/.guardia/notes.txt: a line per point; "- " makes a bullet, "x " one that is done,
// "# " a heading. Saved a moment after typing stops.
final class Notes {
    static let url = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".guardia/notes.txt")
    private(set) var text: String
    var onChange: ((String) -> Void)?
    private var saveWork: DispatchWorkItem?

    init() { text = (try? String(contentsOf: Notes.url, encoding: .utf8)) ?? "" }

    func set(_ t: String) {
        guard t != text else { return }
        text = t
        onChange?(t)
        saveWork?.cancel()
        let work = DispatchWorkItem { Notes.write(t) }
        saveWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4, execute: work)
    }

    /// Write now (closing the editor, quitting).
    func flush() {
        guard let w = saveWork else { return }
        w.cancel(); saveWork = nil
        Notes.write(text)
    }

    private static func write(_ t: String) {
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? t.write(to: url, atomically: true, encoding: .utf8)
    }
}
