export interface VirtualLiker {
  id: string;
  name: string;
  image: null;
  isVirtual: true;
}

// Engagement-boost likes are only a counter, so the likers list shows names
// drawn from this pool. The pool must stay far larger than the 9-like boost
// ceiling so a post never lists the same name twice.
const VIRTUAL_LIKER_NAMES = [
  // Full formal names
  'Nguyễn Văn Hùng',
  'Trần Thị Mai',
  'Lê Minh Tuấn',
  'Phạm Thu Trang',
  'Hoàng Đức Anh',
  'Bùi Thị Hương',
  'Đỗ Thanh Tùng',
  'Ngô Văn Nam',
  'Lý Hoàng Long',
  'Trần Quang Huy',
  'Phạm Minh Khoa',
  'Vũ Đình Phúc',
  'Bùi Văn Thắng',
  'Hồ Minh Trí',
  'Dương Văn Lâm',
  'Nguyễn Hữu Phước',
  'Lê Văn Đạt',
  'Hoàng Minh Quân',
  'Đặng Văn Khải',
  'Đỗ Minh Hiếu',
  'Ngô Quốc Việt',
  'Lý Văn Tài',
  'Trần Văn Sơn',
  'Phạm Quốc Cường',
  'Vũ Văn Toàn',
  'Bùi Minh Nhật',
  'Hồ Văn Thành',
  'Dương Minh Đức',
  'Nguyễn Tiến Dũng',
  'Lê Hoàng Phúc',
  'Hoàng Văn Tâm',
  'Đặng Minh Luân',
  'Đỗ Văn Hải',
  'Ngô Minh Hoàng',
  'Phạm Văn Lộc',
  'Vũ Minh Tâm',
  'Bùi Quang Vinh',
  'Hồ Văn Nghĩa',
  'Dương Quốc Khánh',
  'Nguyễn Minh Thiện',
  'Lê Văn Kiên',
  'Hoàng Quốc Trung',
  'Đặng Văn Tiến',
  'Đỗ Hoàng Nam',
  'Ngô Văn Hậu',
  'Lý Minh Khang',
  'Trần Đức Thịnh',
  'Phạm Hoàng Sơn',
  'Vũ Quốc Hưng',
  'Bùi Văn Quý',
  'Hồ Quang Minh',
  'Dương Văn Hòa',
  'Nguyễn Công Danh',
  'Lê Minh Hải',
  'Hoàng Văn Phong',
  'Đặng Quang Hiếu',
  'Đỗ Văn Quang',
  'Ngô Đức Tài',
  // Short / 2-part names (tên ngắn, không có họ)
  'Minh Tuấn',
  'Quốc Huy',
  'Bảo Long',
  'Anh Khoa',
  'Gia Huy',
  'Thanh Bình',
  'Hoàng Nam',
  'Minh Đức',
  'Quang Khải',
  'Đức Thịnh',
  'Tuấn Anh',
  'Khánh Linh',
  'Bích Ngọc',
  'Thùy Dương',
  'Ngọc Trâm',
  'Lan Anh',
  'Thanh Tâm',
  'Ngọc Hân',
  'Hồng Nhung',
  'Thu Hà',
  'Bảo Châu',
  'Kim Ngân',
  'Diễm My',
  'Xuân Mai',
  'Ngọc Ánh',
  'Hải Đăng',
  'Trúc Lâm',
  'Minh Châu',
  // Nicknames / informal single-word names (tên nick)
  'Tiến',
  'Hùng',
  'Bảo',
  'Nam',
  'Đạt',
  'Huy',
  'Phúc',
  'Quân',
  'Tài',
  'Khoa',
  'Linh',
  'Mai',
  'Lan',
  'Ngọc',
  'Thảo',
  'Hà',
  'Yến',
  'Hoa',
  'Nhung',
  'Trinh',
  'Vy',
  'Nhi',
  'Tú',
  'Khôi',
  'Hậu',
  // Western-influenced / mixed names (tên Tây hoá)
  'Kevin Tuấn',
  'Tony Minh',
  'Tommy Hùng',
  'Andy Đức',
  'Alex Bảo',
  'Daniel Nam',
  'Kenny Khoa',
  'David Phúc',
  'Jason Huy',
  'Jenny Linh',
  'Tina Ngọc',
  'Cindy Mai',
  'Lily Lan',
  'Sandy Thảo',
  'Anna Hà',
  'Lisa Ngân',
  'Kelly Trinh',
  'Wendy Hoa',
];

/**
 * Virtual likers for a post, deterministic in `postId`.
 *
 * The pool is shuffled with a PRNG seeded from the post id and the first
 * `count` names taken, so the list is identical on every request and grows
 * append-only as the boost counter rises (3 → 4 keeps the first 3 names).
 */
export function buildVirtualLikers(
  postId: string,
  count: number
): VirtualLiker[] {
  if (count <= 0) return [];
  const random = mulberry32(fnv1a(postId));
  const names = [...VIRTUAL_LIKER_NAMES];
  for (let index = names.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [names[index], names[swap]] = [names[swap], names[index]];
  }
  return names.slice(0, Math.min(count, names.length)).map((name, index) => ({
    id: `virtual-${postId}-${index}`,
    name,
    image: null,
    isVirtual: true,
  }));
}

function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
