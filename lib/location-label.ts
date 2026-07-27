type LocationReference = {
  id: string;
  name: string;
};

const LOCATION_TERMS: Record<string, string> = {
  abandoned: "废弃",
  ancient: "古老",
  bridge: "桥",
  castle: "城堡",
  cathedral: "大教堂",
  cave: "洞穴",
  cemetery: "墓地",
  central: "中央",
  church: "教堂",
  city: "城市",
  district: "城区",
  dungeon: "地牢",
  east: "东部",
  forest: "森林",
  gate: "城门",
  graveyard: "墓园",
  hall: "大厅",
  harbor: "港湾",
  hidden: "隐秘",
  hideout: "藏身处",
  home: "住所",
  hospital: "医院",
  house: "屋",
  inn: "旅店",
  lab: "实验室",
  laboratory: "实验室",
  lower: "下层",
  manor: "庄园",
  market: "市场",
  mine: "矿井",
  new: "新",
  north: "北部",
  office: "办公室",
  old: "旧",
  outer: "外围",
  palace: "宫殿",
  port: "港口",
  prison: "监牢",
  road: "道路",
  room: "房间",
  ruins: "遗迹",
  safe: "安全",
  safehouse: "安全屋",
  sanctuary: "避难所",
  school: "学校",
  shop: "商店",
  south: "南部",
  square: "广场",
  station: "车站",
  street: "街道",
  tavern: "酒馆",
  temple: "神殿",
  tower: "高塔",
  town: "城镇",
  underground: "地下",
  upper: "上层",
  village: "村庄",
  west: "西部",
};

export function displayLocationName(
  locationId: string,
  locations: LocationReference[],
) {
  const id = locationId.trim();
  const configuredName = locations
    .find((location) => location.id === id)
    ?.name.trim();
  if (configuredName) return configuredName;
  if (!id) return "未知地点";
  if (/[\u3400-\u9fff]/u.test(id)) return id;

  const tokens = id
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const translated = tokens.map((token) => LOCATION_TERMS[token]);
  if (translated.length && translated.every(Boolean)) {
    return translated.join("");
  }
  return "未命名地点";
}
