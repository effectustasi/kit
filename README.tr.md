# kit

**Claude Code araç kutun, tek bakışta.** Kurduğun tüm skill, plugin ve MCP sunucularını gör: bu sohbette hangisi aktif, bağlamda ne kadar yer kaplıyor. Hepsini tek tuşla aç ya da kapat.

[English](README.md)

Skill'leri, plugin'leri ve MCP sunucularını tek tek kurarsın. Bir süre sonra neyin yüklü olduğunu, context penceresini neyin doldurduğunu ve neyi hiç kullanmadığını takip edemez olursun. kit, bunların hepsini tek bir panelde toplayan bir Claude Code mod'udur. İçinde küçük bir App Store da var: GitHub'da yeni eklentiler bulursun ve kurulum, hiçbir şey çalışmadan önce tam olarak neler yapacağını gösterir.

## Neler var

- **Kurduğun her şey için tek panel.** Plugin'ler, kişisel skill'ler ve MCP sunucuları, her biri GitHub sahibinin yuvarlak avatarıyla görünür.
- **Görünür context maliyeti.** Her öğenin bu sohbette kaç token tuttuğu ve toplamın context penceresine oranı.
- **Tek tuşla aç/kapat.** Bir skill'i, plugin'i ya da MCP sunucusunu kaybetmeden kapat, sonra aynen geri aç.
- **Kullanım takibi.** kit, Claude'un her öğeyi gerçekte kaç kez kullandığını sayar. Token harcayıp 14+ gündür kullanılmayanları sana gösterir.
- **Güncellemeler.** Bir plugin'in marketplace'inde yeni sürüm çıktığında rozet çıkar, tek tuşla güncellersin.
- **GitHub'dan keşfet ve kur.** Top Charts ve arama, küçük bir App Store gibi çalışır. Her kurulum önce planını ve güvenlik uyarılarını gösterir.
- **Prompt'un üstünde bir dock.** Hiçbir şey açmadan neyin aktif olduğunu bir bakışta gösterir.

## Kurulum

```sh
claude plugin marketplace add effectustasi/kit
claude plugin install kit@kit
```

Sonra `/reload-plugins` çalıştır (ya da yeni oturum aç) ve `/kit` yaz.

**Gereksinimler**

- Mod'ları (function-hook plugin'leri) destekleyen bir Claude Code sürümü. kit, 2.1.286'da geliştirildi ve test edildi.
- Giriş yapılmış [GitHub CLI](https://cli.github.com/) (`gh`). Yalnızca arama, kurulum, açıklamalar ve güncelleme kontrolü için gerekir.
- Avatarları indirmek için `curl`. Windows 10+, macOS ve çoğu Linux dağıtımında hazır gelir.

## Kullanım kılavuzu

### Panel: `/kit`

`/kit`, **Kit** panelini açar. En üstteki satır `12.4k tokens in context · 1% of 1.0M` gibi görünür: kurulu öğelerinin bu sohbette tuttuğu token ve bunun context penceresine oranı. Yeniden taramak için **Refresh**'e (ya da `r`'ye) bas.

Kurulu her öğenin yuvarlak bir avatarı var. Etrafındaki halka öğenin durumunu söyler:

| Halka | Anlamı |
| --- | --- |
| Renkli story halkası | **Aktif**: bu sohbette yüklü, şu an token harcıyor |
| İnce gri halka | **Açık**: kurulu ve etkin, ama bu sohbette yüklü değil |
| Halka yok, soluk | **Kapalı**: kit ile kapatılmış |

Bir avatarın üzerine gelince öğenin ne yaptığını ve ne sıklıkla kullanıldığını görürsün. Yerleşik uygulama sunucularını ve claude.ai connector'larını kit açıp kapatamaz, bu yüzden bunlar ızgaranın altında tek satırda toplanır.

### Detay kartı

Bir öğenin adına basınca kartı açılır. Kartta şunlar var:

- öğenin türü, kaynak reposu, durumu ve token maliyeti
- `plugin.json`'dan, `SKILL.md` frontmatter'ından ya da GitHub repo açıklamasından alınan bir açıklama
- kullanım, örneğin `Used 12× · last yesterday`
- öğe açıksa, token harcıyorsa ve 14+ gündür kullanılmamışsa turuncu bir uyarı

Şu düğmeler de var:

- **Turn Off / Turn On**:
  - Plugin'ler için `claude plugin disable/enable` kullanılır.
  - Skill'ler `~/.claude/skills` ile `~/.claude/kit-off/skills` arasında taşınır.
  - Kullanıcı kapsamındaki MCP sunucularının tanımı olduğu gibi `~/.claude/kit-off/mcp.json`'a park edilir. Geri açınca aynı tanım değişmeden geri yüklenir.
- **Remove…** önce onay sorar. Plugin, Claude Code'un kendi `claude plugin uninstall` komutuyla kaldırılır. Skill klasörü ya da MCP tanımı silinmez, `~/.claude/kit-off/removed/`'a taşınır. Yanlışlık olursa elle geri alabilirsin.
- **Update**, plugin'in marketplace'i seninkinden yeni bir sürüm yayınladığında görünür. Önce marketplace'i yeniler, sonra `claude plugin update` çalıştırır.

