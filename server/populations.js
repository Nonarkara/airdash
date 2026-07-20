// Registered (DOPA) population per province, in persons, rounded to the
// nearest 5,000. Keyed by DOPA province code (string, 10–96) matching
// server/provinces.js. Source: Thailand DOPA household registration
// statistics (ทะเบียนราษฎร กรมการปกครอง), rounded — used for
// population-weighted national health/economic aggregates in the Science
// engine, never for per-capita claims that need exact census figures.
export const PROVINCE_POP = {
  '10': 5_490_000, // กรุงเทพมหานคร Bangkok
  '11': 1_340_000, // สมุทรปราการ Samut Prakan
  '12': 1_290_000, // นนทบุรี Nonthaburi
  '13': 1_180_000, // ปทุมธานี Pathum Thani
  '14': 810_000,   // พระนครศรีอยุธยา Phra Nakhon Si Ayutthaya
  '15': 275_000,   // อ่างทอง Ang Thong
  '16': 740_000,   // ลพบุรี Lopburi
  '17': 200_000,   // สิงห์บุรี Sing Buri
  '18': 320_000,   // ชัยนาท Chai Nat
  '19': 640_000,   // สระบุรี Saraburi
  '20': 1_570_000, // ชลบุรี Chonburi
  '21': 740_000,   // ระยอง Rayong
  '22': 540_000,   // จันทบุรี Chanthaburi
  '23': 225_000,   // ตราด Trat
  '24': 715_000,   // ฉะเชิงเทรา Chachoengsao
  '25': 490_000,   // ปราจีนบุรี Prachinburi
  '26': 260_000,   // นครนายก Nakhon Nayok
  '27': 560_000,   // สระแก้ว Sa Kaeo
  '30': 2_630_000, // นครราชสีมา Nakhon Ratchasima
  '31': 1_570_000, // บุรีรัมย์ Buriram
  '32': 1_370_000, // สุรินทร์ Surin
  '33': 1_440_000, // ศรีสะเกษ Sisaket
  '34': 1_860_000, // อุบลราชธานี Ubon Ratchathani
  '35': 530_000,   // ยโสธร Yasothon
  '36': 1_120_000, // ชัยภูมิ Chaiyaphum
  '37': 375_000,   // อำนาจเจริญ Amnat Charoen
  '38': 425_000,   // บึงกาฬ Bueng Kan
  '39': 510_000,   // หนองบัวลำภู Nong Bua Lam Phu
  '40': 1_780_000, // ขอนแก่น Khon Kaen
  '41': 1_570_000, // อุดรธานี Udon Thani
  '42': 635_000,   // เลย Loei
  '43': 520_000,   // หนองคาย Nong Khai
  '44': 950_000,   // มหาสารคาม Maha Sarakham
  '45': 1_290_000, // ร้อยเอ็ด Roi Et
  '46': 975_000,   // กาฬสินธุ์ Kalasin
  '47': 1_140_000, // สกลนคร Sakon Nakhon
  '48': 715_000,   // นครพนม Nakhon Phanom
  '49': 350_000,   // มุกดาหาร Mukdahan
  '50': 1_680_000, // เชียงใหม่ Chiang Mai
  '51': 405_000,   // ลำพูน Lamphun
  '52': 735_000,   // ลำปาง Lampang
  '53': 450_000,   // อุตรดิตถ์ Uttaradit
  '54': 435_000,   // แพร่ Phrae
  '55': 475_000,   // น่าน Nan
  '56': 465_000,   // พะเยา Phayao
  '57': 1_290_000, // เชียงราย Chiang Rai
  '58': 285_000,   // แม่ฮ่องสอน Mae Hong Son
  '60': 1_045_000, // นครสวรรค์ Nakhon Sawan
  '61': 325_000,   // อุทัยธานี Uthai Thani
  '62': 715_000,   // กำแพงเพชร Kamphaeng Phet
  '63': 665_000,   // ตาก Tak
  '64': 590_000,   // สุโขทัย Sukhothai
  '65': 865_000,   // พิษณุโลก Phitsanulok
  '66': 530_000,   // พิจิตร Phichit
  '67': 985_000,   // เพชรบูรณ์ Phetchabun
  '70': 850_000,   // ราชบุรี Ratchaburi
  '71': 885_000,   // กาญจนบุรี Kanchanaburi
  '72': 835_000,   // สุพรรณบุรี Suphan Buri
  '73': 920_000,   // นครปฐม Nakhon Pathom
  '74': 585_000,   // สมุทรสาคร Samut Sakhon
  '75': 190_000,   // สมุทรสงคราม Samut Songkhram
  '76': 475_000,   // เพชรบุรี Phetchaburi
  '77': 550_000,   // ประจวบคีรีขันธ์ Prachuap Khiri Khan
  '80': 1_550_000, // นครศรีธรรมราช Nakhon Si Thammarat
  '81': 475_000,   // กระบี่ Krabi
  '82': 270_000,   // พังงา Phang Nga
  '83': 425_000,   // ภูเก็ต Phuket
  '84': 1_070_000, // สุราษฎร์ธานี Surat Thani
  '85': 190_000,   // ระนอง Ranong
  '86': 505_000,   // ชุมพร Chumphon
  '90': 1_420_000, // สงขลา Songkhla
  '91': 325_000,   // สตูล Satun
  '92': 635_000,   // ตรัง Trang
  '93': 520_000,   // พัทลุง Phatthalung
  '94': 730_000,   // ปัตตานี Pattani
  '95': 540_000,   // ยะลา Yala
  '96': 810_000,   // นราธิวาส Narathiwat
}

/** Total registered population of Thailand (sum over the 77 provinces). */
export const THAILAND_POP = Object.values(PROVINCE_POP).reduce((a, b) => a + b, 0)
