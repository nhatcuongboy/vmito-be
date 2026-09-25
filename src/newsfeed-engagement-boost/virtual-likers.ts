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
  'Nguyễn Văn Hùng',
  'Trần Thị Mai',
  'Lê Minh Tuấn',
  'Phạm Thu Trang',
  'Hoàng Đức Anh',
  'Vũ Ngọc Lan',
  'Đặng Quốc Bảo',
  'Bùi Thị Hương',
  'Đỗ Thanh Tùng',
  'Hồ Thị Ngọc',
  'Ngô Văn Nam',
  'Dương Thùy Linh',
  'Lý Hoàng Long',
  'Nguyễn Thị Thảo',
  'Trần Quang Huy',
  'Lê Thị Hồng',
  'Phạm Minh Khoa',
  'Hoàng Thị Yến',
  'Vũ Đình Phúc',
  'Đặng Thị Hà',
  'Bùi Văn Thắng',
  'Đỗ Thị Phương',
  'Hồ Minh Trí',
  'Ngô Thị Bích',
  'Dương Văn Lâm',
  'Lý Thị Kim',
  'Nguyễn Hữu Phước',
  'Trần Ngọc Ánh',
  'Lê Văn Đạt',
  'Phạm Thị Loan',
  'Hoàng Minh Quân',
  'Vũ Thị Thu',
  'Đặng Văn Khải',
  'Bùi Ngọc Diệp',
  'Đỗ Minh Hiếu',
  'Hồ Thị Tuyết',
  'Ngô Quốc Việt',
  'Dương Thị Nhung',
  'Lý Văn Tài',
  'Nguyễn Khánh Linh',
  'Trần Văn Sơn',
  'Lê Ngọc Hân',
  'Phạm Quốc Cường',
  'Hoàng Thị Lan Anh',
  'Vũ Văn Toàn',
  'Đặng Ngọc Mai',
  'Bùi Minh Nhật',
  'Đỗ Thị Quỳnh',
  'Hồ Văn Thành',
  'Ngô Thị Thanh Tâm',
  'Dương Minh Đức',
  'Lý Thị Hạnh',
  'Nguyễn Tiến Dũng',
  'Trần Thị Kiều',
  'Lê Hoàng Phúc',
  'Phạm Ngọc Trâm',
  'Hoàng Văn Tâm',
  'Vũ Thị Hoa',
  'Đặng Minh Luân',
  'Bùi Thị Thanh',
  'Đỗ Văn Hải',
  'Hồ Ngọc Vy',
  'Ngô Minh Hoàng',
  'Dương Thị Hằng',
  'Lý Quốc Thịnh',
  'Nguyễn Thị Diễm',
  'Trần Minh Nhựt',
  'Lê Thị Như',
  'Phạm Văn Lộc',
  'Hoàng Ngọc Châu',
  'Vũ Minh Tâm',
  'Đặng Thị Xuân',
  'Bùi Quang Vinh',
  'Đỗ Ngọc Hiền',
  'Hồ Văn Nghĩa',
  'Ngô Thị Mỹ',
  'Dương Quốc Khánh',
  'Lý Ngọc Trinh',
  'Nguyễn Minh Thiện',
  'Trần Thị Uyên',
  'Lê Văn Kiên',
  'Phạm Thị Duyên',
  'Hoàng Quốc Trung',
  'Vũ Ngọc Hà',
  'Đặng Văn Tiến',
  'Bùi Thị Nga',
  'Đỗ Hoàng Nam',
  'Hồ Thị Thủy',
  'Ngô Văn Hậu',
  'Dương Ngọc Bích',
  'Lý Minh Khang',
  'Nguyễn Thị Vân',
  'Trần Đức Thịnh',
  'Lê Thị Ngân',
  'Phạm Hoàng Sơn',
  'Hoàng Thị Tuyết Mai',
  'Vũ Quốc Hưng',
  'Đặng Thị Oanh',
  'Bùi Văn Quý',
  'Đỗ Thị Hải Yến',
  'Hồ Quang Minh',
  'Ngô Ngọc Thảo',
  'Dương Văn Hòa',
  'Lý Thị Thanh Hương',
  'Nguyễn Công Danh',
  'Trần Ngọc Quỳnh',
  'Lê Minh Hải',
  'Phạm Thị Hoài',
  'Hoàng Văn Phong',
  'Vũ Thị Hồng Nhung',
  'Đặng Quang Hiếu',
  'Bùi Thị Lụa',
  'Đỗ Văn Quang',
  'Hồ Ngọc Anh',
  'Ngô Đức Tài',
  'Dương Thị Ly',
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