Her değişiklikten sonra uygulamak için `/reload-plugins` çalıştır. MCP sunucusu değişiklikleri yeni oturumda geçerli olur.

### Keşfet ve kur

Izgaranın altındaki arama kutusu iki tür giriş alır:

- **Bir kelime** (`blender`, `postgres`, `notes`): GitHub'da Claude Code skill'leri, plugin'leri ve MCP sunucularını arar, yıldıza göre sıralar.
- **`owner/repo` ya da github.com linki**: doğrudan kurulum kontrolüne gider.

Arama kutusu boşken **Top Charts** en çok yıldız almış kurulabilir eklentileri listeler. `awesome-*` listelerini atlar, çünkü onlar kurulacak bir şey değil, eklenti listesidir.

**Get**'e basmak tek başına hiçbir şey kurmaz. kit repoyu inceler ve şunları gösteren bir kart açar:

- eklentinin türü ve ne kuracağı
- **çalıştıracağı komutların tam listesi**, sırasıyla
- ikinci kez bakmaya değer uyarılar: repo **arşivlenmiş**, **bir yıldan uzun süredir commit almamış** ya da **lisanssız**

Bu komutları yalnızca **Install** çalıştırır. kit dört tür repoyu tanır:

| Repoda bu varsa | kit şunu çalıştırır |
| --- | --- |
| `.claude-plugin/marketplace.json` | `claude plugin marketplace add` + `claude plugin install` |
| `SKILL.md` içeren bir klasör | sığ bir `git clone`, sonra her skill klasörünü `~/.claude/skills`'e kopyalar |
| npm'de yayınlanmış bir MCP sunucusu | `claude mcp add … -- npx -y <paket>` |
| Python MCP sunucusu (`pyproject.toml`) | `claude mcp add … -- uvx --from git+https://github.com/<repo> <script>` |

### Dock

Prompt'un üstünde küçük bir tutamaç durur: `◖ kit · 3 active`. Üzerine gelince kurulu öğelerinin ikonları açılır. Bir ikonun üzerine gelince adı, durumu, maliyeti ve açıklaması görünür. **Open**, tam panele geçer.

### Metin özeti

`/kit` ayrıca transcript'e kısa bir metin özeti yazar, örneğin:

```
Kit: 12.4k tok always-on of 1.0M.
Plugins 2/2 on: ponytail 906, ...
Skills 2/2 on: agent-reach 312, graphify 122
MCP servers 4/5 on: serena 3.1k, context7, inventor (off) | +6 app/connector servers 2.0k
```

## kit verilerini nerede tutar

Her şey kendi bilgisayarında kalır:

| Yol | Ne |
| --- | --- |
| `~/.claude/kit-off/skills/` | kapattığın skill'ler |
| `~/.claude/kit-off/mcp.json` | kapattığın MCP sunucu tanımları |
| `~/.claude/kit-off/removed/` | kaldırılan skill'ler ve MCP tanımları (geri taşıyarak geri alınır) |
| `~/.claude/kit-off/sources.json` | her öğenin geldiği GitHub reposu |
| `~/.claude/kit-off/avatars/` | önbelleğe alınmış avatarlar ve repo kapakları |
| Claude Code plugin deposu (`~/.claude/plugins/store/`) | kullanım sayıları |

## Gizlilik

kit'in sunucusu yok ve telemetri göndermez. Kullanım sayıları yerelde tutulur. Yaptığı tek ağ çağrıları:

- kendi `gh` CLI'n üzerinden GitHub: arama, repo bilgisi, açıklamalar ve güncelleme kontrolü
- GitHub avatarlarını ve repo kapaklarını indirmek için `curl`
- bir MCP paketinin yayınlanmış olup olmadığını kontrol etmek için npm registry

## Platform notları

kit Windows'ta geliştiriliyor. Bazı özellikler şu an Windows araçlarına dayanıyor:

- **Skill'leri** açıp kapatırken ve kaldırırken klasörler Windows'ta `cmd /c move` ile, diğer sistemlerde `mv` ile taşınır.
- Skill kurulumu Windows'ta `xcopy` ile, diğer sistemlerde `cp -R` ile kopyalar.
- Kurulum kartındaki **repo kapak görselleri** PowerShell'in `System.Drawing`'i ile boyutlandırılır. Bu yüzden macOS ve Linux'ta kartta kapak görünmez.

macOS ve Linux'ta test ve düzeltme katkıları çok makbule geçer. Katkı bölümüne bak.

## Katkı

Issue'lar ve pull request'ler açıktır. Mod'un tamamı tek dosya: [`hooks/register.tsx`](hooks/register.tsx). Tipleri [`types/index.d.ts`](types/index.d.ts) içinde.

```sh
claude plugin validate .   # manifest'i ve hook'ları motorun yapacağı gibi kontrol eder
claude plugin test .       # tests/kit.test.tsx'i masaüstü ve terminal yüzeylerinde çalıştırır
```

Canlı bir oturumda geliştirmek için kopyanı `claude --plugin-dir <kit-yolu>` ile yükle.

## Lisans

[MIT](LICENSE) © effectustasi
