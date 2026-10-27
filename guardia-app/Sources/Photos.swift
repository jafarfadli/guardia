import AppKit
import ImageIO
import UniformTypeIdentifiers

// The five frames on the photo shelves in the room (blender/kamar/props.py FRAMES, in that
// order). A photo chosen in the island's Rak foto is turned upright, scaled down, and faded a
// little toward the room's cream, a print in an old room rather than a screen; it is kept in
// ~/.guardia/photos and reaches the wallpaper as a data: URL. A frame without one shows a
// drawing (wallpaper/src/widgets.js DRAWINGS).
final class Photos {
    static let count = 5
    static let places = ["rak bawah, kiri", "rak bawah, kanan", "rak tengah, kiri", "rak tengah, kanan", "rak atas"]
    struct Slot: Codable { var name: String; var file: String }

    var onChange: (([String?]) -> Void)?
    private(set) var slots: [Slot?] = Array(repeating: nil, count: Photos.count)
    private let dir = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".guardia/photos")
    private var index: URL { dir.appendingPathComponent("photos.json") }
    private var cache: [String: String] = [:]

    init() {
        if let d = try? Data(contentsOf: index), let s = try? JSONDecoder().decode([Slot?].self, from: d) {
            for (i, v) in s.prefix(Photos.count).enumerated() { slots[i] = v }
        }
    }

    /// One data: URL per frame (nil: the drawing).
    var urls: [String?] {
        slots.map { slot in
            guard let slot else { return nil }
            if let u = cache[slot.file] { return u }
            guard let d = try? Data(contentsOf: dir.appendingPathComponent(slot.file)) else { return nil }
            let u = "data:image/jpeg;base64," + d.base64EncodedString()
            cache[slot.file] = u
            return u
        }
    }

    /// Ask for a picture for frame `i` (the open panel needs Guardia in front for a moment).
    func choose(_ i: Int) {
        let panel = NSOpenPanel()
        panel.title = "Foto untuk bingkai \(i + 1) (\(Photos.places[i]))"
        panel.prompt = "Pasang"
        panel.allowedContentTypes = [.image]
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        NSApp.activate(ignoringOtherApps: true)
        panel.begin { [weak self] response in
            guard response == .OK, let url = panel.url else { return }
            self?.set(i, from: url)
        }
    }

    @discardableResult
    func set(_ i: Int, from url: URL) -> Bool {
        guard i >= 0, i < Photos.count, let jpeg = Photos.print(url) else { return false }
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        // a new file name each time, so the page sees a new picture
        let file = "frame\(i + 1)-\(Int(Date().timeIntervalSince1970)).jpg"
        guard (try? jpeg.write(to: dir.appendingPathComponent(file))) != nil else { return false }
        if let old = slots[i] { try? FileManager.default.removeItem(at: dir.appendingPathComponent(old.file)); cache[old.file] = nil }
        slots[i] = Slot(name: url.lastPathComponent, file: file)
        save()
        return true
    }

    func clear(_ i: Int) {
        guard i >= 0, i < Photos.count, let old = slots[i] else { return }
        try? FileManager.default.removeItem(at: dir.appendingPathComponent(old.file))
        cache[old.file] = nil
        slots[i] = nil
        save()
    }

    private func save() {
        if let d = try? JSONEncoder().encode(slots) { try? d.write(to: index) }
        onChange?(urls)
    }

    /// Upright, at most 640 px across, a touch less colour and a little cream: a JPEG.
    static func print(_ url: URL) -> Data? {
        guard let src = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
        let opts: [CFString: Any] = [kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceCreateThumbnailWithTransform: true,
                                     kCGImageSourceThumbnailMaxPixelSize: 640]
        guard let img = CGImageSourceCreateThumbnailAtIndex(src, 0, opts as CFDictionary) else { return nil }
        let w = img.width, h = img.height
        guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue), let raw = ctx.data else { return nil }
        ctx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
        let px = raw.bindMemory(to: UInt8.self, capacity: w * h * 4)
        let cream: [Double] = [226, 209, 174]
        for i in 0..<(w * h) {
            let o = i * 4
            let r = Double(px[o]), g = Double(px[o + 1]), b = Double(px[o + 2])
            let l = 0.299 * r + 0.587 * g + 0.114 * b
            for (k, v) in [r, g, b].enumerated() {
                let grey = v + (l - v) * 0.15
                px[o + k] = UInt8(max(0, min(255, grey + (cream[k] - grey) * 0.1)))
            }
        }
        guard let out = ctx.makeImage() else { return nil }
        let data = NSMutableData()
        guard let dest = CGImageDestinationCreateWithData(data, UTType.jpeg.identifier as CFString, 1, nil) else { return nil }
        CGImageDestinationAddImage(dest, out, [kCGImageDestinationLossyCompressionQuality: 0.84] as CFDictionary)
        return CGImageDestinationFinalize(dest) ? data as Data : nil
    }
}
